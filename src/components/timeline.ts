import { html, nothing, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { KIND_OF, KINDS, TYPE_LABEL } from '../config/kinds';
import { LIFE_TYPES, isLocked, SLEEP_MIN } from '../lib/blocks';
import { draftConflicts, type Draft } from '../lib/draft';
import { logFor, statusOf, type Status } from '../lib/log';
import { isCanceled } from '../lib/schedule';
import { dkey, elapsedMinutes, fmtDur, fmtTime, isDone, toMin } from '../lib/time';
import type { Block, BlockType, Entry } from '../types';
import { timeRange } from './time-range';

// 時間表：平常是唯讀的清單，左邊實際的時間、右邊計畫的時間；調整中（有草稿）每一列換成可編輯的欄位。

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

/** 平常的一列要顯示的內容。start、end 是分鐘數，用來排順序與算中間的休息 */
interface ViewItem {
  start: number;
  end: number;
  type: BlockType;
  label: string;
  /** 左邊的時間：實際的時間，沒有紀錄的用計畫的時間 */
  time: TemplateResult;
  /** 右邊的說明：計畫的時間，或「浮動」 */
  plan?: TemplateResult | string;
  badge: string;
  current: boolean;
  past: boolean;
  canceled: boolean;
}

/**
 * 實際紀錄的一段：左邊是實際開始與結束，右邊是計畫的時間。
 * 浮動事項沒有計畫，右邊寫「浮動」。一個任務被浮動事項打斷再繼續，會分成兩段，各自一列。
 */
function entryItem(dk: string, e: Entry, plan: Block | undefined, elapsed: number): ViewItem {
  const st: Status = !e.end ? 'running' : e.cut ? 'cut' : 'done';
  const start = toMin(e.start);
  return {
    start,
    end: e.end ? toMin(e.end) : Math.max(start, elapsed),
    type: e.type,
    label: plan?.label ?? e.label,
    time: e.end ? timeRange(e.start, e.end) : html`${e.start} 起`,
    plan: plan ? html`計畫 ${timeRange(plan.start, plan.end)}` : e.float ? '浮動' : undefined,
    badge: e.float && st !== 'running' ? '' : STATUS_BADGE[st],
    current: st === 'running',
    past: st !== 'running',
    canceled: plan ? isCanceled(dk, plan) : false,
  };
}

/**
 * 沒有實際紀錄的時段，照計畫的時間排。任務過了時間沒做標「沒做」；
 * 固定時段照時鐘走，今天標「現在」與已過。
 */
function planItem(dk: string, b: Block, now: Date, today: boolean, elapsed: number): ViewItem {
  const start = toMin(b.start);
  const end = toMin(b.end);
  const task = !isLocked(b);
  const st = task ? statusOf(dk, b, now) : null;
  const current = !task && today && start <= elapsed && elapsed < end;
  return {
    start,
    end,
    type: b.type,
    label: b.label,
    time: timeRange(b.start, b.end),
    badge: st ? STATUS_BADGE[st] : current ? '現在' : '',
    current,
    past: task ? st === 'missed' : today && isDone(b, elapsed),
    canceled: isCanceled(dk, b),
  };
}

/** 平常的一列：左邊時間、中間名稱、右邊計畫與標記。current 是現在進行中的，past 是已經結束或沒做，底色下沉 */
function viewRow(it: ViewItem): TemplateResult {
  const cls = ['slot', `kind-${KIND_OF[it.type]}`, it.current && 'is-current', it.past && 'is-past', it.canceled && 'is-canceled']
    .filter(Boolean)
    .join(' ');
  return html`<li class=${cls} aria-current=${it.current ? 'time' : nothing}>
    <span class="slot-time">${it.time}</span>
    <span class="slot-label">${it.label}${!it.badge && it.past ? html`<span class="sr-only">（已過）</span>` : ''}</span>
    ${it.plan || it.badge || it.canceled
      ? html`<span class="slot-badges">${it.plan ? html`<span class="slot-plan">${it.plan}</span>` : ''}${it.badge
          ? html`<span class="badge ${it.current ? 'badge-now' : ''}">${it.badge}</span>`
          : ''}${it.canceled ? html`<span class="badge">取消</span>` : ''}</span>`
      : ''}
  </li>`;
}

/**
 * 平常的時間表：做過的照實際紀錄排（包含浮動事項），沒有紀錄的照計畫排，全部依開始時間排好。
 * 計畫本身不改，晚開始也不用調整；這裡只是把實際的情形擺在原本的位置上。
 */
function viewItems(dk: string, blocks: Block[], now: Date): ViewItem[] {
  const today = dk === dkey(now);
  const elapsed = elapsedMinutes(dk, now);
  const log = logFor(dk);
  const logged = new Set(log.map(e => e.ref));
  const items = [
    ...log.map(e => entryItem(dk, e, e.float ? undefined : blocks.find(b => b.id === e.ref), elapsed)),
    ...blocks.filter(b => !logged.has(b.id)).map(b => planItem(dk, b, now, today, elapsed)),
  ];
  return items.sort((a, b) => a.start - b.start);
}

/** 任務之間的空白，一律寫「休息」：自由時間、彈性時間 */
const blankRow = (s: number, e: number): TemplateResult =>
  html`<li class="slot slot-blank"><span class="slot-time">${timeRange(fmtTime(s), fmtTime(e))}</span><span class="slot-label">休息<span class="blank-dur">${fmtDur(e - s)}</span></span></li>`;

/** 每一列後面接上到下一列之間的休息。重疊時以前面最晚的結束時間算，才不會在重疊的列之間多出一段空白 */
function withBlanks<T extends { start: number; end: number }>(rows: T[], render: (r: T, i: number) => TemplateResult): TemplateResult[] {
  let end = 0;
  return rows.flatMap((r, i) => {
    end = Math.max(end, r.end);
    const next = i + 1 < rows.length ? rows[i + 1].start : SLEEP_MIN;
    return next > end ? [render(r, i), blankRow(end, next)] : [render(r, i)];
  });
}

/**
 * 整張時間表。平常是做過的照實際、沒做的照計畫（見 viewItems）；
 * 調整中（draft 不為 null）顯示草稿，每一列都是可編輯的欄位。列之間的空白也列出來，寫成休息。
 */
export function timeline(dk: string, blocks: Block[], now: Date, draft: Draft | null): TemplateResult {
  let items: TemplateResult[];
  if (draft) {
    const clash = new Set(draftConflicts(draft).flatMap(c => [c.a, c.b]));
    const today = dk === dkey(now);
    const elapsed = elapsedMinutes(dk, now);
    const rows = draft.blocks.map(b => ({ b, start: toMin(b.start), end: toMin(b.end) }));
    items = withBlanks(rows, (r, i) => editRow(draft, i, today && isDone(r.b, elapsed), clash.has(i)));
  } else {
    items = withBlanks(viewItems(dk, blocks, now), viewRow);
  }
  return html`<ol class="timeline" id="timeline" role="list">${items.length ? items : html`<li class="slot-empty">這一天沒有安排。</li>`}</ol>`;
}
