import { TYPE_LABEL } from '../config/kinds';
import type { Block, BlockType } from '../types';
import { fmtTime, toMin } from './time';

// 這個檔案只放時段的純運算（驗證、排序、重排），不碰儲存，方便單獨測試。

/** 每天 23:00 就寢，任何任務都不能排到這之後 */
export const SLEEP_MIN = 23 * 60;

export const isBlockType = (v: unknown): v is BlockType => typeof v === 'string' && Object.hasOwn(TYPE_LABEL, v);

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * 檢查從備份或檔案讀進來的一天時間表。格式不對、時間倒退或重疊就回傳 null，
 * 呼叫的人會當作這一天沒有調整，改用原定時間表。
 */
export function parseBlocks(raw: unknown): Block[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Block[] = [];
  let prevEnd = 0;
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== 4) return null;
    const [start, end, label, type] = row as unknown[];
    if (!isTime(start) || !isTime(end) || typeof label !== 'string' || !label.trim() || !isBlockType(type)) return null;
    if (toMin(start) < prevEnd || toMin(end) <= toMin(start)) return null;
    prevEnd = toMin(end);
    out.push([start, end, label, type]);
  }
  return out;
}

/** 依開始時間排序，回傳新陣列 */
export const sortBlocks = (blocks: Block[]): Block[] => [...blocks].sort((a, b) => toMin(a[0]) - toMin(b[0]));

/** 編輯中的某一列有問題：index 是列在表上的位置，field 是要修正的欄位 */
export interface Problem {
  index: number;
  field: 'label' | 'start';
  message: string;
}

/**
 * 時間表是連續的：每個任務結束在下一個任務開始的時候，最後一個結束在 23:00 就寢。
 * 所以只需要開始時間，結束時間由這裡依表上的順序算出來，直接改傳進來的陣列。
 * 下一列還沒填開始時間時，這一列的結束先留空。
 */
export function chainEnds(blocks: Block[]): Block[] {
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    b[1] = next ? (isTime(next[0]) ? next[0] : '') : fmtTime(SLEEP_MIN);
  });
  return blocks;
}

/**
 * 按下確認前的檢查：每列要有名稱與開始時間，開始要早於 23:00，也不能和別列同時開始。
 * 開始時間的先後不用照表上的順序，確認時會自動依開始時間排好，所以不算問題。
 */
export function dayProblems(blocks: Block[]): Problem[] {
  const out: Problem[] = [];
  blocks.forEach((b, i) => {
    if (!b[2].trim()) out.push({ index: i, field: 'label', message: '請輸入任務名稱。' });
    if (!isTime(b[0])) return void out.push({ index: i, field: 'start', message: '請填入開始時間。' });
    if (toMin(b[0]) >= SLEEP_MIN) {
      return void out.push({ index: i, field: 'start', message: '開始時間要早於 23:00，不延後睡眠來補進度。' });
    }
    const same = blocks.find((o, j) => j < i && o[0] === b[0]);
    if (same) out.push({ index: i, field: 'start', message: `和「${same[2] || '未命名的任務'}」的開始時間相同。` });
  });
  return out;
}

/** 各列是否已經依開始時間排好（時間填不完整的列不算排好） */
export const isSortedByStart = (blocks: Block[]): boolean =>
  blocks.every((b, i) => isTime(b[0]) && (i === 0 || toMin(blocks[i - 1][0]) <= toMin(b[0])));

/**
 * 把第 from 個任務移到第 to 個的位置，兩者之間的任務依序讓位。相鄰的兩個就是交換先後。
 * 每個任務的長度不變，任務之間的空檔也留在原本的位置，整段的頭尾不變，
 * 只有先後與開始時間重排。回傳新的整份時間表，不會改動傳進來的陣列。
 */
export function reorderBlocks(blocks: Block[], from: number, to: number): Block[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const range = blocks.slice(lo, hi + 1);
  const gaps = range.slice(0, -1).map((b, k) => toMin(range[k + 1][0]) - toMin(b[1]));
  const items = range.map(b => ({ dur: toMin(b[1]) - toMin(b[0]), label: b[2], type: b[3] }));
  const [moved] = items.splice(from - lo, 1);
  items.splice(to - lo, 0, moved);

  let t = toMin(range[0][0]);
  const placed = items.map((it, k): Block => {
    const block: Block = [fmtTime(t), fmtTime(t + it.dur), it.label, it.type];
    t += it.dur + (gaps[k] ?? 0);
    return block;
  });
  return [...blocks.slice(0, lo), ...placed, ...blocks.slice(hi + 1)];
}
