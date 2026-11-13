import { MODES } from '../config/habits';
import { data } from './store';
import { dkey } from './time';
import type { ModeId } from '../types';

/** 指定習慣在這一週（傳入 7 天）完成了幾天 */
export const weeklyCount = (habitId: string, week: Date[]): number =>
  week.filter(d => data.checks[dkey(d)]?.[habitId]).length;

/** 讀取某天的模式；匯入的資料若含未知值，一律當作正常模式 */
export function modeOf(dateKey: string): ModeId {
  const m = data.modes[dateKey];
  return m && m in MODES ? m : 'normal';
}
