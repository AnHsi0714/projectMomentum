import { html, nothing, type TemplateResult } from 'lit-html';
import { AUTO_HABITS, HABITS } from '../config/habits';
import { refStatus, startedByHabit, wakeResult } from '../lib/log';

/**
 * 今日達標：只看當天的實際紀錄，不看計畫。今天按過開始的任務依習慣分組，
 * 例如「英文學習」「深度工作 ×2」，旁邊寫完成了幾個；沒開始的任務不列。
 * 「固定時間起床與睡覺」依起床時間自動判斷。課業整理沒有對應的任務，不在這裡列。
 * 不能手動勾選，本週累積在「本週」頁。完成的有「完成」或「達標」文字，不只靠顏色。
 */
export function habitList(dk: string, now: Date): TemplateResult {
  const started = startedByHabit(dk);
  const wake = wakeResult(dk, now);
  const items = HABITS.flatMap(h => {
    if (h.id === 'sleep') {
      if (!wake) return [];
      const note = wake.ok ? '達標' : wake.at ? `${wake.at} 起床，目標 ${wake.target}` : `還沒起床，目標 ${wake.target}`;
      return [{ id: h.id, name: h.name, status: note, done: wake.ok }];
    }
    const refs = AUTO_HABITS.has(h.id) ? started.get(h.id) : undefined;
    if (!refs?.length) return [];
    const done = refs.filter(r => refStatus(dk, r, now) === 'done').length;
    const n = refs.length;
    const status = n === 1 ? (done ? '完成' : '進行中') : `完成 ${done}/${n}`;
    return [{ id: h.id, name: `${h.name}${n > 1 ? ` ×${n}` : ''}`, status, done: done === n }];
  });
  if (!items.length) return html`<p class="hint">今天還沒開始任何任務。按「現在」區塊的開始後，這裡會列出完成了哪些。</p>`;
  return html`<ul class="habits goals" role="list">${items.map(
    it => html`<li class="habit"><span class="goal-name">${it.name}</span>${it.status
        ? html`<span class="habit-count ${it.done ? 'is-done' : ''}">${it.status}</span>`
        : nothing}</li>`,
  )}</ul>`;
}
