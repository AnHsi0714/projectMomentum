import { SCHEDULE } from '../config/schedule';
import type { Block, BlockType } from '../types';

/** 某一天中指定類型的時段 */
export const blocksOfType = (day: number, ...types: BlockType[]): Block[] =>
  SCHEDULE[day].filter(b => types.includes(b[3]));

/** 當天第一個時段的開始時間，即起床時間 */
export const wakeTime = (day: number): string => SCHEDULE[day][0][0];
