import { habitOf } from '../config/habits';
import { durOf } from './blocks';
import { habitItems, logFor } from './log';
import { blocksFor } from './schedule';
import { data } from './store';
import { dkey, toMin } from './time';

/**
 * 某一天某個習慣是否完成：當天這個習慣有一項完成就算（規則見 log.ts 的 habitItems）。
 * checks 是任務按結束時寫入的，也留著舊版手動勾的課業整理。
 */
export function achieved(dk: string, habitId: string, now: Date): boolean {
  if (data.checks[dk]?.[habitId]) return true;
  return habitItems(dk, now).get(habitId)?.some(i => i.done) ?? false;
}

/** 一個習慣在一週裡做了多少：完成幾次、實際花了幾分鐘 */
export interface WeekAmount {
  times: number;
  minutes: number;
}

/**
 * 指定習慣在這一週（傳入 7 天）的量。每週目標算的是天數，這裡補上次數與總時數：
 *   次數：完成的項目數，同一個任務被打斷分成好幾段也只算一次（見 habitItems）。
 *   總時數：實際紀錄裡這個習慣的任務做了多久，沒做滿的也算進去；加上完成的固定時段的長度。
 *   起床（固定或浮動）不算時數。還在進行的那一段等結束才算。
 */
export function weeklyAmount(habitId: string, week: Date[], now: Date): WeekAmount {
  let times = 0;
  let minutes = 0;
  for (const d of week) {
    const dk = dkey(d);
    const items = habitItems(dk, now).get(habitId) ?? [];
    times += items.filter(i => i.done).length;
    for (const e of logFor(dk)) {
      if (!e.float && e.end && habitOf(e) === habitId) minutes += toMin(e.end) - toMin(e.start);
    }
    // 起床的固定時段是盥洗準備的時間，不是在練習什麼，不算時數
    const clocks = blocksFor(dk, d.getDay()).filter(b => b.mode === 'clock' && b.type !== 'wake');
    for (const i of items) {
      const b = i.done ? clocks.find(x => x.id === i.ref) : undefined;
      if (b) minutes += durOf(b);
    }
  }
  return { times, minutes };
}

/** 指定習慣在這一週（傳入 7 天）完成了幾天 */
export const weeklyCount = (habitId: string, week: Date[], now: Date): number =>
  week.filter(d => achieved(dkey(d), habitId, now)).length;
