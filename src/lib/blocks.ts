import { TYPE_LABEL } from '../config/kinds';
import { FLOATS, SCHEDULE, SLEEP_TIME } from '../config/schedule';
import type { Block, BlockType, Float, Row } from '../types';
import { fmtTime, toMin } from './time';

// 這個檔案只放時段的純運算（驗證、分類、拖動、衝突），不碰儲存，方便單獨測試。
// 原定時間表的每一列分成三種：
//   固定：鎖定的時段（上課、通勤、臨時行程、睡前準備、平日起床），照時鐘自動開始與結束，不能拖。
//   任務：按「開始」才開始的時段（深度工作、英文、運動、閱讀、規劃），調整時可以自由拖動。
//   浮動事項：沒鎖定的起床、洗澡、吃飯，不排在時間表上，按「開始」才開始（見 types.ts 的 Float）。
// 沒鎖定的休息不另外列，就是任務之間的空白。一天的時間表只放固定與任務；
// 調整時任務可以暫時重疊，沒有衝突才能儲存。

/** 就寢時間的分鐘數，任何任務都不能排到這之後；時間本身在 config/schedule.ts 的 SLEEP_TIME */
export const SLEEP_MIN = toMin(SLEEP_TIME);

/** 拖動時間條時一格 5 分鐘，每個任務也至少這麼長 */
export const STEP_MIN = 5;

export const isBlockType = (v: unknown): v is BlockType => typeof v === 'string' && Object.hasOwn(TYPE_LABEL, v);

export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * 使用者輸入的時間：接受 24 小時制的「1430」「14:30」「930」「9:30」，回傳 HH:MM；看不懂就回傳 null。
 */
export function parseTimeInput(raw: string): string | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? fmtTime(h * 60 + min) : null;
}

/** 新任務的 id：時間加亂數，同一天裡不會重複 */
export const newId = (): string => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 鎖定與分類

/** 沒有特別設定時，這些類型的任務是鎖定的：時間由別人決定，照時鐘自動開始與結束 */
const LOCKED_TYPES: ReadonlySet<BlockType> = new Set(['class', 'commute', 'event']);

/** 不能當成任務類型的生活類型：起床、洗澡、吃飯是浮動事項，休息是空白 */
export const LIFE_TYPES: ReadonlySet<BlockType> = new Set(['prep', 'meal', 'rest']);

const defaultLocked = (type: BlockType) => LOCKED_TYPES.has(type);

export const isLocked = (b: Pick<Block, 'type' | 'locked'>): boolean => b.locked ?? defaultLocked(b.type);

/** 設定鎖定，回傳新的任務。和類型的預設相同時不寫 locked，紀錄才能和原定時間表直接比對 */
export function withLock(b: Block, locked: boolean): Block {
  const { locked: _, ...base } = b;
  return locked === defaultLocked(b.type) ? base : { ...base, locked };
}

/** 原定時間表的一列轉成時段，id 是它在那一天的位置 */
function fromRow(row: Row, id: string): Block {
  const [start, end, label, type, locked] = row;
  const b: Block = { id, start, end, label, type };
  return locked === undefined ? b : withLock(b, locked);
}

/** 星期 day 原定的時間表（固定與任務），id 是 p 加上列的位置 */
export const baseBlocks = (day: number): Block[] => SCHEDULE[day].map((row, i) => fromRow(row, `p${i}`));

/** 星期 day 的浮動事項（起床、洗澡、吃飯），依先後階段排好 */
export const floatsFor = (day: number): Float[] => FLOATS[day].map(f => ({ ...f }));

/** 浮動事項是不是起床：起床的時間會顯示在「本週」頁，也用來判斷起床是否達標 */
export const isWake = (f: Pick<Float, 'id'>): boolean => f.id === 'wake';

export const copyBlock = (b: Block): Block => ({ ...b });
export const durOf = (b: Pick<Block, 'start' | 'end'>): number => toMin(b.end) - toMin(b.start);

// 讀取

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 一個時段的格式是否正確（不檢查和別的時段有沒有重疊）。接受新的物件格式，
 * 也接受舊版的陣列 [開始, 結束, 內容, 類型, 鎖定]，舊版的用 fallbackId 當 id。
 */
function parseBlock(raw: unknown, fallbackId: string): Block | null {
  let o: Record<string, unknown>;
  if (Array.isArray(raw)) {
    if (raw.length !== 4 && raw.length !== 5) return null;
    o = { id: fallbackId, start: raw[0], end: raw[1], label: raw[2], type: raw[3], ...(raw.length === 5 ? { locked: raw[4] } : {}) };
  } else if (isRecord(raw)) o = raw;
  else return null;
  const { id, start, end, label, type, locked } = o;
  if (typeof id !== 'string' || !id) return null;
  if (!isTime(start) || !isTime(end) || typeof label !== 'string' || !label.trim() || !isBlockType(type)) return null;
  if (toMin(end) <= toMin(start)) return null;
  if (locked !== undefined && typeof locked !== 'boolean') return null;
  const b: Block = { id, start, end, label, type };
  return locked === undefined ? b : withLock(b, locked);
}

/**
 * 舊版把自由時間與彈性時間當成任務，現在它們是空白：讀進來時拿掉，留下空白。
 */
const isLegacyBlank = (row: unknown): boolean =>
  Array.isArray(row) && (row[3] === 'free' || (typeof row[2] === 'string' && row[2].trim() === '彈性時間'));

/** 舊紀錄裡沒鎖定的起床、洗澡、吃飯、休息，現在是浮動事項或空白，不放在時間表上 */
const isLife = (b: Block): boolean => LIFE_TYPES.has(b.type) && !isLocked(b);

/**
 * 檢查從備份或檔案讀進來的一天時間表。格式不對、時間倒退或重疊就回傳 null，
 * 呼叫的人會當作這一天沒有調整，改用原定時間表。舊紀錄裡的生活時段讀進來時拿掉。
 */
export function parseBlocks(raw: unknown): Block[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Block[] = [];
  let prevEnd = 0;
  for (const [i, row] of raw.entries()) {
    if (isLegacyBlank(row)) continue;
    const b = parseBlock(row, `m${i}`);
    if (!b || toMin(b.start) < prevEnd) return null;
    prevEnd = toMin(b.end);
    if (!isLife(b)) out.push(b);
  }
  return out;
}

/** 讀取暫待區：任務之間不必依序，也可以重疊，格式不對的任務與生活時段直接丟掉 */
export const parsePending = (raw: unknown): Block[] =>
  Array.isArray(raw)
    ? raw.map((r, i) => parseBlock(r, `q${i}`)).filter((b): b is Block => b !== null && !isLife(b))
    : [];

/** 依開始時間排序，回傳新陣列。開始時間相同時維持原本的先後 */
export const sortBlocks = (blocks: Block[]): Block[] => [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start));

/**
 * 把相鄰、名稱、類型與鎖定都相同、而且前一個結束時下一個剛好開始的任務合併成一個，
 * 結束時間延到後一個的結束，id 用前一個的。回傳新的時間表與少了幾列，不會改動傳進來的陣列。
 */
export function mergeSame(blocks: Block[]): { blocks: Block[]; merged: number } {
  const out: Block[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.label.trim() === b.label.trim() && last.type === b.type && isLocked(last) === isLocked(b) && last.end === b.start) {
      last.end = b.end;
    } else out.push(copyBlock(b));
  }
  return { blocks: out, merged: blocks.length - out.length };
}

// 衝突

/** 兩個任務重疊：a、b 是在時間表上的位置（a < b），[start, end) 是重疊的分鐘數 */
export interface Conflict {
  a: number;
  b: number;
  start: number;
  end: number;
}

/** 列出所有重疊的兩兩組合，依重疊開始的時間排好。調整時任務可以暫時重疊，有衝突就不能儲存 */
export function conflicts(blocks: Block[]): Conflict[] {
  const out: Conflict[] = [];
  for (let a = 0; a < blocks.length; a++) {
    for (let b = a + 1; b < blocks.length; b++) {
      const start = Math.max(toMin(blocks[a].start), toMin(blocks[b].start));
      const end = Math.min(toMin(blocks[a].end), toMin(blocks[b].end));
      if (end > start) out.push({ a, b, start, end });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

/**
 * 時間條上每個任務放在第幾排：不重疊的都在第一排，重疊的往下一排放，兩個都看得到也抓得到。
 * 回傳每個任務的排數（和 blocks 的位置對應）與總共幾排。
 */
export function lanes(blocks: Block[]): { lane: number[]; count: number } {
  const lane = blocks.map(() => 0);
  const ends: number[] = [];
  blocks
    .map((_, i) => i)
    .sort((x, y) => toMin(blocks[x].start) - toMin(blocks[y].start) || x - y)
    .forEach(i => {
      let k = ends.findIndex(e => e <= toMin(blocks[i].start));
      if (k < 0) k = ends.length;
      ends[k] = toMin(blocks[i].end);
      lane[i] = k;
    });
  return { lane, count: Math.max(1, ends.length) };
}

// 儲存前的檢查

/** 編輯中的某一列有問題：index 是列在表上的位置 */
export interface Problem {
  index: number;
  field: 'label' | 'time';
  message: string;
}

/**
 * 按下確認前的檢查：每列要有名稱；時間由時間條維持，正常不會出錯，
 * 但還是確認一次結束晚於開始、也不超過就寢。重疊另外由 conflicts 檢查。
 */
export function dayProblems(blocks: Block[]): Problem[] {
  const out: Problem[] = [];
  blocks.forEach((b, i) => {
    if (!b.label.trim()) out.push({ index: i, field: 'label', message: '請輸入任務名稱。' });
    if (!isTime(b.start) || !isTime(b.end) || durOf(b) <= 0) out.push({ index: i, field: 'time', message: '時間不正確。' });
    else if (toMin(b.end) > SLEEP_MIN) out.push({ index: i, field: 'time', message: `要在 ${SLEEP_TIME} 前結束，不延後睡眠來補進度。` });
  });
  return out;
}

// 時間條上的拖動

/**
 * 整塊移動第 i 個任務，長度不變。可以越過、蓋過其他任務（變成衝突，之後再處理），
 * 最早到 earliest（時間條左端），最晚到就寢。鎖定的任務不能動。直接改傳進來的陣列。
 */
export function moveBlock(blocks: Block[], i: number, start: number, earliest: number): void {
  const b = blocks[i];
  if (!b || isLocked(b)) return;
  const len = durOf(b);
  const s = Math.min(Math.max(start, earliest), SLEEP_MIN - len);
  b.start = fmtTime(s);
  b.end = fmtTime(s + len);
}

/** 拉長或縮短第 i 個任務（改結束時間），至少 5 分鐘，最晚到就寢，可以蓋過後面的任務。直接改傳進來的陣列 */
export function resizeBlock(blocks: Block[], i: number, end: number): void {
  const b = blocks[i];
  if (!b || isLocked(b)) return;
  b.end = fmtTime(Math.min(Math.max(end, toMin(b.start) + STEP_MIN), SLEEP_MIN));
}

/**
 * 任務之間的空白，給畫面用：[開始, 結束] 分鐘數，依時間排好。
 * 任務重疊時以聯集計算，從第一個任務開始算到就寢。
 */
export function blanks(blocks: Block[]): [number, number][] {
  const out: [number, number][] = [];
  let reach = -1;
  for (const b of sortBlocks(blocks)) {
    const s = toMin(b.start);
    if (reach >= 0 && s > reach) out.push([reach, s]);
    reach = Math.max(reach, toMin(b.end));
  }
  if (reach >= 0 && reach < SLEEP_MIN) out.push([reach, SLEEP_MIN]);
  return out;
}
