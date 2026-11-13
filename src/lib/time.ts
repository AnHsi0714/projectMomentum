import type { Block } from '../types';

export const pad = (n: number) => String(n).padStart(2, '0');

export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** 本地日期 YYYY-MM-DD */
export const dkey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseKey = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * 現在時間。開發時可以用網址 ?now=21:15 指定時分，日期仍是今天，時間會停在那一刻，
 * 方便在任何時候檢查「現在」區塊與進度尺。正式建置不理會這個參數。
 */
export function currentTime(): Date {
  const d = new Date();
  if (import.meta.env.DEV) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(new URLSearchParams(location.search).get('now') ?? '');
    if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  }
  return d;
}

export const isToday = (d: Date) => dkey(d) === dkey(new Date());

/** 11月13日 */
export const fmtMD = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export const isSameWeek = (a: Date, b: Date) => dkey(mondayOf(a)) === dkey(mondayOf(b));

export function weekDates(d: Date): Date[] {
  const m = mondayOf(d);
  return Array.from({ length: 7 }, (_, i) => addDays(m, i));
}

export function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} 小時${m ? ` ${m} 分` : ''}` : `${m} 分`;
}

/** 分鐘數轉成 HH:MM */
export const fmtTime = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/**
 * 這一天已經過了幾分鐘：過去的日子是 1440，今天是現在的分鐘數，還沒到的日子是 0。
 * 時間表上「已完成」與「還沒完成」就以它為界。
 */
export function elapsedMinutes(dateKey: string, now: Date): number {
  const today = dkey(now);
  if (dateKey < today) return 24 * 60;
  if (dateKey > today) return 0;
  return now.getHours() * 60 + now.getMinutes();
}

/** 時段是否已經結束，結束時間就是已完成的界線 */
export const isDone = (b: Block, elapsed: number) => toMin(b[1]) <= elapsed;

export type CurrentInfo =
  | { state: 'in'; idx: number; blocks: Block[]; m: number }
  /** 兩個時段中間的空檔（刪除時段之後會出現），idx 是下一個時段 */
  | { state: 'gap'; idx: number; blocks: Block[]; m: number }
  | { state: 'before' | 'after' | 'empty'; blocks: Block[]; m: number };

/** 判斷現在落在時間表的哪個時段。blocks 要依開始時間排好 */
export function currentInfo(now: Date, blocks: Block[]): CurrentInfo {
  const m = now.getHours() * 60 + now.getMinutes();
  if (!blocks.length) return { state: 'empty', blocks, m };
  const idx = blocks.findIndex(b => m >= toMin(b[0]) && m < toMin(b[1]));
  if (idx >= 0) return { state: 'in', idx, blocks, m };
  const next = blocks.findIndex(b => m < toMin(b[0]));
  if (next === 0) return { state: 'before', blocks, m };
  if (next > 0) return { state: 'gap', idx: next, blocks, m };
  return { state: 'after', blocks, m };
}

/** 跳脫 HTML，內容與屬性值都能安全使用 */
export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
