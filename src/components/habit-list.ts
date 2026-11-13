import { html, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { HABITS } from '../config/habits';
import { weeklyCount } from '../lib/habits';
import { data } from '../lib/store';

/** 今日習慣：每個習慣一個勾選框，旁邊是本週完成次數。勾選由 main.ts 依 data-h 處理 */
export function habitList(dk: string, week: Date[]): TemplateResult {
  const checks = data.checks[dk] ?? {};
  return html`<ul class="habits" role="list">${HABITS.map(h => {
    const n = weeklyCount(h.id, week);
    const done = n >= h.target;
    return html`<li class="habit">
      <label class="habit-label" for="h-${h.id}">
        <input type="checkbox" id="h-${h.id}" data-h=${h.id} aria-describedby="hc-${h.id}" .checked=${live(!!checks[h.id])}>
        <span>${h.name}</span>
      </label>
      <span class="habit-count ${done ? 'is-done' : ''}" id="hc-${h.id}">本週 ${n}/${h.target}${done ? ' 達標' : ''}</span>
    </li>`;
  })}</ul>`;
}
