import type { Block } from '../types';
import {
  baseBlocks, blanks, conflicts, copyBlock, dayProblems, durOf, isBlockType, isLocked, LIFE_TYPES, mergeSame, moveBlock, newId,
  resizeBlock, SLEEP_MIN, sortBlocks, STEP_MIN, withLock, type Conflict, type Problem,
} from './blocks';
import { applyDay, blocksFor, pendingFor } from './schedule';
import { dkey, elapsedMinutes, fmtTime, toMin } from './time';

/**
 * 「調整時間表」的草稿：開始調整時從這一天目前的時間表與暫待區複製一份，之後所有編輯、
 * 拖動、插入、刪除都只改草稿，按「確認」才存進資料，按取消就整份丟掉。
 * 整天的任務（包括已經結束的）都能改；過去的日子與舊版定稿的日子不能調整。
 * 任務可以拖到任何地方，暫時和別的任務重疊也可以；程式不會替你推動其他任務，
 * 重疊的地方列成衝突，全部解開才能確認。鎖定的任務不能拖動。
 */
export interface Draft {
  date: string;
  /** 正在編輯的整天時間表，依開始時間排好（拖動途中例外，放開後才重排） */
  blocks: Block[];
  /** 暫待區 */
  pending: Block[];
  /** 開始調整時的樣子，用來判斷有沒有未確認的變動 */
  original: Block[];
  originalPending: Block[];
  /** 上一次儲存沒通過檢查時，各列要修正的地方 */
  problems: Problem[];
}

export type Result = { ok: true; message: string; index?: number } | { ok: false; error: string };

const copy = (blocks: Block[]): Block[] => blocks.map(copyBlock);
const nameOf = (b: Block) => b.label.trim() || '未命名的任務';

export function startDraft(dateKey: string, day: number): Draft {
  const blocks = copy(blocksFor(dateKey, day));
  const pending = copy(pendingFor(dateKey));
  return { date: dateKey, blocks, pending, original: copy(blocks), originalPending: copy(pending), problems: [] };
}

/** 有沒有還沒確認的變動 */
export const isDirty = (d: Draft): boolean =>
  JSON.stringify([d.blocks, d.pending]) !== JSON.stringify([d.original, d.originalPending]);

/** 草稿目前的衝突 */
export const draftConflicts = (d: Draft): Conflict[] => conflicts(d.blocks);

/**
 * 依開始時間重排草稿，回傳某個任務重排後的位置。拖動或按鍵移動之後呼叫，
 * 清單與時間條的順序才會跟著時間走。任務本身是同一個物件，用它找新位置。
 */
export function sortDraft(d: Draft, keep?: Block): number {
  d.blocks = sortBlocks(d.blocks);
  return keep ? d.blocks.indexOf(keep) : -1;
}

/**
 * 時間條的左端（分鐘數）：開始調整時第一個任務所在整點的前一小時，第一個任務最早只能拉到這裡。
 * 只看開始調整時的樣子與目前最早的任務的整點，拖動第一個任務時刻度不會跟著跑。
 */
export function stripStart(d: Draft): number {
  const hour = (b: Block | undefined) => (b ? Math.floor(toMin(b.start) / 60) * 60 : SLEEP_MIN);
  const first = d.blocks.reduce<Block | undefined>((a, b) => (!a || toMin(b.start) < toMin(a.start) ? b : a), undefined);
  return Math.max(0, Math.min(hour(d.original[0]) - 60, hour(first)));
}

/**
 * 使用者在某一列改了名稱或類型。不重畫、不排序，邊打字邊更新草稿。改類型時保留原本的鎖定狀態。
 * 起床、吃飯、休息這類生活類型不能當成任務的類型（固定時段例外）。
 */
export function setField(d: Draft, index: number, field: 'label' | 'type', value: string): void {
  const b = d.blocks[index];
  if (!b) return;
  if (field === 'label') b.label = value;
  else if (isBlockType(value) && (!LIFE_TYPES.has(value) || isLocked(b))) d.blocks[index] = withLock({ ...b, type: value }, isLocked(b));
  // 這一列改過，之前標的問題先拿掉，下次儲存會重新檢查
  d.problems = d.problems.filter(p => p.index !== index);
}

/** 切換鎖定。生活類型（睡前準備、平日起床）解除鎖定就不再是時段，所以不能解除 */
export function toggleLock(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  const locked = !isLocked(b);
  if (!locked && LIFE_TYPES.has(b.type)) return { ok: false, error: `「${nameOf(b)}」是固定時段，不能解除固定。` };
  d.blocks[index] = withLock(b, locked);
  return {
    ok: true,
    index,
    message: locked ? `已把「${nameOf(b)}」設成固定，照時鐘自動開始與結束，不能拖動。` : `「${nameOf(b)}」改成任務，要按開始才開始。`,
  };
}

/** 在時間條上整塊移動第 index 個任務到 start（分鐘數），可以蓋過其他任務 */
export const moveRow = (d: Draft, index: number, start: number): void =>
  moveBlock(d.blocks, index, start, stripStart(d));

/** 在時間條上改第 index 個任務的結束時間（分鐘數） */
export const resizeRow = (d: Draft, index: number, end: number): void => resizeBlock(d.blocks, index, end);

/** 插入任務時填的內容 */
export interface NewTask {
  label: string;
  type: Block['type'];
  start: string;
  minutes: number;
  locked: boolean;
}

/** 有幾個衝突的說明文字，沒有就是空字串 */
const conflictNote = (d: Draft): string => {
  const n = draftConflicts(d).length;
  return n ? `現在有 ${n} 個衝突，拖開之後才能確認。` : '';
};

/**
 * 插入一個開始時間確定的任務，放在指定的時間。不推動其他任務：
 * 和原本的任務重疊就列成衝突，由使用者決定要挪開、縮短還是刪除。
 */
export function insertRow(d: Draft, t: NewTask): Result {
  const s = toMin(t.start);
  if (s + t.minutes > SLEEP_MIN) return { ok: false, error: `要在 ${fmtTime(SLEEP_MIN)} 前結束，不延後睡眠來補進度。` };
  const block = withLock({ id: newId(), start: t.start, end: fmtTime(s + t.minutes), label: t.label.trim(), type: t.type }, t.locked);
  d.blocks.push(block);
  const index = sortDraft(d, block);
  d.problems = [];
  return {
    ok: true,
    index,
    message: `已插入「${nameOf(block)}」${block.start} 到 ${block.end}。${conflictNote(d)}按確認後才會儲存。`,
  };
}

/** 刪除一列，它的時間變成空白 */
export function removeRow(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  d.blocks.splice(index, 1);
  d.problems = [];
  return { ok: true, message: `已移除「${nameOf(b)}」，${b.start} 到 ${b.end} 變成空白。${conflictNote(d)}按確認後才會儲存。`, index };
}

/** 把一列移到暫待區：今天先不排，但還沒決定要不要做。它的時間變成空白 */
export function parkRow(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  if (isLocked(b)) return { ok: false, error: `「${nameOf(b)}」是固定時段，不能移到暫待區。` };
  d.blocks.splice(index, 1);
  d.pending.push(b);
  d.problems = [];
  return { ok: true, message: `已把「${nameOf(b)}」移到暫待區。${conflictNote(d)}按確認後才會儲存。`, index };
}

/**
 * 把暫待區的第 k 個任務排回時間表：放進第一段放得下的空白（今天只看現在之後），
 * 都放不下就放進最長的一段並縮短成那段的長度。沒有 5 分鐘以上的空白就失敗。
 */
export function restorePending(d: Draft, k: number, now: Date): Result {
  const b = d.pending[k];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  const from = elapsedMinutes(d.date, now);
  const open = blanks(d.blocks)
    .map(([s, e]): [number, number] => [Math.max(s, from), e])
    .filter(([s, e]) => e - s >= STEP_MIN);
  if (!open.length) return { ok: false, error: '時間表上已經沒有空白，請先刪除或縮短其他任務。' };
  const fit = open.find(([s, e]) => e - s >= durOf(b));
  const [s, e] = fit ?? open.reduce((a, g) => (g[1] - g[0] > a[1] - a[0] ? g : a));
  const placed: Block = { ...b, start: fmtTime(s), end: fmtTime(Math.min(s + durOf(b), e)) };
  d.pending.splice(k, 1);
  d.blocks.push(placed);
  const index = sortDraft(d, placed);
  const short = fit ? '' : `，空白不夠長，縮短成 ${durOf(placed)} 分鐘`;
  return {
    ok: true,
    index,
    message: `已把「${nameOf(b)}」排回 ${placed.start} 到 ${placed.end}${short}。按確認後才會儲存。`,
  };
}

/** 從暫待區刪除，今天不做了 */
export function dropPending(d: Draft, k: number): Result {
  const b = d.pending[k];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  d.pending.splice(k, 1);
  return { ok: true, message: `已從暫待區刪除「${nameOf(b)}」，按確認後才會儲存。` };
}

/** 整天還原成原定時間表，暫待區清空 */
export function resetRows(d: Draft, day: number): void {
  d.blocks = copy(baseBlocks(day));
  d.pending = [];
  d.problems = [];
}

export type ConfirmResult = 'expired' | { problems: Problem[] } | { conflicts: Conflict[] } | { merged: number };

/**
 * 儲存調整：當天之內才能存，過了這一天就不能再存。
 * 欄位有問題或還有衝突就不存，回傳問題或衝突；沒問題就把相鄰而且內容相同的任務合併後存起來，回傳合併掉幾列。
 */
export function confirmDraft(d: Draft, now: Date): ConfirmResult {
  if (d.date < dkey(now)) return 'expired';
  const problems = dayProblems(d.blocks);
  d.problems = problems;
  if (problems.length > 0) return { problems };
  const found = draftConflicts(d);
  if (found.length > 0) return { conflicts: found };
  const { blocks, merged } = mergeSame(sortBlocks(d.blocks));
  applyDay(d.date, blocks, d.pending);
  return { merged };
}
