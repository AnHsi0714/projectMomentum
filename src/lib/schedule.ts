import { SCHEDULE } from '../config/schedule';
import type { Block, BlockType } from '../types';
import { sortBlocks } from './blocks';
import { data, save } from './store';
import { elapsedMinutes, parseKey, toMin } from './time';

/** 某一天實際使用的時間表：調整過的用調整後的，沒調整過的用原定時間表 */
export const blocksFor = (dateKey: string, day: number): Block[] => data.schedules[dateKey] ?? SCHEDULE[day];

export const isAdjusted = (dateKey: string): boolean => Object.hasOwn(data.schedules, dateKey);

/** 這一天的時間表是否已經按過確認而定稿，定稿後不能再調整 */
export const isConfirmed = (dateKey: string): boolean => data.confirmed[dateKey] === true;

/** 某一天中指定類型的時段 */
export const blocksOfType = (blocks: Block[], ...types: BlockType[]): Block[] =>
  blocks.filter(b => types.includes(b[3]));

/** 當天第一個時段的開始時間，即起床時間。整天都沒有時段就回傳 null */
export const wakeTime = (blocks: Block[]): string | null => blocks[0]?.[0] ?? null;

// 恢復模式

export const isRecovering = (dateKey: string): boolean => data.recover[dateKey] !== undefined;

/** 恢復模式下，這個時段是否取消：只有運動時段，而且勾選當下還沒結束的才算 */
export function isCanceled(dateKey: string, b: Block): boolean {
  const since = data.recover[dateKey];
  return since !== undefined && b[3] === 'exercise' && toMin(b[1]) > since;
}

export function setRecover(dateKey: string, on: boolean, now: Date): void {
  if (on) data.recover[dateKey] = elapsedMinutes(dateKey, now);
  else delete data.recover[dateKey];
  save();
}

/**
 * 把確認後的整天時間表存起來。呼叫前要先通過 dayProblems 檢查。
 * 如果結果和原定時間表一模一樣，就不留調整紀錄。lock 為 true 時同時把這一天標成定稿。
 */
export function applyDay(dateKey: string, blocks: Block[], lock: boolean): void {
  const sorted = sortBlocks(blocks);
  if (JSON.stringify(sorted) === JSON.stringify(SCHEDULE[parseKey(dateKey).getDay()])) delete data.schedules[dateKey];
  else data.schedules[dateKey] = sorted;
  if (lock) data.confirmed[dateKey] = true;
  save();
}
