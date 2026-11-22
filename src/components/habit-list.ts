import { html, nothing, type TemplateResult } from 'lit-html';
import { HABITS } from '../config/habits';
import { habitItems } from '../lib/log';
import { checkMark } from './check';

/**
 * 今日達標：只看當天的實際情形，不看計畫。每個習慣列出今天已經開始或能判斷的項目
 * （按過開始的任務、時間到了的固定時段、有目標時間的浮動事項，見 log.ts 的 habitItems），
 * 例如「英文學習」「深度工作 ×2」。全部完成打勾；沒完成的寫原因（例如起床晚了）、「進行中」或完成幾個。
 * 課業整理沒有對應的任務，不在這裡列。不能手動勾選，本週累積在「本週」頁。
 */
export function habitList(dk: string, now: Date): TemplateResult {
  const byHabit = habitItems(dk, now);
  const items = HABITS.flatMap(h => {
    const list = byHabit.get(h.id);
    if (!list?.length) return [];
    const n = list.length;
    const done = list.filter(i => i.done).length;
    const note = list.find(i => !i.done && i.note)?.note;
    const status: TemplateResult | string =
      done === n ? checkMark() : note ?? (n === 1 ? '進行中' : html`<span class="sr-only">完成 </span>${done}/${n}`);
    return [{ name: `${h.name}${n > 1 ? ` ×${n}` : ''}`, status, done: done === n }];
  });
  if (!items.length) return html`<p class="hint">今天還沒開始任何任務。按「現在」區塊的開始後，這裡會列出完成了哪些。</p>`;
  return html`<ul class="habits goals" role="list">${items.map(
    it => html`<li class="habit"><span class="goal-name">${it.name}</span>${it.status
        ? html`<span class="habit-count ${it.done ? 'is-done' : ''}">${it.status}</span>`
        : nothing}</li>`,
  )}</ul>`;
}
