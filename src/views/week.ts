import { DAY_NAMES, DAY_THEME } from '../config/schedule';
import { HABITS } from '../config/habits';
import { weeklyCount } from '../lib/habits';
import { blocksFor, blocksOfType, isAdjusted, isCanceled, wakeTime } from '../lib/schedule';
import { data } from '../lib/store';
import { dkey, esc, fmtMD, isToday, weekDates } from '../lib/time';
import { state } from '../state';
import type { Block } from '../types';
import { rangeHtml, viewHead, weekNav, weekTitle } from './parts';

/** 一類時段的時間。withLabel 時附上名稱，恢復模式取消的運動會註明 */
function timesHtml(dk: string, blocks: Block[], withLabel = false): string {
  if (!blocks.length) return '<span class="fact-none">無</span>';
  return blocks
    .map(b => {
      const note = `${esc(b[2])}${isCanceled(dk, b) ? '（取消）' : ''}`;
      return `<span class="fact-line"><span>${rangeHtml(b[0], b[1])}</span>${withLabel ? `<span class="fact-note">${note}</span>` : ''}</span>`;
    })
    .join('');
}

function dayCard(d: Date): string {
  const day = d.getDay();
  const dk = dkey(d);
  const today = isToday(d);
  const blocks = blocksFor(dk, day);
  const wake = wakeTime(blocks);
  const facts: [string, string][] = [
    ['起床', wake ?? '<span class="fact-none">無</span>'],
    ['上課', timesHtml(dk, blocksOfType(blocks, 'class'))],
    ['深度工作', timesHtml(dk, blocksOfType(blocks, 'deep'), true)],
    ['運動', timesHtml(dk, blocksOfType(blocks, 'exercise'), true)],
    ['英文', timesHtml(dk, blocksOfType(blocks, 'english'))],
    ['閱讀', timesHtml(dk, blocksOfType(blocks, 'reading'))],
  ];
  return `<article class="daycard${today ? ' is-today' : ''}">
    <header class="daycard-head">
      <h3>週${DAY_NAMES[day]}</h3>
      <span class="daycard-date">${fmtMD(d)}</span>
      ${today ? '<span class="badge badge-today">今天</span>' : ''}
      ${isAdjusted(dk) ? '<span class="badge">已調整</span>' : ''}
      <p class="daycard-theme">${DAY_THEME[day]}</p>
    </header>
    <dl class="facts">
      ${facts.map(([k, v]) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
    </dl>
    <button type="button" class="btn" data-open-day="${dk}">查看完整時間表<span class="sr-only">（週${DAY_NAMES[day]}）</span></button>
  </article>`;
}

export function renderWeek(): string {
  const week = weekDates(state.selDate);

  // 每個習慣一列：七個方格代表七天。完成是墨色實心加反白字，未完成是空心，不只靠顏色區分
  const rows = HABITS.map(h => {
    const n = weeklyCount(h.id, week);
    const done = n >= h.target;
    const days = week
      .map(d => {
        const ok = !!data.checks[dkey(d)]?.[h.id];
        const cls = ['wh-day', ok && 'is-done', isToday(d) && 'is-today'].filter(Boolean).join(' ');
        return `<li class="${cls}"><span aria-hidden="true">${DAY_NAMES[d.getDay()]}</span><span class="sr-only">週${DAY_NAMES[d.getDay()]}${isToday(d) ? '（今天）' : ''}${ok ? '完成' : '未完成'}</span></li>`;
      })
      .join('');
    return `<li class="wh">
      <span class="wh-name">${h.name}</span>
      <ul class="wh-days" role="list">${days}</ul>
      <span class="wh-total${done ? ' is-done' : ''}">${n}/${h.target}${done ? ' 達標' : ''}</span>
    </li>`;
  }).join('');

  return `${viewHead(weekTitle(state.selDate), '習慣進度與每日安排')}
    <div class="stack">
      ${weekNav()}
      <section class="sec">
        <h2>習慣進度</h2>
        <ul class="week-habits" role="list">${rows}</ul>
        <p class="hint hint-after">不必每天全部完成，以每週目標次數為準。</p>
      </section>
      <section class="sec" aria-labelledby="days-h">
        <h2 id="days-h">每日安排</h2>
        <div class="daycards">${week.map(dayCard).join('')}</div>
      </section>
    </div>`;
}
