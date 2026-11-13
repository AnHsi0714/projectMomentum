import { DAY_NAMES, DAY_THEME, SCHEDULE } from '../config/schedule';
import { HABITS, MODES } from '../config/habits';
import { KIND_OF, KINDS } from '../config/kinds';
import { modeOf, weeklyCount } from '../lib/habits';
import { data } from '../lib/store';
import { currentInfo, dkey, esc, fmtDur, fmtMD, isToday, toMin, weekDates, type CurrentInfo } from '../lib/time';
import { state } from '../state';
import type { BlockType, ModeId } from '../types';
import { rangeHtml, viewHead, weekNav } from './parts';

/** 上一次畫出的「現在」狀態，用來判斷這一分鐘需不需要整塊重畫 */
let lastSig = '';

const signature = (info: CurrentInfo) => (info.state === 'in' ? `in:${info.idx}` : info.state);
const progress = (m: number, s: number, e: number) => Math.round(((m - s) / (e - s)) * 100);
const elapsedText = (m: number, s: number) => `已進行 ${fmtDur(m - s)}`;

/** 恢復模式會取消運動時段 */
const isCanceled = (mode: ModeId, type: BlockType) => mode === 'recover' && type === 'exercise';

/** 主視覺的內容：現在是哪個時段、還剩多久、接著是什麼 */
export function heroHtml(now: Date, mode: ModeId): string {
  const info = currentInfo(now);
  if (info.state === 'in') {
    const cur = info.blocks[info.idx];
    const s = toMin(cur[0]);
    const e = toMin(cur[1]);
    const nxt = info.blocks[info.idx + 1];
    const canceled = isCanceled(mode, cur[3]);
    // 被取消的時段和時間表一樣：加「取消」標記，標題劃線，不再上螢光筆
    return `<p class="hero-eyebrow">現在${canceled ? '<span class="badge">取消</span>' : ''}</p>
      <h2 class="hero-title kind-${KIND_OF[cur[3]]}${canceled ? ' is-canceled' : ''}">${cur[2]}</h2>
      <p class="hero-time">${rangeHtml(cur[0], cur[1])}</p>
      <p class="hero-count"><span class="hero-count-label">還剩</span> <span class="hero-count-value">${fmtDur(e - info.m)}</span></p>
      <div class="hero-meter" aria-hidden="true"><i style="width:${progress(info.m, s, e)}%"></i></div>
      <div class="hero-foot">
        <p class="hero-meta">${elapsedText(info.m, s)}</p>
        <p class="hero-next">${nxt ? `接著 <b>${nxt[0]}</b> ${nxt[2]}` : '接著 <b>23:00</b> 就寢'}</p>
      </div>`;
  }
  if (info.state === 'before') {
    const first = info.blocks[0];
    return `<p class="hero-eyebrow">尚未開始</p>
      <h2 class="hero-title">起床前</h2>
      <div class="hero-foot"><p class="hero-next">${fmtDur(toMin(first[0]) - info.m)}後 <b>${first[0]}</b> ${first[2]}</p></div>`;
  }
  return `<p class="hero-eyebrow">今日時程已結束</p>
    <h2 class="hero-title">${info.m < 23 * 60 ? '準備睡覺' : '該就寢了'}</h2>
    <div class="hero-foot"><p class="hero-next">不延後睡眠來補進度。</p></div>`;
}

/** 時間表的每一列。now 為 null 時（看的不是今天）不標示現在與已過 */
export function slotsHtml(day: number, mode: ModeId, now: Date | null): string {
  const info = now ? currentInfo(now) : null;
  return SCHEDULE[day]
    .map((b, i) => {
      const current = info?.state === 'in' && info.idx === i;
      const past = !!info && (info.state === 'after' || (info.state === 'in' && i < info.idx));
      const canceled = isCanceled(mode, b[3]);
      const cls =['slot', `kind-${KIND_OF[b[3]]}`, current && 'is-current', past && 'is-past', canceled && 'is-canceled']
        .filter(Boolean)
        .join(' ');
      const badges = [current && '<span class="badge badge-now">現在</span>', canceled && '<span class="badge">取消</span>']
        .filter(Boolean)
        .join('');
      return `<li class="${cls}"${current ? ' aria-current="time"' : ''}>
        <span class="slot-time">${rangeHtml(b[0], b[1])}</span>
        <span class="slot-label">${b[2]}${past ? '<span class="sr-only">（已過）</span>' : ''}</span>
        ${badges ? `<span class="slot-badges">${badges}</span>` : ''}
      </li>`;
    })
    .join('');
}

function countText(n: number, target: number): string {
  return n >= target ? `本週 ${n}/${target} 達標` : `本週 ${n}/${target}`;
}

function habitRows(dk: string, week: Date[]): string {
  const checks = data.checks[dk] ?? {};
  return HABITS.map(h => {
    const n = weeklyCount(h.id, week);
    return `<li class="habit">
      <label class="habit-label" for="h-${h.id}">
        <input type="checkbox" id="h-${h.id}" data-h="${h.id}" aria-describedby="hc-${h.id}"${checks[h.id] ? ' checked' : ''}>
        <span>${h.name}</span>
      </label>
      <span class="habit-count${n >= h.target ? ' is-done' : ''}" id="hc-${h.id}">${countText(n, h.target)}</span>
    </li>`;
  }).join('');
}

/** 勾選後就地更新各習慣的本週次數，不重畫整頁，焦點不會遺失 */
export function updateHabitCounts(): void {
  const week = weekDates(state.selDate);
  for (const h of HABITS) {
    const el = document.getElementById(`hc-${h.id}`);
    if (!el) continue;
    const n = weeklyCount(h.id, week);
    el.textContent = countText(n, h.target);
    el.classList.toggle('is-done', n >= h.target);
  }
}

/**
 * 每隔一小段時間由外部呼叫。時段沒變時只更新進度條與剩餘時間，
 * 時段換了才重畫主視覺與時間表，避免打斷螢幕閱讀器的瀏覽位置。
 */
export function refreshLive(now: Date): void {
  const card = document.getElementById('now-card');
  const list = document.getElementById('timeline');
  if (!card || !list) return;
  const info = currentInfo(now);
  const sig = signature(info);
  if (sig !== lastSig) {
    lastSig = sig;
    const mode = modeOf(dkey(state.selDate));
    card.innerHTML = heroHtml(now, mode);
    list.innerHTML = slotsHtml(state.selDate.getDay(), mode, now);
    return;
  }
  if (info.state === 'in') {
    const cur = info.blocks[info.idx];
    const s = toMin(cur[0]);
    const e = toMin(cur[1]);
    const bar = card.querySelector<HTMLElement>('.hero-meter i');
    const meta = card.querySelector('.hero-meta');
    const left = card.querySelector('.hero-count-value');
    if (bar) bar.style.width = `${progress(info.m, s, e)}%`;
    if (meta) meta.textContent = elapsedText(info.m, s);
    if (left) left.textContent = fmtDur(e - info.m);
  }
}

export function renderToday(): string {
  const now = new Date();
  const sel = state.selDate;
  const dk = dkey(sel);
  const day = sel.getDay();
  const today = isToday(sel);
  const week = weekDates(sel);
  const mode = modeOf(dk);
  if (today) lastSig = signature(currentInfo(now));

  const chips = week
    .map(d => {
      const k = dkey(d);
      const isTodayChip = isToday(d);
      // 名稱直接取自可見文字（符合 WCAG 2.5.3），完整日期與「今天」用只給閱讀器的文字補在後面
      return `<li><button type="button" class="chip${isTodayChip ? ' is-today' : ''}" data-d="${k}" aria-pressed="${k === dk}">
        <span class="dow">週${DAY_NAMES[d.getDay()]}</span><span class="dom">${d.getDate()}</span><span class="sr-only">，${fmtMD(d)}${isTodayChip ? '，今天' : ''}</span>
      </button></li>`;
    })
    .join('');

  const modes = (Object.keys(MODES) as ModeId[])
    .map(
      k => `<label><input type="radio" name="mode" id="mode-${k}" value="${k}"${k === mode ? ' checked' : ''}><span>${MODES[k].short}</span></label>`,
    )
    .join('');

  // 時間表上的螢光筆底色說明。「生活」類不上色，所以用一句話帶過
  const legend = KINDS.map(k =>
    k.id === 'life' ? `<li>其餘為${k.label}</li>` : `<li><span class="mark kind-${k.id}">${k.label}</span></li>`,
  ).join('');

  const banner = today
    ? ''
    : `<div class="banner" role="note"><p>正在查看 ${fmtMD(sel)}（週${DAY_NAMES[day]}），不是今天。</p><button type="button" class="btn" data-today>回到今天</button></div>`;

  const title = `${fmtMD(sel)} 週${DAY_NAMES[day]}${today ? '<span class="badge badge-today">今天</span>' : ''}`;

  return `${viewHead(title, DAY_THEME[day])}
    <div class="stack">
      ${weekNav()}
      <ul class="chips" role="list" aria-label="選擇日期">${chips}</ul>
      ${banner}
    </div>
    ${today ? `<section class="hero" id="now-card">${heroHtml(now, mode)}</section>` : ''}
    <div class="today-grid">
      <section class="sec">
        <div class="sec-head"><h2>時間表</h2><ul class="legend" role="list" aria-label="底色說明">${legend}</ul></div>
        <ol class="timeline" id="timeline" role="list">${slotsHtml(day, mode, today ? now : null)}</ol>
      </section>
      <div class="stack">
        <section class="sec">
          <h2 id="mode-h">今日模式</h2>
          <div class="segmented" role="radiogroup" aria-labelledby="mode-h" aria-describedby="mode-note">${modes}</div>
          <p class="mode-note" id="mode-note">${MODES[mode].name}：${MODES[mode].note}</p>
        </section>
        <section class="sec">
          <h2>今日習慣</h2>
          <ul class="habits" role="list">${habitRows(dk, week)}</ul>
        </section>
        <section class="sec field">
          <h2><label for="note">今日產出與進度</label></h2>
          <p class="hint" id="note-hint">深度工作開始前寫下要產出什麼，結束時記錄進度與下一步。</p>
          <textarea id="note" rows="4" aria-describedby="note-hint">${esc(data.notes[dk] ?? '')}</textarea>
        </section>
      </div>
    </div>`;
}
