import { SCHEDULE } from '../config/schedule';
import type { Block } from '../types';
import { chainEnds, dayProblems, isBlockType, isSortedByStart, reorderBlocks, SLEEP_MIN, sortBlocks, type Problem } from './blocks';
import { applyDay, blocksFor } from './schedule';
import { dkey, elapsedMinutes, fmtTime, toMin } from './time';

/**
 * 「調整時間表」的草稿：開始調整時從這一天目前的時間表複製一份，之後所有編輯、
 * 重排、新增、刪除都只改草稿，按「更新時間表」或「保存當天時間表」才存進資料，按取消就整份丟掉。
 * 整天的任務（包括已經結束的）都能改；過去的日子與已經保存定稿的日子不能調整。
 * 只編輯開始時間，結束時間一律由 chainEnds 接到下一個任務的開始。
 */
export interface Draft {
  date: string;
  /** 正在編輯的整天時間表，順序就是畫面上的順序 */
  blocks: Block[];
  /** 開始調整時的樣子，用來判斷有沒有未確認的變動 */
  original: Block[];
  /** 上一次儲存沒通過檢查時，各列要修正的地方 */
  problems: Problem[];
}

export type Result = { ok: true; message: string; index?: number } | { ok: false; error: string };

const copy = (blocks: Block[]): Block[] => chainEnds(blocks.map(b => [...b] as Block));
const nameOf = (b: Block) => b[2].trim() || '未命名的任務';

export function startDraft(dateKey: string, day: number): Draft {
  const blocks = copy(blocksFor(dateKey, day));
  return { date: dateKey, blocks, original: copy(blocks), problems: [] };
}

/** 有沒有還沒確認的變動 */
export const isDirty = (d: Draft): boolean => JSON.stringify(d.blocks) !== JSON.stringify(d.original);

type Field = 'start' | 'label' | 'type';

/** 使用者在某一列改了一個欄位。不重畫、不排序，邊打字邊更新草稿 */
export function setField(d: Draft, index: number, field: Field, value: string): void {
  const b = d.blocks[index];
  if (!b) return;
  if (field === 'start') {
    b[0] = value;
    chainEnds(d.blocks);
  } else if (field === 'label') b[2] = value;
  else if (isBlockType(value)) b[3] = value;
  // 這一列改過，之前標的問題先拿掉，下次儲存會重新檢查
  d.problems = d.problems.filter(p => p.index !== index);
}

/**
 * 新增一列。今天的話預設從現在（進位到 5 分鐘）開始，插在依開始時間該在的位置，
 * 前一個任務就在這時結束，不用另外檢查時間範圍。現在已經 23:00 前不到 5 分鐘、
 * 或那個時間已經有任務開始，或看的不是今天，就把開始時間留空放在最後面讓使用者填。
 * 回傳新列的位置與預設的開始時間（沒有就是空字串）。
 */
export function addRow(d: Draft, now: Date): { index: number; start: string } {
  const elapsed = elapsedMinutes(d.date, now);
  const m = Math.ceil(elapsed / 5) * 5;
  let start = d.date === dkey(now) && m < SLEEP_MIN ? fmtTime(m) : '';
  if (d.blocks.some(b => b[0] === start)) start = '';

  let at = d.blocks.length;
  if (start) {
    const next = d.blocks.findIndex(b => b[0] !== '' && toMin(b[0]) > m);
    if (next >= 0) at = next;
  }
  d.blocks.splice(at, 0, [start, '', '', 'free']);
  chainEnds(d.blocks);
  d.problems = [];
  return { index: at, start };
}

/** 刪除一列，前一個任務會延長到下一個任務開始 */
export function removeRow(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  d.blocks.splice(index, 1);
  chainEnds(d.blocks);
  d.problems = [];
  return { ok: true, message: `已移除「${nameOf(b)}」，前一個任務會延長到下一個任務開始。按更新或保存後才會儲存。`, index };
}

/**
 * 把第 from 列移到第 to 列的位置（用鍵盤差一格，拖曳可以差很多格）。
 * 開始時間要先填完整、依先後排好，才知道每個任務多長。
 * 各任務的長度不變，開始時間會跟著重排。
 */
export function reorderRows(d: Draft, from: number, to: number): Result {
  const moved = d.blocks[from];
  const target = d.blocks[to];
  if (!moved || !target || from === to) return { ok: false, error: '旁邊沒有可以交換的任務。' };
  if (!isSortedByStart(d.blocks) || new Set(d.blocks.map(b => b[0])).size < d.blocks.length) {
    return { ok: false, error: '開始時間還沒排好（有空白、同時開始或順序顛倒），請先修正開始時間，再調整順序。' };
  }
  d.blocks = chainEnds(reorderBlocks(d.blocks, from, to));
  d.problems = [];
  const message = Math.abs(from - to) === 1
    ? `已交換「${nameOf(moved)}」與「${nameOf(target)}」，按更新或保存後才會儲存。`
    : `已把「${nameOf(moved)}」移到「${nameOf(target)}」${to > from ? '之後' : '之前'}，按更新或保存後才會儲存。`;
  return { ok: true, message, index: to };
}

/** 整天還原成原定時間表 */
export function resetRows(d: Draft, day: number): void {
  d.blocks = copy(SCHEDULE[day]);
  d.problems = [];
}

/**
 * 儲存調整：當天之內才能存，過了這一天就不能再存。lock 為 true 是「保存當天時間表」，
 * 存完就定稿，這一天之後不能再調整；false 是「更新時間表」，之後還能再調整。
 * 沒問題就依開始時間排好、接上結束時間後存起來，回傳 null；有問題就記進草稿並回傳問題清單。
 */
export function confirmDraft(d: Draft, now: Date, lock: boolean): Problem[] | 'expired' | null {
  if (d.date < dkey(now)) return 'expired';
  const problems = dayProblems(d.blocks);
  d.problems = problems;
  if (problems.length > 0) return problems;
  applyDay(d.date, chainEnds(sortBlocks(d.blocks)), lock);
  return null;
}
