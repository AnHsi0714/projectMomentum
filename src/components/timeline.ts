import { html, nothing, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { KIND_OF, KINDS, TYPE_LABEL } from '../config/kinds';
import type { Draft } from '../lib/draft';
import { isCanceled } from '../lib/schedule';
import { currentInfo, dkey, elapsedMinutes, isDone } from '../lib/time';
import type { Block, BlockType } from '../types';
import { timeRange } from './time-range';

// 時間表：平常是唯讀的清單，調整中（有草稿）每一列換成可編輯的欄位。

/** 移動把手上的圖示：上下兩個箭頭，像電梯的按鈕，裝飾用 */
const LIFT = html`<svg viewBox="0 0 12 20" aria-hidden="true" focusable="false"><path d="M6 0l6 7H0zM6 20L0 13h12z"/></svg>`;

/** 時間表上的螢光筆底色說明。「生活」類不上色，所以用一句話帶過 */
export const legend = () =>
  html`<ul class="legend" role="list" aria-label="底色說明">${KINDS.map(k =>
    k.id === 'life' ? html`<li>其餘為${k.label}</li>` : html`<li><span class="mark kind-${k.id}">${k.label}</span></li>`,
  )}</ul>`;

/**
 * 調整時一列可編輯的任務，排成和平常時間表一樣：左邊是移動把手，接著是開始時間與名稱，再來是類型與刪除。
 * 結束時間不用填，一律接到下一個任務的開始。
 * 把手用滑鼠或觸控按住拖曳；鍵盤焦點在把手上時按上下鍵移動。欄位名稱只給閱讀器。
 * past 表示這個任務今天已經結束：底色下沉，並加上「已過」文字，不只靠顏色區分。
 * 欄位的值用 live()，比對畫面上的實際值。
 */
function editRow(d: Draft, i: number, past: boolean): TemplateResult {
  const b = d.blocks[i];
  const mine = d.problems.filter(p => p.index === i);
  const name = b[2].trim() || '未命名的任務';
  const bad = (f: 'label' | 'start') => mine.some(p => p.field === f);
  const handle =
    d.blocks.length > 1
      ? html`<button type="button" class="drag-handle" data-drag data-act="move" data-i=${i} aria-label="移動：${name}" aria-describedby="move-note">${LIFT}</button>`
      : html`<span class="drag-handle is-off" aria-hidden="true"></span>`;
  return html`<li class="slot slot-edit ${past ? 'is-past' : ''} ${mine.length ? 'has-error' : ''}" data-i=${i}>
    ${handle}
    <span class="edit-time"><label class="sr-only" for="r${i}-start">開始時間</label><input type="time" id="r${i}-start" data-f="start" data-i=${i}
      aria-invalid=${bad('start') ? 'true' : nothing} aria-describedby=${bad('start') ? `r${i}-err` : nothing}
      .value=${live(b[0])}>${past ? html`<span class="badge">已過</span>` : ''}</span>
    <span class="edit-label"><label class="sr-only" for="r${i}-label">名稱</label><input type="text" id="r${i}-label" data-f="label" data-i=${i}
      aria-invalid=${bad('label') ? 'true' : nothing} aria-describedby=${bad('label') ? `r${i}-err` : nothing}
      maxlength="40" autocomplete="off" placeholder="任務名稱" .value=${live(b[2])}></span>
    <span class="edit-type"><label class="sr-only" for="r${i}-type">類型</label><select id="r${i}-type" data-f="type" data-i=${i}>
      ${(Object.keys(TYPE_LABEL) as BlockType[]).map(t => html`<option value=${t} .selected=${live(t === b[3])}>${TYPE_LABEL[t]}</option>`)}
    </select></span>
    <button type="button" class="btn edit-del" data-act="delete" data-i=${i}>刪除<span class="sr-only">：${name}</span></button>
    <p class="row-error" id="r${i}-err">${mine.map(p => p.message).join('')}</p>
  </li>`;
}

/** 平常的一列：時間、名稱，以及「現在」「取消」標記 */
function viewRow(dk: string, b: Block, current: boolean, past: boolean): TemplateResult {
  const canceled = isCanceled(dk, b);
  const cls = ['slot', `kind-${KIND_OF[b[3]]}`, current && 'is-current', past && 'is-past', canceled && 'is-canceled']
    .filter(Boolean)
    .join(' ');
  return html`<li class=${cls} aria-current=${current ? 'time' : nothing}>
    <span class="slot-time">${timeRange(b[0], b[1])}</span>
    <span class="slot-label">${b[2]}${past ? html`<span class="sr-only">（已過）</span>` : ''}</span>
    ${current || canceled
      ? html`<span class="slot-badges">${current ? html`<span class="badge badge-now">現在</span>` : ''}${canceled ? html`<span class="badge">取消</span>` : ''}</span>`
      : ''}
  </li>`;
}

/**
 * 整張時間表。看的不是今天時不標示現在與已過。
 * 調整中（draft 不為 null）顯示草稿，每一列都是可編輯的欄位。
 */
export function timeline(dk: string, blocks: Block[], now: Date, draft: Draft | null): TemplateResult {
  const rows = draft ? draft.blocks : blocks;
  const today = dk === dkey(now);
  const info = !draft && today ? currentInfo(now, blocks) : null;
  const elapsed = elapsedMinutes(dk, now);
  const items = rows.length
    ? rows.map((b, i) => {
        const past = today && isDone(b, elapsed);
        return draft ? editRow(draft, i, past) : viewRow(dk, b, info?.state === 'in' && info.idx === i, past);
      })
    : html`<li class="slot-empty">這一天沒有安排。</li>`;
  return html`<ol class="timeline" id="timeline" role="list">${items}</ol>`;
}
