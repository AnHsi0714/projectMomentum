import { html, type TemplateResult } from 'lit-html';
import { isLocked } from '../lib/blocks';
import type { Block, Float } from '../types';

// 補記：忘了按開始、結束時，事後填上實際的時間。放在時間表下面，平常收合。
// 欄位沒有綁定值，每分鐘重畫也不會清掉填到一半的內容；按下補記後由 main.ts 讀取。
// 選單的值是「task:任務 id」或「float:浮動事項 id」。

/** 選單裡一個項目的值 */
export const backfillValue = (kind: 'task' | 'float', id: string) => `${kind}:${id}`;

/** 補記表單。tasks 只列任務，固定時段照時鐘走，不用補記 */
export function backfillForm(blocks: Block[], floats: Float[]): TemplateResult {
  const tasks = blocks.filter(b => !isLocked(b));
  return html`<details class="backfill">
    <summary>補記實際時間</summary>
    <fieldset class="insert-form">
      <legend class="sr-only">補記實際時間</legend>
      <p class="hint" id="backfill-note">忘了按開始或結束時用：選項目，填實際的開始與結束，24 小時制，打「1930」或「19:30」都可以。不能和已有的紀錄重疊。</p>
      <div class="insert-fields">
        <label class="field-label" for="bf-item">項目<select id="bf-item" aria-describedby="backfill-note">
          <option value="">請選擇</option>
          ${tasks.length
            ? html`<optgroup label="任務">${tasks.map(b => html`<option value=${backfillValue('task', b.id)}>${b.label}（${b.start}）</option>`)}</optgroup>`
            : ''}
          ${floats.length
            ? html`<optgroup label="浮動事項">${floats.map(f => html`<option value=${backfillValue('float', f.id)}>${f.label}</option>`)}</optgroup>`
            : ''}
        </select></label>
        <label class="field-label" for="bf-start">開始<input type="text" id="bf-start" inputmode="numeric" autocomplete="off" placeholder="例如 1930"></label>
        <label class="field-label" for="bf-end">結束<input type="text" id="bf-end" inputmode="numeric" autocomplete="off" placeholder="例如 2040"></label>
      </div>
      <div class="actions"><button type="button" class="btn" data-backfill>補記</button></div>
      <p class="form-msg" id="backfill-msg" role="status"></p>
    </fieldset>
  </details>`;
}
