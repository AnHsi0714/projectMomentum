import { wakeResult } from './log';
import { data } from './store';
import { dkey } from './time';

/**
 * 某一天某個習慣是否達標。「固定時間起床與睡覺」依起床時間自動判斷（見 log.ts 的 wakeResult），
 * 其餘看 checks：有任務的習慣在任務按結束時自動寫入。
 */
export function achieved(dk: string, habitId: string, now: Date): boolean {
  if (habitId === 'sleep') return wakeResult(dk, now)?.ok ?? false;
  return !!data.checks[dk]?.[habitId];
}

/** 指定習慣在這一週（傳入 7 天）達標了幾天 */
export const weeklyCount = (habitId: string, week: Date[], now: Date): number =>
  week.filter(d => achieved(dkey(d), habitId, now)).length;
