import { html, type TemplateResult } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { live } from 'lit-html/directives/live.js';
import { TYPE_LABEL } from '../config/kinds';
import { DAY_NAMES, SLEEP_TIME } from '../config/schedule';
import { viewHead } from '../components/view-head';
import { templateFor } from '../lib/schedule';
import { settings } from '../lib/store';
import { startTemplateDraft, type ActRow, type RowField, type TemplateDraft } from '../lib/template-draft';
import { state } from '../state';
import type { BlockType, Mode, Stage } from '../types';

// 設定頁：編輯每週範本。欄位的值都在 state.tdraft，輸入時只改草稿不重畫，按儲存才寫進設定檔。
// 按鈕與欄位的事件由 settings-page.ts 依 data-set-* 處理。訊息區（.form-msg）由那裡直接寫入文字。

/** 星期的順序：從週一排到週日 */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MODE_LABEL: Record<Mode, string> = { clock: '固定', press: '任務', float: '浮動事項' };
const TYPES = Object.keys(TYPE_LABEL) as BlockType[];

/** 目前選的那一天的草稿；還沒有或換了一天就從範本重新開始 */
export function currentTemplateDraft(): TemplateDraft {
  const day = state.setDay;
  if (state.tdraft?.day !== day) state.tdraft = startTemplateDraft(day, templateFor(day));
  return state.tdraft;
}

/** 一個活動：所有欄位都能直接改，錯誤寫在這一列的最後，欄位用 aria-describedby 指到它 */
function actRow(r: ActRow, i: number, d: TemplateDraft): TemplateResult {
  const problems = d.problems.filter(p => p.index === i);
  const bad = (f: RowField) => problems.some(p => p.field === f);
  const errId = `s${i}-err`;
  const desc = (f: RowField, extra = '') => [extra, bad(f) ? errId : ''].filter(Boolean).join(' ') || undefined;
  const float = r.mode === 'float';
  return html`<li class="act-row ${problems.length ? 'has-error' : ''}">
    <fieldset>
      <legend>活動 ${i + 1}<span class="sr-only">（共 ${d.rows.length} 個）</span></legend>
      <div class="insert-fields">
        <label class="field-label" for="s${i}-label">名稱<input type="text" id="s${i}-label" data-sf="label" data-i=${i}
          maxlength="40" autocomplete="off" .value=${live(r.label)} aria-invalid=${bad('label') ? 'true' : 'false'} aria-describedby=${ifDefined(desc('label'))}></label>
        <label class="field-label" for="s${i}-type">類型<select id="s${i}-type" data-sf="type" data-i=${i} .value=${live(r.type)}
          aria-invalid=${bad('type') ? 'true' : 'false'} aria-describedby=${ifDefined(desc('type'))}>
          ${TYPES.map(t => html`<option value=${t} ?selected=${t === r.type}>${TYPE_LABEL[t]}</option>`)}
        </select></label>
        <label class="field-label" for="s${i}-mode">種類<select id="s${i}-mode" data-sf="mode" data-i=${i} .value=${live(r.mode)} aria-describedby="set-modes">
          ${(Object.keys(MODE_LABEL) as Mode[]).map(m => html`<option value=${m} ?selected=${m === r.mode}>${MODE_LABEL[m]}</option>`)}
        </select></label>
        <label class="field-label" for="s${i}-start">${float ? '目標時間（可不填）' : '開始（24 小時制）'}<input type="text" id="s${i}-start"
          data-sf="start" data-i=${i} inputmode="numeric" autocomplete="off" placeholder="例如 1400" .value=${live(r.start)}
          aria-invalid=${bad('start') ? 'true' : 'false'} aria-describedby=${ifDefined(desc('start'))}></label>
        <label class="field-label" for="s${i}-minutes">${float ? '大概長度（分鐘）' : '長度（分鐘）'}<input type="number" id="s${i}-minutes"
          data-sf="minutes" data-i=${i} min="5" max="1440" step="5" .value=${live(r.minutes)}
          aria-invalid=${bad('minutes') ? 'true' : 'false'} aria-describedby=${ifDefined(desc('minutes'))}></label>
        ${float
          ? html`<label class="field-label" for="s${i}-stage">先後階段<select id="s${i}-stage" data-sf="stage" data-i=${i} .value=${live(r.stage)}
              aria-invalid=${bad('stage') ? 'true' : 'false'} aria-describedby=${ifDefined(desc('stage', 'stage-note'))}>
              ${settings.stages.some(s => s.id === r.stage) ? '' : html`<option value="" selected>請選擇</option>`}
              ${settings.stages.map((s, k) => html`<option value=${s.id} ?selected=${s.id === r.stage}>${k + 1}. ${s.label}</option>`)}
            </select></label>`
          : ''}
      </div>
      <p class="act-error" id=${errId}>${problems.map(p => html`<span>${p.message}</span>`)}</p>
      <div class="actions">
        <button type="button" class="btn" data-set-act="delete" data-i=${i}>刪除<span class="sr-only">活動 ${i + 1}${r.label ? `「${r.label}」` : ''}</span></button>
      </div>
    </fieldset>
  </li>`;
}

/** 一個先後階段：名稱、順序（1 到 n）與刪除。改了直接儲存 */
function stageRow(s: Stage, k: number, n: number): TemplateResult {
  return html`<li class="stage-row">
    <label class="field-label" for="st-${s.id}-label">名稱<input type="text" id="st-${s.id}-label" data-stage-label=${k}
      maxlength="20" autocomplete="off" .value=${live(s.label)}></label>
    <label class="field-label" for="st-${s.id}-order">順序<select id="st-${s.id}-order" data-stage-order=${k} .value=${live(String(k))}>
      ${Array.from({ length: n }, (_, j) => html`<option value=${j} ?selected=${j === k}>${j + 1}</option>`)}
    </select></label>
    <button type="button" class="btn" data-stage-act="delete" data-k=${k}>刪除<span class="sr-only">階段「${s.label}」</span></button>
  </li>`;
}

export function renderSettings(): TemplateResult {
  const d = currentTemplateDraft();
  const dayName = `週${DAY_NAMES[d.day]}`;
  return html`${viewHead('設定', '每週範本：每天原定的活動')}
    <div class="stack">
      <section class="sec">
        <h2>每週範本</h2>
        <p class="hint">沒調整過的日子（包括過去的日子）會照新的範本顯示；在「今天」調整過的日子有自己的時間表，不受影響。
          刪掉的活動如果已經有實際紀錄，紀錄還在。</p>
        <div class="actions set-days" role="group" aria-label="選擇星期">
          ${WEEK_ORDER.map(
            day => html`<button type="button" class="btn" data-set-day=${day} aria-pressed=${day === d.day ? 'true' : 'false'}>週${DAY_NAMES[day]}</button>`,
          )}
        </div>
      </section>

      <section class="sec" aria-labelledby="set-day-title">
        <h2 id="set-day-title">${dayName}的活動</h2>
        <ul class="hint hint-list" id="set-modes">
          <li><strong>固定</strong>：照時鐘自動開始與結束，結束時間到了就算完成，例如上課、通勤。</li>
          <li><strong>任務</strong>：按開始才開始，按結束才算完成，例如深度工作、英文。</li>
          <li><strong>浮動事項</strong>：不排在時間表上，要做時按開始，例如吃飯、洗澡。填了目標時間的，晚 30 分鐘以內開始才算完成。</li>
          <li>固定和任務都排在時間表上，彼此不能重疊，最晚到 ${SLEEP_TIME} 就寢。</li>
        </ul>
        <p class="form-msg" id="set-msg" role="status"></p>
        ${d.rows.length
          ? html`<ol class="act-list" role="list">${d.rows.map((r, i) => actRow(r, i, d))}</ol>`
          : html`<p class="hint">這一天沒有活動。</p>`}
        <div class="actions">
          <button type="button" class="btn" data-set-act="add">新增活動</button>
          <button type="button" class="btn" data-set-act="default">還原成預設</button>
        </div>
        <div class="adjust-bar" role="group" aria-label="儲存或取消${dayName}的變更">
          <p class="form-msg is-error" id="set-error" role="alert"></p>
          <div class="actions">
            <button type="button" class="btn btn-solid" data-set-act="save">儲存</button>
            <button type="button" class="btn" data-set-act="revert">取消變更</button>
          </div>
        </div>
      </section>

      <section class="sec">
        <h2>複製到其他天</h2>
        <fieldset class="insert-form">
          <legend>把${dayName}已儲存的活動複製到</legend>
          <p class="hint" id="copy-note">勾選的日子原本的活動會被換掉。${dayName}還有沒儲存的變更時，要先儲存。</p>
          <div class="set-copy">
            ${WEEK_ORDER.filter(day => day !== d.day).map(
              day => html`<label class="check-label" for="copy-${day}"><input type="checkbox" id="copy-${day}" data-copy-day=${day}><span>週${DAY_NAMES[day]}</span></label>`,
            )}
          </div>
          <div class="actions"><button type="button" class="btn" data-set-act="copy" aria-describedby="copy-note">複製</button></div>
          <p class="form-msg" id="copy-msg" role="status"></p>
        </fieldset>
      </section>

      <section class="sec" aria-labelledby="stage-title">
        <h2 id="stage-title">浮動事項的先後階段</h2>
        <ul class="hint hint-list" id="stage-note">
          <li>做了後面階段的事，前面階段的就不再列出，例如吃過晚餐就不會再出現早午餐。</li>
          <li>第 1 階段在當天開始做任何事之後就不再列出，適合放起床。</li>
          <li>順序選 1 到 ${settings.stages.length}，其他階段會跟著順移。這裡的變更會直接儲存。</li>
        </ul>
        <ol class="stage-list" role="list" aria-describedby="stage-note">
          ${settings.stages.map((st, k) => stageRow(st, k, settings.stages.length))}
        </ol>
        <div class="actions"><button type="button" class="btn" data-stage-act="add">新增階段</button></div>
        <p class="form-msg" id="stage-msg" role="status"></p>
      </section>
    </div>`;
}
