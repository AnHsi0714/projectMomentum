import { DAY_NAMES, DAY_THEME, SLEEP_TIME } from '../config/schedule';
import { ADJUST_NOTE, HABITS, RECOVER_NOTE } from '../config/habits';
import { KIND_OF, KINDS, TYPE_LABEL } from '../config/kinds';
import type { Draft } from '../lib/draft';
import { weeklyCount } from '../lib/habits';
import { blocksFor, isCanceled, isConfirmed, isRecovering } from '../lib/schedule';
import { data } from '../lib/store';
import {
  currentInfo, currentTime, dkey, elapsedMinutes, esc, fmtDur, fmtMD, isDone, isToday, toMin, weekDates, type CurrentInfo,
} from '../lib/time';
import { state } from '../state';
import type { Block, BlockType } from '../types';
import { rangeHtml, viewHead, weekNav } from './parts';

/** 上一次畫出的「現在」狀態，用來判斷這一分鐘需不需要整塊重畫 */
let lastSig = '';

const signature = (info: CurrentInfo) =>
  info.state === 'in' || info.state === 'gap' ? `${info.state}:${info.idx}` : info.state;
const progress = (m: number, s: number, e: number) => Math.round(((m - s) / (e - s)) * 100);
const elapsedText = (m: number, s: number) => `已進行 ${fmtDur(m - s)}`;

/** 刻度間隔（分鐘）：1 小時內每 5 分，2 小時內每 10 分，4 小時內每 30 分，更長每 1 小時 */
const tickStep = (len: number) => (len <= 60 ? 5 : len <= 120 ? 10 : len <= 240 ? 30 : 60);

/**
 * 進度尺的刻度，對齊時鐘上的整點，不是從時段開始算。
 * 整點最長最粗，半點次之，其餘最短。頭尾剛好落在刻度上時也畫，看得出這段從幾點到幾點。
 */
function ticksHtml(s: number, e: number): string {
  const step = tickStep(e - s);
  const out: string[] = [];
  for (let t = Math.ceil(s / step) * step; t <= e; t += step) {
    const level = t % 60 === 0 ? ' tick-hour' : t % 30 === 0 ? ' tick-half' : '';
    out.push(`<span class="tick${level}" style="left:${(((t - s) / (e - s)) * 100).toFixed(2)}%"></span>`);
  }
  return out.join('');
}

/** 主視覺的內容：現在是哪個時段、還剩多久、接著是什麼 */
export function heroHtml(now: Date, dk: string, blocks: Block[]): string {
  const info = currentInfo(now, blocks);
  if (info.state === 'in') {
    const cur = blocks[info.idx];
    const s = toMin(cur[0]);
    const e = toMin(cur[1]);
    const nxt = blocks[info.idx + 1];
    const canceled = isCanceled(dk, cur);
    // 被取消的時段和時間表一樣：加「取消」標記，標題劃線，不再上螢光筆
    return `<p class="hero-eyebrow">現在${canceled ? '<span class="badge">取消</span>' : ''}</p>
      <h2 class="hero-title kind-${KIND_OF[cur[3]]}${canceled ? ' is-canceled' : ''}">${esc(cur[2])}</h2>
      <p class="hero-time">${rangeHtml(cur[0], cur[1])}</p>
      <p class="hero-count"><span class="hero-count-label">還剩</span> <span class="hero-count-value">${fmtDur(e - info.m)}</span></p>
      <div class="hero-meter" aria-hidden="true"><i style="width:${progress(info.m, s, e)}%"></i>${ticksHtml(s, e)}</div>
      <div class="hero-foot">
        <p class="hero-meta"><span class="hero-elapsed">${elapsedText(info.m, s)}</span><span aria-hidden="true">・每格 ${fmtDur(tickStep(e - s))}</span></p>
        <p class="hero-next">${nxt ? `接著 <b>${nxt[0]}</b> ${esc(nxt[2])}` : `接著 <b>${SLEEP_TIME}</b> 就寢`}</p>
      </div>`;
  }
  if (info.state === 'before' || info.state === 'gap') {
    const next = blocks[info.state === 'gap' ? info.idx : 0];
    return `<p class="hero-eyebrow">${info.state === 'gap' ? '現在' : '尚未開始'}</p>
      <h2 class="hero-title">${info.state === 'gap' ? '沒有安排' : '起床前'}</h2>
      <div class="hero-foot"><p class="hero-next">${fmtDur(toMin(next[0]) - info.m)}後 <b>${next[0]}</b> ${esc(next[2])}</p></div>`;
  }
  if (info.state === 'empty') {
    return `<p class="hero-eyebrow">今天沒有安排</p>
      <h2 class="hero-title">休息</h2>
      <div class="hero-foot"><p class="hero-next">不延後睡眠來補進度。</p></div>`;
  }
  return `<p class="hero-eyebrow">今日時程已結束</p>
    <h2 class="hero-title">${info.m < toMin(SLEEP_TIME) ? '準備睡覺' : '該就寢了'}</h2>
    <div class="hero-foot"><p class="hero-next">不延後睡眠來補進度。</p></div>`;
}

/** 移動把手上的圖示：上下兩個箭頭，像電梯的按鈕，裝飾用 */
const LIFT =
  '<svg viewBox="0 0 12 20" aria-hidden="true" focusable="false"><path d="M6 0l6 7H0zM6 20L0 13h12z"/></svg>';

/**
 * 調整時一列可編輯的任務，排成和平常時間表一樣：左邊是移動把手，接著是開始時間與名稱，再來是類型與刪除。
 * 結束時間不用填，一律接到下一個任務的開始。
 * 把手用滑鼠或觸控按住拖曳；鍵盤焦點在把手上時按上下鍵移動。欄位名稱只給閱讀器。
 * past 表示這個任務今天已經結束：底色下沉，並加上「已過」文字，不只靠顏色區分。
 */
function editRowHtml(d: Draft, i: number, past: boolean): string {
  const b = d.blocks[i];
  const mine = d.problems.filter(p => p.index === i);
  const name = esc(b[2].trim() || '未命名的任務');
  const field = (f: 'label' | 'start') =>
    `id="r${i}-${f}" data-f="${f}" data-i="${i}"${mine.some(p => p.field === f) ? ` aria-invalid="true" aria-describedby="r${i}-err"` : ''}`;
  const types = (Object.keys(TYPE_LABEL) as BlockType[])
    .map(t => `<option value="${t}"${t === b[3] ? ' selected' : ''}>${TYPE_LABEL[t]}</option>`)
    .join('');
  const handle =
    d.blocks.length > 1
      ? `<button type="button" class="drag-handle" data-drag data-act="move" data-i="${i}" aria-label="移動：${name}" aria-describedby="move-note">${LIFT}</button>`
      : '<span class="drag-handle is-off" aria-hidden="true"></span>';
  return `<li class="slot slot-edit${past ? ' is-past' : ''}${mine.length ? ' has-error' : ''}" data-i="${i}">
    ${handle}
    <span class="edit-time"><label class="sr-only" for="r${i}-start">開始時間</label><input type="time" ${field('start')} value="${esc(b[0])}">${past ? '<span class="badge">已過</span>' : ''}</span>
    <span class="edit-label"><label class="sr-only" for="r${i}-label">名稱</label><input type="text" ${field('label')} maxlength="40" autocomplete="off" placeholder="任務名稱" value="${esc(b[2])}"></span>
    <span class="edit-type"><label class="sr-only" for="r${i}-type">類型</label><select id="r${i}-type" data-f="type" data-i="${i}">${types}</select></span>
    <button type="button" class="btn edit-del" data-act="delete" data-i="${i}">刪除<span class="sr-only">：${name}</span></button>
    <p class="row-error" id="r${i}-err">${mine.map(p => esc(p.message)).join('')}</p>
  </li>`;
}

/**
 * 時間表的每一列。看的不是今天時不標示現在與已過。
 * 調整中（draft 不為 null）顯示草稿，每一列都是可編輯的欄位。
 */
export function slotsHtml(dk: string, blocks: Block[], now: Date, draft: Draft | null = null): string {
  const rows = draft ? draft.blocks : blocks;
  if (!rows.length) return '<li class="slot-empty">這一天沒有安排。</li>';
  const today = dk === dkey(now);
  const info = !draft && today ? currentInfo(now, blocks) : null;
  const elapsed = elapsedMinutes(dk, now);
  return rows
    .map((b, i) => {
      const past = today && isDone(b, elapsed);
      if (draft) return editRowHtml(draft, i, past);
      const current = info?.state === 'in' && info.idx === i;
      const canceled = isCanceled(dk, b);
      const cls = ['slot', `kind-${KIND_OF[b[3]]}`, current && 'is-current', past && 'is-past', canceled && 'is-canceled']
        .filter(Boolean)
        .join(' ');
      const badges = [current && '<span class="badge badge-now">現在</span>', canceled && '<span class="badge">取消</span>']
        .filter(Boolean)
        .join('');
      return `<li class="${cls}"${current ? ' aria-current="time"' : ''}>
        <span class="slot-time">${rangeHtml(b[0], b[1])}</span>
        <span class="slot-label">${esc(b[2])}${past ? '<span class="sr-only">（已過）</span>' : ''}</span>
        ${badges ? `<span class="slot-badges">${badges}</span>` : ''}
      </li>`;
    })
    .join('');
}

/**
 * 還沒開始調整時，時間表上方的入口。過去的日子與已經按過確認的日子不能調整，按鈕停用，
 * 說明改成不能調整的原因。lockedNote 為 null 表示可以調整。
 */
function adjustEntryHtml(lockedNote: string | null): string {
  return `<div class="adjust-entry">
      <button type="button" class="btn" id="btn-adjust" aria-describedby="adjust-note"${lockedNote ? ' disabled' : ''}>調整時間表</button>
      <p class="hint" id="adjust-note">${lockedNote ?? ADJUST_NOTE}</p>
    </div>
    <p class="form-msg" id="adjust-msg" role="status"></p>`;
}

/** 調整中，時間表上方的操作說明 */
function adjustHintHtml(): string {
  return `<p class="hint" id="move-note">每列左邊的時間是<strong>開始時間</strong>，結束時間不用填：每個任務會延續到下一個任務開始，最後一個到 ${SLEEP_TIME} 就寢。新增的任務也只要填開始時間，會自動插進那個時間，前一個任務就在那時結束。按住左邊的上下箭頭拖曳可以調整先後，用鍵盤時把焦點移到箭頭上按上下鍵。儲存時會依開始時間自動排好。按「更新時間表」儲存後還能再調整，連已經結束的任務都能改；按「保存當天時間表」會儲存並<strong>定稿，這一天之後不能再調整</strong>。</p>
    <p class="form-msg" id="adjust-msg" role="status"></p>`;
}

/** 調整中，時間表下方的新增，以及貼在視窗底部的確認與取消 */
function adjustBarHtml(): string {
  return `<div class="actions"><button type="button" class="btn" data-act="add">新增任務</button></div>
    <div class="adjust-bar" role="group" aria-label="儲存或取消調整">
      <p class="form-msg is-error" id="adjust-error" role="alert"></p>
      <div class="actions">
        <button type="button" class="btn btn-solid" data-act="confirm">更新時間表</button>
        <button type="button" class="btn" data-act="finalize">保存當天時間表</button>
        <button type="button" class="btn" data-act="cancel">取消</button>
        <button type="button" class="btn" data-act="reset">還原原定時間表</button>
      </div>
    </div>`;
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
 * 調整中清單裡有欄位與按鈕，就地改寫會弄丟焦點，所以回傳 'rerender'，
 * 請呼叫的人做整頁重畫（整頁重畫會從草稿畫回欄位內容，並保留焦點）。
 */
export function refreshLive(now: Date): 'rerender' | undefined {
  const card = document.getElementById('now-card');
  const list = document.getElementById('timeline');
  if (!card || !list) return;
  const dk = dkey(state.selDate);
  const blocks = blocksFor(dk, state.selDate.getDay());
  const info = currentInfo(now, blocks);
  const sig = signature(info);
  if (sig !== lastSig) {
    if (state.draft) return 'rerender';
    lastSig = sig;
    card.innerHTML = heroHtml(now, dk, blocks);
    list.innerHTML = slotsHtml(dk, blocks, now);
    return;
  }
  if (info.state === 'in') {
    const cur = blocks[info.idx];
    const s = toMin(cur[0]);
    const e = toMin(cur[1]);
    const bar = card.querySelector<HTMLElement>('.hero-meter i');
    const meta = card.querySelector('.hero-elapsed');
    const left = card.querySelector('.hero-count-value');
    if (bar) bar.style.width = `${progress(info.m, s, e)}%`;
    if (meta) meta.textContent = elapsedText(info.m, s);
    if (left) left.textContent = fmtDur(e - info.m);
  }
}

export function renderToday(): string {
  const now = currentTime();
  const sel = state.selDate;
  const dk = dkey(sel);
  const day = sel.getDay();
  const today = isToday(sel);
  const week = weekDates(sel);
  const blocks = blocksFor(dk, day);
  const draft = state.draft?.date === dk ? state.draft : null;
  // 過去的日子與已經定稿的日子不能調整
  const lockedNote =
    dk < dkey(now) ? '這一天已經結束，不能再調整。'
    : isConfirmed(dk) ? '這一天的時間表已經確認定稿，不能再調整。'
    : null;
  if (today) lastSig = signature(currentInfo(now, blocks));

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
    ${today ? `<section class="hero" id="now-card">${heroHtml(now, dk, blocks)}</section>` : ''}
    <div class="today-grid">
      <section class="sec">
        <div class="sec-head"><h2>時間表</h2><ul class="legend" role="list" aria-label="底色說明">${legend}</ul></div>
        ${draft ? adjustHintHtml() : adjustEntryHtml(lockedNote)}
        <ol class="timeline" id="timeline" role="list">${slotsHtml(dk, blocks, now, draft)}</ol>
        ${draft ? adjustBarHtml() : ''}
      </section>
      <div class="stack">
        <section class="sec">
          <h2>恢復模式</h2>
          <div class="tool">
            <label class="check-label" for="recover"><input type="checkbox" id="recover" aria-describedby="recover-note"${isRecovering(dk) ? ' checked' : ''}><span>啟用恢復模式</span></label>
            <p class="hint" id="recover-note">${RECOVER_NOTE}</p>
          </div>
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
