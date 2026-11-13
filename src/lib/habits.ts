import { data } from './store';
import { dkey } from './time';

/** 指定習慣在這一週（傳入 7 天）完成了幾天 */
export const weeklyCount = (habitId: string, week: Date[]): number =>
  week.filter(d => data.checks[dkey(d)]?.[habitId]).length;
