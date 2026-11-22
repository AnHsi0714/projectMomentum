import { habitOf } from '../config/habits';
import type { Block, Entry, Float } from '../types';
import { durOf, isClock, isWake, SLEEP_MIN } from './blocks';
import { blocksFor, floatsFor, isCanceled } from './schedule';
import { data, save } from './store';
import { elapsedMinutes, fmtTime, parseKey, toMin } from './time';

// 實際紀錄：計畫只是參考，任務按「開始」才開始、按「結束」才結束。
//   沒按結束就開始下一個：前一個記到現在，等於前一個延長了。
//   按了結束：之後到下一個開始之前都是休息。
//   浮動事項（吃飯、洗澡）按開始時，正在做的任務先中斷，之後可以按「繼續」接著做；不按就是休息。
//   任務也可以自己按「暫停」，和被浮動事項打斷一樣記成中斷。
//   固定時段（上課、通勤、睡前準備）照時鐘走，不用按；它開始時，正在進行的紀錄自動結束。
//   忘了按、按錯或時間不對，在調整時間表裡直接改實際紀錄，確認時整天換掉（replaceLog）。
// 習慣是否完成見下面的 habitItems。

/**
 * 一個任務今天的狀態。missed 是預定時間已經過了還沒開始（用 id 查時，看的是就寢時間）。
 * cut 是中斷：沒做滿預定長度就停了，當天還能繼續；unfinished 是過了就寢還沒做滿，沒機會補了
 */
export type Status = 'todo' | 'running' | 'cut' | 'done' | 'missed' | 'unfinished';

/** 差這麼多分鐘以內算做滿（時間條的一格），例如被固定時段自動結束時只差 1 分鐘 */
export const FULL_GRACE = 5;

export const logFor = (dk: string): Entry[] => data.log[dk] ?? [];

/** 正在進行的紀錄（沒有結束時間的那一段） */
export const running = (dk: string): Entry | undefined => logFor(dk).find(e => !e.end);

/** 某個任務或浮動事項的所有紀錄 */
export const entriesOf = (dk: string, ref: string): Entry[] => logFor(dk).filter(e => e.ref === ref);

/**
 * 任務的狀態：預定的結束時間過了還沒開始，就是沒做，不再排進下一個。
 * 停下來的（被打斷、暫停、碰到固定時段自動結束）看時間：做滿預定長度（差 FULL_GRACE 以內）算完成，
 * 沒做滿是中斷，過了就寢就是未完成。自己按結束的不管做多久都算完成（例如提早做完）
 */
export function statusOf(dk: string, b: Block, now: Date): Status {
  const st = refStatus(dk, b.id, now);
  if (st === 'cut') {
    if (isFull(dk, b)) return 'done';
    return elapsedMinutes(dk, now) >= SLEEP_MIN ? 'unfinished' : 'cut';
  }
  return st === 'todo' && elapsedMinutes(dk, now) >= toMin(b.end) ? 'missed' : st;
}

/** 這個任務做滿了沒：已經做的（加上 extra 分鐘）達到預定長度，差 FULL_GRACE 以內也算 */
export const isFull = (dk: string, b: Block, extra = 0): boolean => spentOn(dk, b.id) + extra >= durOf(b) - FULL_GRACE;

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
  blocks.find(b => !isClock(b) && statusOf(dk, b, now) === 'todo' && !isCanceled(dk, b));

/**
 * 被打斷、暫停或碰到固定時段停下來的任務，最近停下來的排前面。休息時每一個都有「繼續」。
 * 已經做滿預定長度的也列（算完成了，但想多做一點還是能接著做）
 */
export function cutTasks(dk: string, blocks: Block[], now: Date): Block[] {
  const cut = blocks.filter(b => refStatus(dk, b.id, now) === 'cut');
  const endOf = (b: Block) => toMin(entriesOf(dk, b.id).at(-1)?.end ?? '00:00');
  return cut.sort((a, b) => endOf(b) - endOf(a));
}

/**
 * 正在做的任務之前的那個任務（不算浮動事項），做到一半想切回去時用。
 * 沒有、是同一個任務、或已經不在時間表上，回傳 undefined。
 */
export function previousTask(dk: string, blocks: Block[]): Block | undefined {
  const log = logFor(dk);
  const r = running(dk);
  if (!r || r.float) return undefined;
  const prev = log.slice(0, log.indexOf(r)).filter(e => !e.float).at(-1);
  return prev && prev.ref !== r.ref ? blocks.find(b => b.id === prev.ref) : undefined;
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

/** 實際的起床時間：按過「起床」的開始時間；沒按起床就直接開始別的事，用今天第一筆紀錄的開始時間。固定的起床回傳 undefined */
export const wokeAt = (dk: string, floats: Float[]): string | undefined => {
  const wake = floats.find(isWake);
  if (!wake) return undefined;
  return entriesOf(dk, wake.id)[0]?.start ?? logFor(dk)[0]?.start;
};

// 習慣
// 有對應習慣（見 config/habits.ts 的 TYPE_HABIT）的活動，三種都用同一套規則算完成：
//   任務：按了結束（不是被打斷）才算完成。
//   固定時段：照時鐘走，到了結束時間就算完成，恢復模式取消的不算。
//   浮動事項、有目標時間（例如假日起床 08:30）：比目標晚 30 分鐘以內開始才算完成。

/** 浮動事項比目標時間晚多少分鐘以內開始，還算完成 */
export const TARGET_GRACE = 30;

/** 今天某個習慣的一項：一個任務、固定時段或有目標時間的浮動事項。note 是沒完成時的說明 */
export interface HabitItem {
  ref: string;
  done: boolean;
  note?: string;
}

/**
 * 今天每個習慣有哪些項目，依習慣分組。只列已經開始或已經能判斷的：
 *   任務：按過開始的。
 *   固定時段：開始時間到了的，結束時間到了就完成。
 *   有目標時間的浮動事項：按過開始的，或已經超過目標加寬限還沒開始的（沒完成）。
 */
export function habitItems(dk: string, now: Date): Map<string, HabitItem[]> {
  const out = new Map<string, HabitItem[]>();
  const add = (habit: string | null, item: HabitItem) => {
    if (!habit) return;
    const list = out.get(habit) ?? [];
    if (!list.some(i => i.ref === item.ref)) list.push(item);
    out.set(habit, list);
  };
  const day = parseKey(dk).getDay();
  const elapsed = elapsedMinutes(dk, now);

  const blocks = blocksFor(dk, day);
  for (const e of logFor(dk)) {
    if (e.float) continue;
    // 還在時間表上的照 statusOf（被打斷但做滿了也算完成），已經刪掉的只看紀錄
    const b = blocks.find(x => x.id === e.ref);
    add(habitOf(e), { ref: e.ref, done: (b ? statusOf(dk, b, now) : refStatus(dk, e.ref, now)) === 'done' });
  }
  for (const b of blocks) {
    if (isClock(b) && toMin(b.start) <= elapsed && !isCanceled(dk, b)) add(habitOf(b), { ref: b.id, done: toMin(b.end) <= elapsed });
  }
  for (const f of floatsFor(day)) {
    if (!f.start) continue;
    const verb = isWake(f) ? '起床' : '開始';
    const limit = toMin(f.start) + TARGET_GRACE;
    const at = isWake(f) ? wokeAt(dk, [f]) : entriesOf(dk, f.id)[0]?.start;
    if (at) {
      const done = toMin(at) <= limit;
      add(habitOf(f), { ref: f.id, done, note: done ? undefined : `${at} ${verb}，目標 ${f.start}` });
    } else if (elapsed > limit) {
      add(habitOf(f), { ref: f.id, done: false, note: `還沒${verb}，目標 ${f.start}` });
    }
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

/**
 * 暫停正在做的任務：和被浮動事項打斷一樣記成中斷，之後「現在」區塊會出現「繼續」，還剩的長度照算。
 * 浮動事項沒有「繼續」，不能暫停，只能結束。
 */
export function pauseRunning(dk: string, now: Date): void {
  const r = running(dk);
  if (!r || r.float) return;
  close(dk, elapsedMinutes(dk, now), true);
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
 * 調整時間表確認時，把這一天的實際紀錄整份換掉（entries 要依開始時間排好）。
 * 習慣的勾選跟著重新算：換掉前後牽涉到的習慣，當天有任務做完（按了結束、不是被打斷）就勾，沒有就拿掉。
 * 不存檔，由呼叫的人一起存。
 */
export function replaceLog(dk: string, entries: Entry[]): void {
  const before = logFor(dk);
  if (entries.length) data.log[dk] = entries;
  else delete data.log[dk];
  recheckHabits(dk, [...before, ...entries]);
}

/**
 * 重新算 touched 這些紀錄牽涉到的習慣：當天有任務做完（按了結束、不是被打斷）就勾，沒有就拿掉。
 * 紀錄被換掉、刪掉或重新打開時呼叫，其他習慣不動。
 */
function recheckHabits(dk: string, touched: Entry[]): void {
  const habits = new Set(touched.flatMap(e => (e.float ? [] : [habitOf(e)])).filter((h): h is string => h !== null));
  const log = logFor(dk);
  const checks = { ...data.checks[dk] };
  for (const h of habits) {
    if (log.some(e => !e.float && e.end && !e.cut && habitOf(e) === h)) checks[h] = true;
    else delete checks[h];
  }
  if (Object.keys(checks).length) data.checks[dk] = checks;
  else delete data.checks[dk];
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
  const stops = blocks.filter(isClock).map(b => toMin(b.start)).filter(t => t > s && t <= m);
  if (m >= SLEEP_MIN) stops.push(SLEEP_MIN);
  if (!stops.length) return false;
  // 不是自己按的結束：做滿了算完成，沒做滿記成中斷，固定時段過了還能繼續
  const at = Math.min(...stops);
  const plan = r.float ? undefined : blocks.find(b => b.id === r.ref);
  close(dk, at, !!plan && !isFull(dk, plan, at - s));
  save();
  return true;
}
