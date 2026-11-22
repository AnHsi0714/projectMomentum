import { habitItems } from './log';
import { data } from './store';
import { dkey } from './time';

/**
 * 某一天某個習慣是否完成：當天這個習慣有一項完成就算（規則見 log.ts 的 habitItems）。
 * checks 是任務按結束時寫入的，也留著舊版手動勾的課業整理。
 */
export function achieved(dk: string, habitId: string, now: Date): boolean {
  if (data.checks[dk]?.[habitId]) return true;
  return habitItems(dk, now).get(habitId)?.some(i => i.done) ?? false;
}

/** 指定習慣在這一週（傳入 7 天）完成了幾天 */
export const weeklyCount = (habitId: string, week: Date[], now: Date): number =>
  week.filter(d => achieved(dkey(d), habitId, now)).length;
