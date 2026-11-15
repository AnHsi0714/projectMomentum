import { html, nothing, type TemplateResult } from 'lit-html';
import { fmtDur, toMin } from '../lib/time';
import type { Block } from '../types';
import { timeRange } from './time-range';

// 暫待區：在調整時間表裡按「暫待」拿出時間表、今天還沒決定要不要做的任務。
// 調整中可以排回時間表或刪除；平常只列出來，提醒要排回得先按「調整時間表」。

export function pendingList(items: Block[], editable: boolean): TemplateResult | typeof nothing {
  if (!items.length) return nothing;
  return html`<div class="pending" role="group" aria-labelledby="pending-title">
    <h3 class="pending-title" id="pending-title">暫待區</h3>
    <p class="hint">先拿出時間表、還沒決定要不要做的任務，括號裡是原本的時間。${editable ? '排回時會放進第一段放得下的空白。' : '要排回時間表，先按「調整時間表」。'}</p>
    <ul class="pending-list" role="list">
      ${items.map((b, k) => {
        const name = b.label.trim() || '未命名的任務';
        return html`<li>
          <span class="pending-name">${name}<span class="pending-when">（${timeRange(b.start, b.end)}，${fmtDur(toMin(b.end) - toMin(b.start))}）</span></span>
          ${editable
            ? html`<span class="pending-tools">
                <button type="button" class="btn" data-act="restore" data-k=${k}>排回時間表<span class="sr-only">：${name}</span></button>
                <button type="button" class="btn" data-act="drop" data-k=${k}>刪除<span class="sr-only">：${name}</span></button>
              </span>`
            : ''}
        </li>`;
      })}
    </ul>
  </div>`;
}
