import { TYPE_LABEL } from '../config/kinds';
import { DEFAULT_STAGES, SLEEP_TIME } from '../config/schedule';
import type { Activity, Block, BlockType, Float, Stage, WeekTemplate } from '../types';
import { fmtTime, toMin } from './time';

// 這個檔案只放時段的純運算（驗證、分類、拖動、衝突），不碰儲存，方便單獨測試。
// 每週範本的活動轉成一天的時段時分成三種（見 types.ts 的 Mode）：
//   固定（clock）：上課、通勤、臨時行程、睡前準備、平日起床，照時鐘自動開始與結束，不能拖。
//   任務（press）：深度工作、英文、運動、閱讀、規劃），按「開始」才開始，調整時可以自由拖動。
//   浮動事項（float）：假日起床、洗澡、吃飯，不排在時間表上，按「開始」才開始（見 types.ts 的 Float）。
// 休息不另外列，就是任務之間的空白。一天的時間表只放固定與任務；
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

// 固定與分類

/** 不能當成任務類型的生活類型：起床、洗澡、吃飯是浮動事項，休息是空白 */
export const LIFE_TYPES: ReadonlySet<BlockType> = new Set(['wake', 'prep', 'meal', 'rest']);

/** 固定時段：照時鐘自動開始與結束，不能拖動，到了結束時間就算完成 */
export const isClock = (b: Pick<Block, 'mode'>): boolean => b.mode === 'clock';

/** 設定固定或任務，回傳新的時段（其他欄位照抄） */
export const withClock = <T extends Block>(b: T, clock: boolean): T => ({ ...b, mode: clock ? 'clock' : 'press' });

// 每週範本

/** 範本裡排在時間條上的活動（固定與任務）轉成時段，id 照抄，依開始時間排好 */
export const blocksOf = (acts: Activity[]): Block[] =>
  sortBlocks(
    acts.flatMap(a =>
      a.mode === 'float' || !a.start
        ? []
        : [{ id: a.id, start: a.start, end: fmtTime(toMin(a.start) + a.minutes), label: a.label, type: a.type, mode: a.mode }],
    ),
  );

/**
 * 範本裡的浮動事項，順序照範本（就是按鈕的順序）。有開始時間的是目標時間。
 * 階段換成在 stages 裡的位置；找不到的階段當成最後一個，整天都會列出
 */
export const floatsOf = (acts: Activity[], stages: Stage[]): Float[] =>
  acts.flatMap(a => {
    if (a.mode !== 'float') return [];
    const at = stages.findIndex(s => s.id === a.stage);
    const f: Float = { id: a.id, label: a.label, type: a.type, minutes: a.minutes, stage: at >= 0 ? at : stages.length - 1 };
    if (a.start) f.start = a.start;
    return [f];
  });

/** 範本裡的起床（類型是 wake 的活動），沒有就是 undefined */
export const wakeOf = (acts: Activity[]): Activity | undefined => acts.find(a => a.type === 'wake');

/** 浮動事項是不是起床：起床的時間會顯示在「本週」頁，也用來判斷起床是否達標 */
export const isWake = (f: Pick<Float, 'type'>): boolean => f.type === 'wake';

const MODES: ReadonlySet<unknown> = new Set(['clock', 'press', 'float']);

/** 範本裡的一個活動格式是否正確：排在時間條上的要有開始時間，而且在就寢前結束 */
function parseActivity(raw: unknown): Activity | null {
  if (!isRecord(raw)) return null;
  const { id, label, type, mode, start, minutes, stage } = raw;
  if (typeof id !== 'string' || !id || typeof label !== 'string' || !label.trim() || !isBlockType(type)) return null;
  if (!MODES.has(mode) || typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < STEP_MIN) return null;
  if (start !== undefined && !isTime(start)) return null;
  if (mode !== 'float' && (start === undefined || toMin(start) + minutes > SLEEP_MIN)) return null;
  const stageId = legacyStage(stage);
  if (stageId === null) return null;
  const a: Activity = { id, label, type, mode: mode as Activity['mode'], minutes };
  if (start !== undefined) a.start = start;
  if (stageId !== undefined && mode === 'float') a.stage = stageId;
  return a;
}

/** 階段是 id；舊版存的是數字 0、1、2，換成預設階段的 id。格式不對回傳 null */
function legacyStage(stage: unknown): string | undefined | null {
  if (stage === undefined || (typeof stage === 'string' && stage)) return stage;
  if (typeof stage === 'number' && Number.isInteger(stage) && stage >= 0) return (DEFAULT_STAGES[stage] ?? DEFAULT_STAGES.at(-1)!).id;
  return null;
}

/** 讀取先後階段：每個要有 id 與名稱，id 不重複；格式不對或一個都沒有，用 fallback */
export function parseStages(raw: unknown, fallback: Stage[]): Stage[] {
  const list = Array.isArray(raw)
    ? raw.map(s => (isRecord(s) && typeof s.id === 'string' && s.id && typeof s.label === 'string' && s.label.trim()
        ? { id: s.id, label: s.label.trim() }
        : null))
    : [];
  const ok = list.length > 0 && list.every(s => s !== null) && new Set(list.map(s => s!.id)).size === list.length;
  return ok ? (list as Stage[]) : fallback.map(s => ({ ...s }));
}

/**
 * 讀取每週範本。某一天格式不對（缺了、有一個活動不對、id 重複）就整天用 fallback 的那一天，
 * 不會因為一個錯字讓那一天少了活動卻沒發現。
 */
export function parseTemplate(raw: unknown, fallback: WeekTemplate): WeekTemplate {
  const out: WeekTemplate = {};
  for (let day = 0; day < 7; day++) {
    const list = isRecord(raw) ? raw[day] : undefined;
    const acts = Array.isArray(list) ? list.map(parseActivity) : null;
    const ok = acts && acts.every((a): a is Activity => a !== null) && new Set(acts.map(a => a!.id)).size === acts.length;
    out[day] = ok ? (acts as Activity[]) : fallback[day].map(a => ({ ...a }));
  }
  return out;
}

export const copyBlock = <T extends Block>(b: T): T => ({ ...b });
export const durOf = (b: Pick<Block, 'start' | 'end'>): number => toMin(b.end) - toMin(b.start);

// 讀取

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 舊版沒寫 locked 時，這些類型預設是固定時段。只用在讀取舊資料，新資料一律寫 mode */
const LEGACY_LOCKED_TYPES: ReadonlySet<unknown> = new Set(['class', 'commute', 'event']);

/**
 * 一個時段的格式是否正確（不檢查和別的時段有沒有重疊）。接受新的物件格式，
 * 也接受舊版的陣列 [開始, 結束, 內容, 類型, 鎖定]，舊版的用 fallbackId 當 id。
 * 舊版沒有 mode，用 locked 換算；locked 也沒寫的，上課、通勤、臨時行程是固定，其餘是任務。
 */
function parseBlock(raw: unknown, fallbackId: string): Block | null {
  let o: Record<string, unknown>;
  if (Array.isArray(raw)) {
    if (raw.length !== 4 && raw.length !== 5) return null;
    o = { id: fallbackId, start: raw[0], end: raw[1], label: raw[2], type: raw[3], ...(raw.length === 5 ? { locked: raw[4] } : {}) };
  } else if (isRecord(raw)) o = raw;
  else return null;
  const { id, start, end, label, type, mode, locked } = o;
  if (typeof id !== 'string' || !id) return null;
  if (!isTime(start) || !isTime(end) || typeof label !== 'string' || !label.trim() || !isBlockType(type)) return null;
  if (toMin(end) <= toMin(start)) return null;
  if (mode !== undefined && mode !== 'clock' && mode !== 'press') return null;
  if (locked !== undefined && typeof locked !== 'boolean') return null;
  const clock = mode !== undefined ? mode === 'clock' : (locked ?? LEGACY_LOCKED_TYPES.has(type));
  return { id, start, end, label, type: legacyType(type, label), mode: clock ? 'clock' : 'press' };
}

/** 舊版的起床和睡前準備、洗澡共用 prep 類型，讀進來時名稱有「起床」的改成 wake */
export const legacyType = (type: BlockType, label: string): BlockType =>
  type === 'prep' && label.includes('起床') ? 'wake' : type;

/**
 * 舊版把自由時間與彈性時間當成任務，現在它們是空白：讀進來時拿掉，留下空白。
 */
const isLegacyBlank = (row: unknown): boolean =>
  Array.isArray(row) && (row[3] === 'free' || (typeof row[2] === 'string' && row[2].trim() === '彈性時間'));

/** 舊紀錄裡不是固定的起床、洗澡、吃飯、休息，現在是浮動事項或空白，不放在時間表上 */
const isLife = (b: Block): boolean => LIFE_TYPES.has(b.type) && !isClock(b);

/**
 * 檢查從備份或檔案讀進來的一天時間表。有一列格式不對就回傳 null，
 * 呼叫的人會當作這一天沒有調整，改用原定時間表。舊紀錄裡的生活時段讀進來時拿掉。
 * 計畫可以重疊：做過的任務保留原本的計畫時間當參考，可能和後來排的任務疊在一起；
 * 真正不能重疊的是實際紀錄與現在之後的安排，調整時由 draft.ts 的 draftConflicts 檢查。
 */
export function parseBlocks(raw: unknown): Block[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Block[] = [];
  for (const [i, row] of raw.entries()) {
    if (isLegacyBlank(row)) continue;
    const b = parseBlock(row, `m${i}`);
    if (!b) return null;
    if (!isLife(b)) out.push(b);
  }
  return sortBlocks(out);
}

/** 讀取暫待區：任務之間不必依序，也可以重疊，格式不對的任務與生活時段直接丟掉 */
export const parsePending = (raw: unknown): Block[] =>
  Array.isArray(raw)
    ? raw.map((r, i) => parseBlock(r, `q${i}`)).filter((b): b is Block => b !== null && !isLife(b))
    : [];

/** 依開始時間排序，回傳新陣列。開始時間相同時維持原本的先後 */
export const sortBlocks = <T extends Block>(blocks: T[]): T[] => [...blocks].sort((a, b) => toMin(a.start) - toMin(b.start));

/** 兩個時段相鄰或重疊（接在一起也算） */
export const touches = (a: Block, b: Block): boolean => toMin(a.start) <= toMin(b.end) && toMin(b.start) <= toMin(a.end);

/** 名稱、類型與是否固定都相同的兩個任務，接在一起或重疊時會合併 */
export const sameTask = (a: Block, b: Block): boolean =>
  a.label.trim() === b.label.trim() && a.type === b.type && isClock(a) === isClock(b);

/**
 * 把 same 認定是同一件事、而且相鄰或重疊的時段合併成一個：開始是較早的，結束是較晚的，id 用較早的。
 * combine 在合併時呼叫，可以把後一段的其他資訊帶過去。
 * 回傳依開始時間排好的新清單與少了幾列，不會改動傳進來的陣列與時段。
 */
export function mergeTouching<T extends Block>(
  blocks: T[],
  same: (a: T, b: T) => boolean,
  combine?: (into: T, from: T) => void,
): { blocks: T[]; merged: number } {
  const out: T[] = [];
  for (const b of sortBlocks(blocks)) {
    const into = out.find(o => same(o, b) && touches(o, b));
    if (!into) {
      out.push(copyBlock(b));
      continue;
    }
    if (toMin(b.end) > toMin(into.end)) into.end = b.end;
    combine?.(into, b);
  }
  return { blocks: out, merged: blocks.length - out.length };
}

/** 名稱、類型與是否固定都相同、而且相鄰或重疊的任務合併成一個（見 mergeTouching） */
export const mergeSame = (blocks: Block[]): { blocks: Block[]; merged: number } => mergeTouching(blocks, sameTask);

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
 * 最早到 earliest（時間條左端），最晚到就寢。固定時段不能動。直接改傳進來的陣列。
 */
export function moveBlock(blocks: Block[], i: number, start: number, earliest: number): void {
  const b = blocks[i];
  if (!b || isClock(b)) return;
  const len = durOf(b);
  const s = Math.min(Math.max(start, earliest), SLEEP_MIN - len);
  b.start = fmtTime(s);
  b.end = fmtTime(s + len);
}

/** 拉長或縮短第 i 個任務（改結束時間），至少 5 分鐘，最晚到就寢，可以蓋過後面的任務。直接改傳進來的陣列 */
export function resizeBlock(blocks: Block[], i: number, end: number): void {
  const b = blocks[i];
  if (!b || isClock(b)) return;
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
