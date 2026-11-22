import { html, type TemplateResult } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { live } from 'lit-html/directives/live.js';
import { KIND_OF, TYPE_LABEL } from '../config/kinds';
import { DAY_NAMES, SLEEP_TIME } from '../config/schedule';
import { blanks, lanes, SLEEP_MIN } from '../lib/blocks';
import { fmtDur, fmtTime, pad } from '../lib/time';
import { viewHead } from '../components/view-head';
import { templateFor } from '../lib/schedule';
import { settings } from '../lib/store';
import { liveOverlaps, spanOf, startTemplateDraft, stripRows, type ActRow, type RowField, type RowProblem, type TemplateDraft } from '../lib/template-draft';
import { state } from '../state';
import { isStripDragging } from '../strip-drag';
import type { Block, BlockType, Mode, Stage } from '../types';

// 設定頁：編輯每週範本。欄位的值都在 state.tdraft，按儲存才寫進設定檔。
// 輸入時改草稿並重畫（時間條、卡片標題與重疊跟著變），欄位用 live() 綁定，重畫不會打斷打字。
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

const nameOf = (r: ActRow) => r.label.trim() || '未命名';

/** 卡片標題：固定與任務寫時間，浮動事項寫「浮動」，時間還沒填好寫「時間未定」 */
function rowTitle(r: ActRow): string {
  if (r.mode === 'float') return `浮動・${nameOf(r)}`;
  const sp = spanOf(r);
  return sp ? `${fmtTime(sp.start)}–${fmtTime(sp.end)}・${nameOf(r)}` : `時間未定・${nameOf(r)}`;
}

/** 這一列要顯示的問題：上一次儲存時找到的，加上編輯中就看得到的重疊（訊息相同的只列一次） */
function rowProblems(d: TemplateDraft, overlaps: RowProblem[], i: number): RowProblem[] {
  const all = [...d.problems, ...overlaps].filter(p => p.index === i);
  return all.filter((p, k) => all.findIndex(q => q.message === p.message) === k);
}

/** 時間條至少涵蓋幾分鐘：第一個活動很晚時，左端往前多留，時間條不會只剩短短一段 */
const MIN_SPAN = 10 * 60;

/** 上一次畫的左端。拖動途中沿用，刻度才不會跟著被拖的那一塊變 */
let lastLo: number | null = null;

/**
 * 時間條的左端（分鐘）：第一個活動那個整點再往前一小時；離就寢不到 MIN_SPAN 的話再往前，取整點。
 * 沒有活動時從 6 點開始。拖動中不變，放開後才重算
 */
function stripStart(starts: number[]): number {
  if (isStripDragging() && lastLo !== null) return Math.min(lastLo, ...starts);
  const first = starts.length ? Math.min(...starts) : 7 * 60;
  const lo = Math.max(0, Math.min(Math.floor(first / 60) * 60 - 60, Math.floor((SLEEP_MIN - MIN_SPAN) / 60) * 60));
  lastLo = lo;
  return lo;
}

/**
 * 設定頁的時間條：固定與任務從左排到右，重疊的分成上下兩排並加紅框。樣式與拖動沿用調整時間表的時間條。
 * 按住任務左右拖是移動，拖右邊緣是改長度；點一下（沒拖）跳到那一列改名稱等其他欄位。
 * 每塊是 role="slider"：左右鍵移動 5 分鐘，Page Up／Page Down 移動 30 分鐘，Shift 加左右鍵改長度，Enter 跳到那一列。
 * 拖動與按鍵由 settings-page.ts 處理。範本裡的固定時段也能拖，虛線框只是標出它是固定。
 * 每一塊的位置編號（data-seg）照 stripRows 的順序，清單重排時不變；id 用活動的 id。
 * 說明放在外面，時間條本身貼在視窗頂端，往下改清單時還看得到。
 */
function templateStrip(d: TemplateDraft, overlaps: RowProblem[]): TemplateResult {
  const items = stripRows(d.rows).map(({ row: r, index: i }) => {
    const sp = spanOf(r)!;
    const b: Block = { id: r.id, start: fmtTime(sp.start), end: fmtTime(Math.min(sp.end, 24 * 60 - 1)), label: nameOf(r), type: r.type, mode: r.mode === 'clock' ? 'clock' : 'press' };
    return { b, i, s: sp.start, e: sp.end };
  });
  const lo = stripStart(items.map(x => x.s));
  const hi = Math.max(SLEEP_MIN, ...items.map(x => x.e));
  const at = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`;
  const span = (s: number, e: number) => `left: ${at(s)}; width: calc(${at(e)} - ${at(s)})`;
  const segSpan = (s: number, e: number) => `left: calc(${at(s)} + 1px); width: calc(${at(e)} - ${at(s)} - 2px)`;
  const hours = Array.from({ length: Math.floor(hi / 60) - Math.ceil(lo / 60) + 1 }, (_, k) => Math.ceil(lo / 60) + k);
  const { lane, count } = lanes(items.map(x => x.b));
  const clash = new Set(overlaps.map(p => p.index));
  return html`<ul class="hint hint-list" id="set-strip-help">
      <li>時間條：按住任務左右拖是移動，拖右邊緣是改長度，一格 5 分鐘，下面的清單跟著照時間排。點一下會跳到那一列，改名稱等其他欄位。</li>
      <li>鍵盤：焦點移到任務上，左右鍵移動 5 分鐘，Page Up／Page Down 移動 30 分鐘，Shift 加左右鍵改長度，Enter 跳到那一列。</li>
      <li>重疊的分成上下兩排、加紅框，那一列也會寫出和誰重疊。虛線框的是固定。往下捲時時間條會貼在畫面頂端。</li>
    </ul>
    <div class="day-strip set-strip" id="set-strip" role="group" aria-label="時間條" aria-describedby="set-strip-help">
    <div class="strip-scroll">
      <div class="strip-track" data-lo=${lo} data-hi=${hi} style="--lanes: ${count}; width: max(100%, ${((hi - lo) / 5) * 0.38}rem)">
        ${blanks(items.map(x => x.b)).map(([s, e]) => html`<span class="blank" style=${span(s, e)} aria-hidden="true">${e - s >= 30 ? html`<span class="seg-label">休息</span>` : ''}</span>`)}
        ${items.map(({ b, i, s, e }, k) => html`<span class="seg kind-${KIND_OF[b.type]} ${b.mode === 'clock' ? 'is-fixed' : ''} ${clash.has(i) ? 'is-clash' : ''}"
            style="${segSpan(s, e)}; --lane: ${lane[k]}" data-seg=${k} id="seg-${b.id}" role="slider" tabindex="0"
            aria-label=${b.label} aria-valuemin=${lo} aria-valuemax=${SLEEP_MIN - (e - s)} aria-valuenow=${s}
            aria-valuetext="${b.start} 到 ${fmtTime(e)}，${fmtDur(e - s)}${b.mode === 'clock' ? '，固定' : ''}${clash.has(i) ? '，有重疊' : ''}">
            ${e - s >= 30 ? html`<span class="seg-label ${e - s < 60 ? 'is-short' : ''}">${b.label}</span>` : ''}
            <span class="seg-pop ${s - lo > (hi - lo) / 2 ? 'is-end' : ''}" aria-hidden="true">${b.label}<span class="seg-pop-time">${b.start}–${fmtTime(e)}・${fmtDur(e - s)}</span></span>
            ${b.mode === 'clock' ? html`<span class="seg-lock" aria-hidden="true">固定</span>` : ''}
            <span class="seg-grip" data-grip=${k} aria-hidden="true"></span>
          </span>`)}
        <div class="strip-hours" aria-hidden="true">
          ${hours.map(h => html`<span class="strip-hour" style="left: ${at(h * 60)}">${pad(h)}:00</span>`)}
        </div>
      </div>
    </div>
  </div>`;
}

/** 一個活動：所有欄位都能直接改，錯誤寫在這一列的最後，欄位用 aria-describedby 指到它 */
function actRow(r: ActRow, i: number, d: TemplateDraft, overlaps: RowProblem[]): TemplateResult {
  const problems = rowProblems(d, overlaps, i);
  const bad = (f: RowField) => problems.some(p => p.field === f);
  const errId = `s${i}-err`;
  const desc = (f: RowField, extra = '') => [extra, bad(f) ? errId : ''].filter(Boolean).join(' ') || undefined;
  const float = r.mode === 'float';
  return html`<li class="act-row ${problems.length ? 'has-error' : ''}">
    <fieldset>
      <legend>${rowTitle(r)}<span class="sr-only">（第 ${i + 1} 個，共 ${d.rows.length} 個）</span></legend>
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
  const overlaps = liveOverlaps(d.rows);
  const from = state.copyFrom ?? d.day;
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
          ? html`${templateStrip(d, overlaps)}
            <p class="hint">在下面的欄位改完開始時間、離開欄位後，清單會照時間重新排。</p>
            <ol class="act-list" role="list">${d.rows.map((r, i) => actRow(r, i, d, overlaps))}</ol>`
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
          <legend>從哪一天複製到哪幾天</legend>
          <p class="hint" id="copy-note">複製的是已儲存的活動，勾選的日子原本的活動會被換掉。</p>
          <div class="insert-fields">
            <label class="field-label" for="copy-from">從<select id="copy-from" .value=${live(String(from))} aria-describedby="copy-note">
              ${WEEK_ORDER.map(day => html`<option value=${day} ?selected=${day === from}>週${DAY_NAMES[day]}</option>`)}
            </select></label>
          </div>
          <p class="copy-to-label" id="copy-to-label">複製到</p>
          <div class="set-copy" role="group" aria-labelledby="copy-to-label">
            ${WEEK_ORDER.map(
              day => html`<label class="check-label" for="copy-${day}"><input type="checkbox" id="copy-${day}" data-copy-day=${day}
                ?disabled=${day === from} .checked=${live(day === from ? false : state.copyTo.includes(day))}><span>週${DAY_NAMES[day]}${day === from ? '（來源）' : ''}</span></label>`,
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
