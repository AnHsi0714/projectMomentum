import type { Stage } from '../types';
import { newId } from './blocks';

// 浮動事項先後階段的純運算：新增、調整順序。不碰儲存。誰在用見 settings-draft.ts 的 stageUsers。
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
