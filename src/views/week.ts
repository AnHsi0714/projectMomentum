import { html, type TemplateResult } from 'lit-html';
import { checkMark } from '../components/check';
import { dayCard } from '../components/day-card';
import { viewHead } from '../components/view-head';
import { weekNav, weekTitle } from '../components/week-nav';
import { DAY_NAMES } from '../config/schedule';
import { HABITS } from '../config/habits';
import { achieved, weeklyCount } from '../lib/habits';
import { currentTime, dkey, isToday, weekDates } from '../lib/time';
import { state } from '../state';

export function renderWeek(): TemplateResult {
  const week = weekDates(state.selDate);
  const now = currentTime();

  // 每個習慣一列：七個方格代表七天。完成是墨色實心加反白字，未完成是空心，不只靠顏色區分
  const rows = HABITS.map(h => {
    const n = weeklyCount(h.id, week, now);
    const done = n >= h.target;
    const days = week.map(d => {
      const ok = achieved(dkey(d), h.id, now);
      const cls = ['wh-day', ok && 'is-done', isToday(d) && 'is-today'].filter(Boolean).join(' ');
      return html`<li class=${cls}><span aria-hidden="true">${DAY_NAMES[d.getDay()]}</span><span class="sr-only">週${DAY_NAMES[d.getDay()]}${isToday(d) ? '（今天）' : ''}${ok ? '完成' : '未完成'}</span></li>`;
    });
    return html`<li class="wh">
      <span class="wh-name">${h.name}</span>
      <ul class="wh-days" role="list">${days}</ul>
      <span class="wh-total ${done ? 'is-done' : ''}">${n}/${h.target}${done ? html` ${checkMark()}` : ''}</span>
    </li>`;
  });

  return html`${viewHead(weekTitle(state.selDate), '習慣進度與每日安排')}
    <div class="stack">
      ${weekNav()}
      <section class="sec">
        <h2>習慣進度</h2>
        <ul class="week-habits" role="list">${rows}</ul>
        <p class="hint hint-after">不必每天全部完成，以每週目標次數為準。</p>
      </section>
      <section class="sec" aria-labelledby="days-h">
        <h2 id="days-h">每日安排</h2>
        <div class="daycards">${week.map(dayCard)}</div>
      </section>
    </div>`;
}
