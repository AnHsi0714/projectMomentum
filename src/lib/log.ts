import { habitOf } from '../config/habits';
import type { Block, Entry, Float } from '../types';
import { durOf, isLocked, isWake, SLEEP_MIN } from './blocks';
import { floatsFor, isCanceled, plannedWake } from './schedule';
import { data, save } from './store';
import { elapsedMinutes, fmtTime, parseKey, toMin } from './time';

// 實際紀錄：計畫只是參考，任務按「開始」才開始、按「結束」才結束。
//   沒按結束就開始下一個：前一個記到現在，等於前一個延長了。
//   按了結束：之後到下一個開始之前都是休息。
//   浮動事項（吃飯、洗澡）按開始時，正在做的任務先中斷，之後可以按「繼續」接著做；不按就是休息。
//   固定時段（上課、通勤、睡前準備）照時鐘走，不用按；它開始時，正在進行的紀錄自動結束。
// 習慣是否達標只看實際紀錄：同一個習慣有任務按了結束就算達標；起床依起床時間自動判斷。

/** 一個任務今天的狀態。missed 是預定時間已經過了還沒開始（用 id 查時，看的是就寢時間） */
export type Status = 'todo' | 'running' | 'cut' | 'done' | 'missed';

export const logFor = (dk: string): Entry[] => data.log[dk] ?? [];

/** 正在進行的紀錄（沒有結束時間的那一段） */
export const running = (dk: string): Entry | undefined => logFor(dk).find(e => !e.end);

/** 某個任務或浮動事項的所有紀錄 */
export const entriesOf = (dk: string, ref: string): Entry[] => logFor(dk).filter(e => e.ref === ref);

/** 任務的狀態：預定的結束時間過了還沒開始，就是沒做，不再排進下一個 */
export function statusOf(dk: string, b: Block, now: Date): Status {
  const st = refStatus(dk, b.id, now);
  return st === 'todo' && elapsedMinutes(dk, now) >= toMin(b.end) ? 'missed' : st;
}

/** 用 id 判斷狀態，任務已經從時間表刪掉也查得到 */
export function refStatus(dk: string, ref: string, now: Date): Status {
  const es = entriesOf(dk, ref);
  const last = es[es.length - 1];
  if (!last) return elapsedMinutes(dk, now) >= SLEEP_MIN ? 'missed' : 'todo';
  if (!last.end) return 'running';
  return last.cut ? 'cut' : 'done';
}

/** 已經做了幾分鐘（只算結束了的紀錄） */
export const spentOn = (dk: string, ref: string): number =>
  entriesOf(dk, ref).reduce((sum, e) => sum + (e.end ? toMin(e.end) - toMin(e.start) : 0), 0);

/** 任務還剩幾分鐘：預定長度減掉已經做的 */
export const remainingOf = (dk: string, b: Block): number => Math.max(0, durOf(b) - spentOn(dk, b.id));

/** 下一個要做的任務：預定時間還沒過、還沒開始的第一個。時間過了沒開始的算沒做，不往後排；恢復模式取消的運動跳過 */
export const nextTask = (dk: string, blocks: Block[], now: Date): Block | undefined =>
  blocks.find(b => !isLocked(b) && statusOf(dk, b, now) === 'todo' && !isCanceled(dk, b));

/** 被浮動事項打斷、還沒做完的任務，取最近被打斷的那一個 */
export function cutTask(dk: string, blocks: Block[], now: Date): Block | undefined {
  const cut = blocks.filter(b => statusOf(dk, b, now) === 'cut');
  const endOf = (b: Block) => toMin(entriesOf(dk, b.id).at(-1)?.end ?? '00:00');
  return cut.sort((a, b) => endOf(b) - endOf(a))[0];
}

/**
 * 還沒做的浮動事項：開始過的不再列出；後面階段（stage）的做過了，前面階段的也不列。
 * 今天已經開始過任何事，就是起床了，不再列起床。
 */
export function floatsLeft(dk: string, floats: Float[]): Float[] {
  const done = floats.filter(f => entriesOf(dk, f.id).length);
  const stage = Math.max(logFor(dk).length ? 1 : 0, ...done.map(f => f.stage));
  return floats.filter(f => !done.includes(f) && f.stage >= stage);
}

/** 實際的起床時間：按過「起床」的開始時間；沒按起床就直接開始別的事，用今天第一筆紀錄的開始時間。平日起床是固定時段，回傳 undefined */
export const wokeAt = (dk: string, floats: Float[]): string | undefined => {
  const wake = floats.find(isWake);
  if (!wake) return undefined;
  return entriesOf(dk, wake.id)[0]?.start ?? logFor(dk)[0]?.start;
};

// 習慣達標

/** 起床晚於目標多少分鐘以內還算達標 */
export const WAKE_GRACE = 30;

/**
 * 「固定時間起床與睡覺」是否達標，依起床時間自動判斷：假日看按「起床」的時間，和目標差 30 分鐘以內算達標；
 * 平日起床是固定時段，到了起床時間就算達標。還不能判斷（還沒到起床時間、假日還沒按起床而且還沒超過寬限）回傳 null。
 */
export function wakeResult(dk: string, now: Date): { ok: boolean; at?: string; target: string } | null {
  const day = parseKey(dk).getDay();
  const target = plannedWake(day);
  if (!target) return null;
  const limit = toMin(target) + WAKE_GRACE;
  const elapsed = elapsedMinutes(dk, now);
  const wake = floatsFor(day).find(isWake);
  if (!wake) return elapsed >= toMin(target) ? { ok: true, at: target, target } : null;
  const at = wokeAt(dk, [wake]);
  if (at) return { ok: toMin(at) <= limit, at, target };
  return elapsed > limit ? { ok: false, target } : null;
}

/** 今天實際做過的任務，依習慣分組：每個習慣做了哪些任務（id）。浮動事項不算 */
export function startedByHabit(dk: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of logFor(dk)) {
    const habit = e.float ? null : habitOf(e);
    if (!habit) continue;
    const refs = out.get(habit) ?? [];
    if (!refs.includes(e.ref)) refs.push(e.ref);
    out.set(habit, refs);
  }
  return out;
}

/** 任務完成時勾選它的習慣：同一個習慣當天有任務做完就算達標，「本週」頁依這個累計 */
function autoCheck(dk: string, e: Entry): void {
  const habit = habitOf(e);
  if (habit) (data.checks[dk] ??= {})[habit] = true;
}

// 開始與結束

/**
 * 結束正在進行的紀錄，結束時間是 at（分鐘數），不早於它的開始。cut 表示被浮動事項打斷。
 * 開始與結束在同一分鐘、又不是被打斷的，當成按錯，整段拿掉。
 */
function close(dk: string, at: number, cut: boolean): void {
  const log = logFor(dk);
  const r = log.find(e => !e.end);
  if (!r) return;
  const end = Math.max(at, toMin(r.start));
  if (end === toMin(r.start) && !cut) {
    log.splice(log.indexOf(r), 1);
    return;
  }
  r.end = fmtTime(end);
  if (cut && !r.float) r.cut = true;
  if (!r.cut && !r.float) autoCheck(dk, r);
}

const push = (dk: string, e: Entry) => (data.log[dk] ??= []).push(e);

/** 開始（或繼續）一個任務。正在進行的紀錄記到現在 */
export function startTask(dk: string, b: Block, now: Date): void {
  const m = elapsedMinutes(dk, now);
  close(dk, m, false);
  push(dk, { ref: b.id, label: b.label, type: b.type, start: fmtTime(m) });
  save();
}

/** 開始一個浮動事項。正在做的任務先中斷，之後可以繼續；正在做的浮動事項直接結束 */
export function startFloat(dk: string, f: Float, now: Date): void {
  const m = elapsedMinutes(dk, now);
  close(dk, m, true);
  push(dk, { ref: f.id, label: f.label, type: f.type, start: fmtTime(m), float: true });
  save();
}

/** 結束正在進行的紀錄。at 省略時是現在；「在預定時間結束」時傳入預定的結束時間 */
export function endRunning(dk: string, now: Date, at?: number): void {
  close(dk, at ?? elapsedMinutes(dk, now), false);
  save();
}

/** 超過預定長度時回答「還在做」，這一段不再提醒 */
export function keepRunning(dk: string): void {
  const r = running(dk);
  if (!r) return;
  r.long = true;
  save();
}

/**
 * 正在進行的紀錄預定到幾點結束（分鐘數）：任務是開始時間加上還剩的長度，浮動事項是它的原定長度。
 */
export function plannedEnd(dk: string, e: Entry, blocks: Block[], floats: Float[]): number {
  const plan = e.float ? floats.find(f => f.id === e.ref) : blocks.find(b => b.id === e.ref);
  const left = !plan ? 0 : 'minutes' in plan ? plan.minutes : remainingOf(dk, plan);
  return toMin(e.start) + Math.max(left, 5);
}

/**
 * 固定時段照時鐘走：正在進行的紀錄碰到固定時段開始（或就寢），就在那個時間自動結束。
 * 畫面重畫前呼叫，有改動就存檔。回傳有沒有改動。
 */
export function settle(dk: string, blocks: Block[], now: Date): boolean {
  const r = running(dk);
  if (!r) return false;
  const m = elapsedMinutes(dk, now);
  const s = toMin(r.start);
  const stops = blocks.filter(isLocked).map(b => toMin(b.start)).filter(t => t > s && t <= m);
  if (m >= SLEEP_MIN) stops.push(SLEEP_MIN);
  if (!stops.length) return false;
  close(dk, Math.min(...stops), false);
  save();
  return true;
}
