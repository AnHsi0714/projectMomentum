import { DAY_NAMES } from '../config/schedule';
import type { Stage, WeekTemplate } from '../types';
import { newId } from './blocks';

// 浮動事項先後階段的純運算：新增、調整順序、找出誰在用。不碰儲存。
// 順序就是在清單裡的位置，畫面上寫 1 到 n，所以不會有重複或跳號。

/** 在最後面新增一個階段，回傳它 */
export function addStage(stages: Stage[]): Stage {
  const s = { id: newId(), label: `階段 ${stages.length + 1}` };
  stages.push(s);
  return s;
}

/** 把第 from 個階段移到第 to 個位置（都從 0 開始），其他階段跟著順移。直接改傳進來的陣列 */
export function moveStage(stages: Stage[], from: number, to: number): void {
  if (from < 0 || from >= stages.length) return;
  const [s] = stages.splice(from, 1);
  stages.splice(Math.min(Math.max(to, 0), stages.length), 0, s);
}

/** 哪些浮動事項用到這個階段，例如「週一的晚餐」；extra 是設定頁還沒儲存的那一天 */
export function stageUsers(id: string, template: WeekTemplate, extra?: { day: number; acts: { label: string; stage: string; mode: string }[] }): string[] {
  const out: string[] = [];
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const acts = extra && extra.day === day ? extra.acts : template[day] ?? [];
    for (const a of acts) if (a.mode === 'float' && a.stage === id) out.push(`週${DAY_NAMES[day]}的${a.label || '未命名活動'}`);
  }
  return out;
}
