import { DAY_NAMES, DAY_THEME, SCHEDULE } from '../config/schedule';
import { HABITS, MODES } from '../config/habits';
import { data } from '../lib/store';
import { currentInfo, dkey, esc, fmtDur, isToday, toMin, weekDates } from '../lib/time';
import type { ModeId } from '../types';
import { state } from '../state';

function renderNow(now: Date): string {
  const info = currentInfo(now);
  const b = info.blocks;
  if (info.state === 'in') {
    const cur = b[info.idx];
    const s = toMin(cur[0]), e = toMin(cur[1]);
    const pct = Math.round(((info.m - s) / (e - s)) * 100);
    const nxt = b[info.idx + 1];
    return `<div class="card now"><div class="sub">現在 ${cur[0]}–${cur[1]}</div><h2>${cur[2]}</h2>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="sub">剩 ${fmtDur(e - info.m)}｜${nxt ? `接著 ${nxt[0]} ${nxt[2]}` : '接著：睡覺（23:00）'}</div></div>`;
  }
  if (info.state === 'before') {
    const f = b[0];
    return `<div class="card now"><div class="sub">尚未開始</div><h2>睡眠／起床前</h2>
      <div class="sub">${fmtDur(toMin(f[0]) - info.m)}後 ${f[0]} ${f[2]}</div></div>`;
  }
  return `<div class="card now"><div class="sub">今日時程已結束</div><h2>${info.m < 23 * 60 ? '準備睡覺' : '該就寢了（23:00）'}</h2>
    <div class="sub">不延後睡眠來補進度。</div></div>`;
}

export function renderToday(): string {
  const now = new Date();
  const sel = state.selDate;
  const dk = dkey(sel);
  const today = isToday(sel);

  const days = weekDates(sel)
    .map(d => `<button data-d="${dkey(d)}" class="${dkey(d) === dk ? 'on' : ''} ${isToday(d) ? 'today' : ''}">週${DAY_NAMES[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}</button>`)
    .join('');

  const mode: ModeId = data.modes[dk] ?? 'normal';
  const modeBtns = (Object.keys(MODES) as ModeId[])
    .map(k => `<button data-m="${k}" class="${k === mode ? 'on' : ''}">${MODES[k].name}</button>`)
    .join('');

  const info = currentInfo(now);
  const list = SCHEDULE[sel.getDay()]
    .map((b, i) => {
      const cls = ['c-' + b[3]];
      if (today && info.state === 'in' && i === info.idx) cls.push('cur');
      else if (today && (info.state === 'after' || (info.state === 'in' && i < info.idx))) cls.push('past');
      const cancel = mode === 'recover' && b[3] === 'exercise' ? ' <span class="tag">恢復模式：取消</span>' : '';
      return `<li class="${cls.join(' ')}"><span class="t">${b[0]}–${b[1]}</span><span>${b[2]}${cancel}</span></li>`;
    })
    .join('');

  const checks = data.checks[dk] ?? {};
  const hab = HABITS
    .map(h => `<div class="habit"><input type="checkbox" id="h_${h.id}" data-h="${h.id}" ${checks[h.id] ? 'checked' : ''}><label for="h_${h.id}">${h.name}</label></div>`)
    .join('');

  return `<div class="days">${days}</div>
  ${today ? renderNow(now) : ''}
  <div class="card"><h3>週${DAY_NAMES[sel.getDay()]}｜${DAY_THEME[sel.getDay()]}</h3>
    <div class="modes">${modeBtns}</div><div class="mode-note">${MODES[mode].note}</div></div>
  <div class="card"><ul class="tl">${list}</ul></div>
  <div class="card"><h3>今日習慣</h3>${hab}</div>
  <div class="card"><h3>今日產出／進度與下一步</h3>
    <textarea id="note" placeholder="深度工作開始前寫要產出什麼，結束時記錄進度與下一步">${esc(data.notes[dk] ?? '')}</textarea></div>`;
}
