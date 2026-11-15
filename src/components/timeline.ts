import { html, nothing, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { KIND_OF, KINDS, TYPE_LABEL } from '../config/kinds';
import { LIFE_TYPES, isLocked, SLEEP_MIN } from '../lib/blocks';
import { draftConflicts, type Draft } from '../lib/draft';
import { actualRange, statusOf, type Status } from '../lib/log';
import { isCanceled } from '../lib/schedule';
import { currentInfo, dkey, elapsedMinutes, fmtDur, fmtTime, isDone, toMin } from '../lib/time';
import type { Block, BlockType } from '../types';
import { timeRange } from './time-range';

// 時間表：平常是唯讀的清單，調整中（有草稿）每一列換成可編輯的欄位。

/** 時間表上的螢光筆底色說明。「生活」類不上色，所以用一句話帶過 */
export const legend = () =>
  html`<ul class="legend" role="list" aria-label="底色說明">${KINDS.map(k =>
    k.id === 'life' ? html`<li>其餘為${k.label}</li>` : html`<li><span class="mark kind-${k.id}">${k.label}</span></li>`,
  )}</ul>`;

/**
 * 調整時一列可編輯的任務：時間與名稱，再來是類型、鎖定、移到暫待區與刪除。
 * 時間與先後都在上方的時間條（day-strip.ts）拖動來改，這裡只顯示目前的時間範圍與長度，邊拖邊更新。
 * 鎖定是切換按鈕（aria-pressed），鎖定的任務是固定時段，照時鐘走，不能拖動。欄位名稱只給閱讀器。
 * past 表示這個任務今天已經結束：底色下沉，並加上「已過」文字，不只靠顏色區分。
 * clash 表示和別的任務重疊，加上「重疊」文字。類型選單不列生活類型，起床、吃飯是浮動事項，休息是空白，都不是任務。
 * 欄位的值用 live()，比對畫面上的實際值。
 */
function editRow(d: Draft, i: number, past: boolean, clash: boolean): TemplateResult {
  const b = d.blocks[i];
  const mine = d.problems.filter(p => p.index === i);
  const name = b.label.trim() || '未命名的任務';
  const bad = (f: 'label' | 'time') => mine.some(p => p.field === f);
  const locked = isLocked(b);
  const dur = fmtDur(toMin(b.end) - toMin(b.start));
  const types = (Object.keys(TYPE_LABEL) as BlockType[]).filter(t => !LIFE_TYPES.has(t) || t === b.type);
  return html`<li class="slot slot-edit ${past ? 'is-past' : ''} ${mine.length ? 'has-error' : ''} ${locked ? 'is-locked' : ''} ${clash ? 'is-clash' : ''}" data-i=${i}>
    <span class="edit-time"><span class="edit-when">${timeRange(b.start, b.end)}</span><span class="edit-dur">${dur}</span>${past ? html`<span class="badge">已過</span>` : ''}${clash ? html`<span class="badge badge-clash">重疊</span>` : ''}${bad('time') ? html`<span class="sr-only">（時間有問題）</span>` : ''}</span>
    <span class="edit-label"><label class="sr-only" for="r${i}-label">名稱</label><input type="text" id="r${i}-label" data-f="label" data-i=${i}
      aria-invalid=${bad('label') ? 'true' : nothing} aria-describedby=${bad('label') ? `r${i}-err` : nothing}
      maxlength="40" autocomplete="off" placeholder="任務名稱" .value=${live(b.label)}></span>
    <span class="edit-type"><label class="sr-only" for="r${i}-type">類型</label><select id="r${i}-type" data-f="type" data-i=${i}>
      ${types.map(t => html`<option value=${t} .selected=${live(t === b.type)}>${TYPE_LABEL[t]}</option>`)}
    </select></span>
    <span class="edit-tools">
      <button type="button" class="btn edit-lock" data-act="lock" data-i=${i} aria-pressed=${locked ? 'true' : 'false'}>鎖定<span class="sr-only">：${name}</span></button>
      ${locked ? '' : html`<button type="button" class="btn edit-park" data-act="park" data-i=${i}>暫待<span class="sr-only">：${name}</span></button>`}
      <button type="button" class="btn edit-del" data-act="delete" data-i=${i}>刪除<span class="sr-only">：${name}</span></button>
    </span>
    <p class="row-error" id="r${i}-err">${mine.map(p => p.message).join('')}</p>
  </li>`;
}

/** 任務狀態在列上的標記文字。還沒開始的不標 */
const STATUS_BADGE: Record<Status, string> = { todo: '', running: '進行中', cut: '中斷', done: '完成', missed: '沒做' };

/**
 * 平常的一列：時間、名稱與標記。任務的狀態看實際紀錄（進行中、完成、中斷、沒做），
 * 有紀錄時在名稱下面寫實際的時間；固定時段照時鐘標「現在」與已過。
 * current 表示這一列是現在進行中的，past 表示已經結束或沒做，底色下沉。
 */
function viewRow(dk: string, b: Block, now: Date, clockNow: boolean, clockPast: boolean): TemplateResult {
  const canceled = isCanceled(dk, b);
  const task = !isLocked(b);
  const st = task ? statusOf(dk, b, now) : null;
  const current = task ? st === 'running' : clockNow;
  const past = task ? st === 'done' || st === 'missed' : clockPast;
  const actual = task ? actualRange(dk, b.id) : null;
  const badge = st ? STATUS_BADGE[st] : current ? '現在' : '';
  const cls = ['slot', `kind-${KIND_OF[b.type]}`, current && 'is-current', past && 'is-past', canceled && 'is-canceled']
    .filter(Boolean)
    .join(' ');
  return html`<li class=${cls} aria-current=${current ? 'time' : nothing}>
    <span class="slot-time">${timeRange(b.start, b.end)}</span>
    <span class="slot-label">${b.label}${!st && past ? html`<span class="sr-only">（已過）</span>` : ''}${actual
        ? html`<span class="slot-actual">實際 ${actual[0]}${actual[1] ? html`–${actual[1]}` : ' 起'}</span>`
        : ''}</span>
    ${badge || canceled
      ? html`<span class="slot-badges">${badge ? html`<span class="badge ${current ? 'badge-now' : ''}">${badge}</span>` : ''}${canceled ? html`<span class="badge">取消</span>` : ''}</span>`
      : ''}
  </li>`;
}

/** 任務之間的空白，一律寫「休息」：自由時間、彈性時間 */
const blankRow = (s: number, e: number): TemplateResult =>
  html`<li class="slot slot-blank"><span class="slot-time">${timeRange(fmtTime(s), fmtTime(e))}</span><span class="slot-label">休息<span class="blank-dur">${fmtDur(e - s)}</span></span></li>`;

/**
 * 整張時間表。固定時段只在今天標示現在與已過；任務的狀態看實際紀錄。
 * 調整中（draft 不為 null）顯示草稿，每一列都是可編輯的欄位。任務之間的空白也列出來，寫成休息。
 */
export function timeline(dk: string, blocks: Block[], now: Date, draft: Draft | null): TemplateResult {
  const rows = draft ? draft.blocks : blocks;
  const clash = new Set(draft ? draftConflicts(draft).flatMap(c => [c.a, c.b]) : []);
  const today = dk === dkey(now);
  const info = !draft && today ? currentInfo(now, blocks) : null;
  const elapsed = elapsedMinutes(dk, now);
  const items = rows.length
    ? rows.flatMap((b, i) => {
        const past = today && isDone(b, elapsed);
        const row = draft ? editRow(draft, i, past, clash.has(i)) : viewRow(dk, b, now, info?.state === 'in' && info.idx === i, past);
        // 重疊時以前面所有任務最晚的結束時間算空白，才不會在重疊的任務之間多出一段空白
        const end = Math.max(...rows.slice(0, i + 1).map(r => toMin(r.end)));
        const next = i + 1 < rows.length ? toMin(rows[i + 1].start) : SLEEP_MIN;
        return next > end ? [row, blankRow(end, next)] : [row];
      })
    : html`<li class="slot-empty">這一天沒有安排。</li>`;
  return html`<ol class="timeline" id="timeline" role="list">${items}</ol>`;
}
