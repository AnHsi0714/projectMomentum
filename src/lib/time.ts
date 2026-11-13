import { SCHEDULE } from '../config/schedule';
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

export const isToday = (d: Date) => dkey(d) === dkey(new Date());

export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function weekDates(d: Date): Date[] {
  const m = mondayOf(d);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(m);
    x.setDate(m.getDate() + i);
    return x;
  });
}

export function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} 小時${m ? ` ${m} 分` : ''}` : `${m} 分`;
}

export type CurrentInfo =
  | { state: 'in'; idx: number; blocks: Block[]; m: number }
  | { state: 'before' | 'after'; blocks: Block[]; m: number };

/** 判斷現在落在今天時間表的哪個時段 */
export function currentInfo(now: Date): CurrentInfo {
  const blocks = SCHEDULE[now.getDay()];
  const m = now.getHours() * 60 + now.getMinutes();
  const idx = blocks.findIndex(b => m >= toMin(b[0]) && m < toMin(b[1]));
  if (idx >= 0) return { state: 'in', idx, blocks, m };
  return { state: m < toMin(blocks[0][0]) ? 'before' : 'after', blocks, m };
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
