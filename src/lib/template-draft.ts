import { SLEEP_TIME } from '../config/schedule';
import type { Activity, BlockType, Mode } from '../types';
import { newId, parseTimeInput, SLEEP_MIN, STEP_MIN } from './blocks';
import { fmtTime, toMin } from './time';

// 設定頁編輯每週範本時的草稿與檢查。只放純運算，不碰儲存，方便單獨測試。
// 草稿是某一天的活動清單，欄位照使用者輸入的文字留著，按儲存時才檢查、轉成 Activity。

/** 草稿裡的一個活動。start、minutes 是輸入欄位的文字，儲存時才檢查。stage 是階段 id，不是浮動事項時是空字串 */
export interface ActRow {
  id: string;
  label: string;
  type: BlockType;
  mode: Mode;
  start: string;
  minutes: string;
  stage: string;
}

export interface TemplateDraft {
  day: number;
  rows: ActRow[];
  /** 開始編輯時的內容，用來判斷有沒有改過 */
  orig: string;
  /** 上一次按儲存時找到的問題，標在欄位旁邊 */
  problems: RowProblem[];
}

export type RowField = 'label' | 'type' | 'start' | 'minutes' | 'stage';

export interface RowProblem {
  index: number;
  field: RowField;
  message: string;
}

const toRow = (a: Activity): ActRow => ({
  id: a.id,
  label: a.label,
  type: a.type,
  mode: a.mode,
  start: a.start ?? '',
  minutes: String(a.minutes),
  stage: a.stage ?? '',
});

const snapshot = (rows: ActRow[]) => JSON.stringify(rows);

/** 開始編輯某一天：清單照範本的順序（固定與任務照時間，浮動事項照按鈕順序） */
export function startTemplateDraft(day: number, acts: Activity[]): TemplateDraft {
  const rows = order(acts).map(toRow);
  return { day, rows, orig: snapshot(rows), problems: [] };
}

export const isTemplateDirty = (d: TemplateDraft): boolean => snapshot(d.rows) !== d.orig;

/** 新增一個空白的任務，回傳它在清單上的位置 */
export function addRow(d: TemplateDraft): number {
  d.rows.push({ id: newId(), label: '', type: 'deep', mode: 'press', start: '', minutes: '60', stage: '' });
  return d.rows.length - 1;
}

export function removeRow(d: TemplateDraft, i: number): ActRow | undefined {
  const [row] = d.rows.splice(i, 1);
  d.problems = [];
  return row;
}

/** 改某一列的一個欄位（輸入什麼就存什麼，儲存時才檢查） */
export function setRow(d: TemplateDraft, i: number, field: keyof Omit<ActRow, 'id'>, value: string): void {
  const row = d.rows[i];
  if (!row) return;
  if (field === 'type') row.type = value as BlockType;
  else if (field === 'mode') {
    row.mode = value as Mode;
    if (row.mode !== 'float') row.stage = ''; // 只有浮動事項有階段
  }
  else row[field] = value;
}

/** 整天換成另一份活動（例如預設範本），還沒儲存 */
export function replaceRows(d: TemplateDraft, acts: Activity[]): void {
  d.rows = order(acts).map(toRow);
  d.problems = [];
}

/** 範本的順序：固定與任務依開始時間，浮動事項排在後面，彼此照原本的先後 */
function order(acts: Activity[]): Activity[] {
  const timed = acts.filter(a => a.mode !== 'float').sort((a, b) => toMin(a.start!) - toMin(b.start!));
  return [...timed, ...acts.filter(a => a.mode === 'float')];
}

/**
 * 儲存前的檢查：名稱、時間格式、長度、就寢前結束；固定和任務都是排在時間表上的任務，彼此不能重疊；
 * 起床一天最多一個。浮動事項可以不填開始時間，填了是目標時間，但要選一個現有的先後階段（stageIds）。
 */
export function templateProblems(rows: ActRow[], stageIds: string[]): RowProblem[] {
  const out: RowProblem[] = [];
  const spans: { index: number; start: number; end: number }[] = [];
  rows.forEach((r, index) => {
    if (!r.label.trim()) out.push({ index, field: 'label', message: '請輸入名稱。' });
    if (r.mode === 'float' && !stageIds.includes(r.stage)) out.push({ index, field: 'stage', message: '請選擇先後階段。' });
    const minutes = Number(r.minutes);
    const okLen = r.minutes.trim() !== '' && Number.isInteger(minutes) && minutes >= STEP_MIN;
    if (!okLen) out.push({ index, field: 'minutes', message: `長度至少 ${STEP_MIN} 分鐘，請填整數。` });
    const raw = r.start.trim();
    const start = raw ? parseTimeInput(raw) : null;
    if (raw && !start) {
      out.push({ index, field: 'start', message: '開始時間請用 24 小時制，例如 1400 或 14:00。' });
    } else if (r.mode !== 'float' && !start) {
      out.push({ index, field: 'start', message: '固定和任務要填開始時間。' });
    } else if (start && okLen && r.mode !== 'float') {
      const s = toMin(start);
      if (s + minutes > SLEEP_MIN) out.push({ index, field: 'start', message: `要在 ${SLEEP_TIME} 前結束，不延後睡眠來補進度。` });
      else spans.push({ index, start: s, end: s + minutes });
    } else if (start && toMin(start) >= SLEEP_MIN) {
      out.push({ index, field: 'start', message: `目標時間要在 ${SLEEP_TIME} 之前。` });
    }
  });
  out.push(...overlapsOf(rows, spans));
  rows
    .map((r, index) => ({ r, index }))
    .filter(({ r }) => r.type === 'wake')
    .slice(1)
    .forEach(({ index }) => out.push({ index, field: 'type', message: '一天只能有一個起床。' }));
  return out.sort((p, q) => p.index - q.index);
}

/** 固定或任務的一列在時間條上的位置（分鐘），開始時間或長度還不完整就是 null。不檢查就寢 */
export function spanOf(r: ActRow): { start: number; end: number } | null {
  if (r.mode === 'float') return null;
  const start = parseTimeInput(r.start);
  const minutes = Number(r.minutes);
  if (!start || !Number.isInteger(minutes) || minutes < STEP_MIN) return null;
  return { start: toMin(start), end: toMin(start) + minutes };
}

/** 重疊：兩邊都標，訊息寫出和誰、從幾點開始重疊 */
function overlapsOf(rows: ActRow[], spans: { index: number; start: number; end: number }[]): RowProblem[] {
  const out: RowProblem[] = [];
  const name = (i: number) => rows[i].label.trim() || `活動 ${i + 1}`;
  for (let a = 0; a < spans.length; a++) {
    for (let b = a + 1; b < spans.length; b++) {
      const x = spans[a];
      const y = spans[b];
      const s = Math.max(x.start, y.start);
      if (Math.min(x.end, y.end) <= s) continue;
      out.push({ index: x.index, field: 'start', message: `和「${name(y.index)}」在 ${fmtTime(s)} 重疊。` });
      out.push({ index: y.index, field: 'start', message: `和「${name(x.index)}」在 ${fmtTime(s)} 重疊。` });
    }
  }
  return out;
}

/** 編輯中就看得到的重疊，不用等按儲存 */
export const liveOverlaps = (rows: ActRow[]): RowProblem[] =>
  overlapsOf(rows, rows.flatMap((r, index) => {
    const sp = spanOf(r);
    return sp ? [{ index, ...sp }] : [];
  }));

/**
 * 照時間重新排清單：固定與任務依開始時間，還沒填好時間的排在它們後面，浮動事項在最後，
 * 同一類照原本的先後。順序有變就清掉上一次儲存時的問題（位置對不上了）。回傳順序有沒有變
 */
export function sortRows(d: TemplateDraft): boolean {
  const key = (r: ActRow) => {
    if (r.mode === 'float') return 2 * 1440;
    const sp = spanOf(r);
    const start = parseTimeInput(r.start);
    return sp ? sp.start : start ? toMin(start) : 1440;
  };
  const before = d.rows.map(r => r.id).join();
  d.rows = d.rows.map((r, i) => ({ r, i })).sort((a, b) => key(a.r) - key(b.r) || a.i - b.i).map(x => x.r);
  const changed = d.rows.map(r => r.id).join() !== before;
  if (changed) d.problems = [];
  return changed;
}

/**
 * 時間條上的活動（有完整時間的固定與任務），依 id 排列。清單重排時這個順序不變，
 * 所以拖動途中清單可以跟著重排，時間條上被拖的那一塊還是同一個元素。回傳每一塊對應的列與它在清單上的位置
 */
export function stripRows(rows: ActRow[]): { row: ActRow; index: number }[] {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(x => spanOf(x.row))
    .sort((a, b) => (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
}

/** 時間條上整塊移動第 i 列，長度不變：最早到 earliest（時間條左端），最晚到就寢 */
export function moveTemplateRow(d: TemplateDraft, i: number, start: number, earliest: number): void {
  const r = d.rows[i];
  const sp = r && spanOf(r);
  if (!sp) return;
  const len = sp.end - sp.start;
  r.start = fmtTime(Math.min(Math.max(start, earliest), SLEEP_MIN - len));
}

/** 時間條上改第 i 列的長度（拉結束時間）：至少 5 分鐘，最晚到就寢 */
export function resizeTemplateRow(d: TemplateDraft, i: number, end: number): void {
  const r = d.rows[i];
  const sp = r && spanOf(r);
  if (!sp) return;
  r.minutes = String(Math.min(Math.max(end, sp.start + STEP_MIN), SLEEP_MIN) - sp.start);
}

/** 檢查通過的草稿轉成範本裡的活動，依範本的順序排好 */
export function toActivities(rows: ActRow[]): Activity[] {
  return order(
    rows.map(r => {
      const a: Activity = { id: r.id, label: r.label.trim(), type: r.type, mode: r.mode, minutes: Number(r.minutes) };
      const start = r.start.trim() ? parseTimeInput(r.start) : null;
      if (start) a.start = start;
      if (r.mode === 'float') a.stage = r.stage;
      return a;
    }),
  );
}

/** 儲存：有問題就記在草稿上、回傳 null；沒問題回傳要存的活動，草稿換成存好的樣子 */
export function commitTemplateDraft(d: TemplateDraft, stageIds: string[]): Activity[] | null {
  d.problems = templateProblems(d.rows, stageIds);
  if (d.problems.length) return null;
  const acts = toActivities(d.rows);
  d.rows = acts.map(toRow);
  d.orig = snapshot(d.rows);
  return acts;
}
