import type { Activity, Block, BlockType, Float } from '../types';
import { blocksOf, floatsOf, sortBlocks, wakeOf } from './blocks';
import { data, save } from './store';
import { elapsedMinutes, parseKey, toMin } from './time';

/** 星期 day 在每週範本裡的活動 */
export const templateFor = (day: number): Activity[] => data.template[day] ?? [];

/** 星期 day 原定的時間表（固定與任務），由每週範本產生 */
export const baseBlocks = (day: number): Block[] => blocksOf(templateFor(day));

/** 星期 day 的浮動事項（起床、洗澡、吃飯），順序就是按鈕的順序 */
export const floatsFor = (day: number): Float[] => floatsOf(templateFor(day));

/** 星期 day 的起床設定（範本裡類型是起床的活動） */
export const wakeFor = (day: number): Activity | undefined => wakeOf(templateFor(day));

/**
 * 某一天的計畫（固定與任務，不含浮動事項）：調整過的用調整後的，沒調整過的用原定時間表。
 * 計畫只是參考，實際做了什麼記在 log（見 log.ts），晚開始不用改計畫。
 */
export const blocksFor = (dateKey: string, day: number): Block[] => data.schedules[dateKey] ?? baseBlocks(day);

/** 某一天的暫待區：先拿出時間表、還沒決定要不要做的任務 */
export const pendingFor = (dateKey: string): Block[] => data.pending[dateKey] ?? [];

export const isAdjusted = (dateKey: string): boolean => Object.hasOwn(data.schedules, dateKey);

/** 這一天的時間表是否是舊版定稿的日子，定稿後不能再調整 */
export const isConfirmed = (dateKey: string): boolean => data.confirmed[dateKey] === true;

/** 某一天中指定類型的時段 */
export const blocksOfType = (blocks: Block[], ...types: BlockType[]): Block[] =>
  blocks.filter(b => types.includes(b.type));

/** 原定的起床時間：範本裡起床的開始時間，浮動的就是目標時間 */
export const plannedWake = (day: number): string | null => wakeFor(day)?.start ?? null;

// 恢復模式

export const isRecovering = (dateKey: string): boolean => data.recover[dateKey] !== undefined;

/** 恢復模式下，這個時段是否取消：只有運動時段，而且勾選當下還沒結束的才算 */
export function isCanceled(dateKey: string, b: Pick<Block, 'type' | 'end'>): boolean {
  const since = data.recover[dateKey];
  return since !== undefined && b.type === 'exercise' && toMin(b.end) > since;
}

export function setRecover(dateKey: string, on: boolean, now: Date): void {
  if (on) data.recover[dateKey] = elapsedMinutes(dateKey, now);
  else delete data.recover[dateKey];
  save();
}

/**
 * 把確認後的整天時間表與暫待區存起來。呼叫前要先通過 dayProblems 與 conflicts 檢查。
 * 如果時間表和原定時間表一模一樣，就不留調整紀錄。
 */
export function applyDay(dateKey: string, blocks: Block[], pending: Block[]): void {
  const sorted = sortBlocks(blocks);
  if (JSON.stringify(sorted) === JSON.stringify(baseBlocks(parseKey(dateKey).getDay()))) delete data.schedules[dateKey];
  else data.schedules[dateKey] = sorted;
  if (pending.length) data.pending[dateKey] = pending;
  else delete data.pending[dateKey];
  save();
}
