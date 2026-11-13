import type { BlockType } from '../types';

/** 時段的視覺分類。顏色只是輔助，意義一律另有文字（時段名稱與圖例）。 */
export type Kind = 'focus' | 'class' | 'move' | 'learn' | 'life';

export const KIND_OF: Record<BlockType, Kind> = {
  deep: 'focus',
  plan: 'focus',
  class: 'class',
  exercise: 'move',
  english: 'learn',
  reading: 'learn',
  commute: 'life',
  prep: 'life',
  meal: 'life',
  rest: 'life',
  free: 'life',
};

export const KINDS: { id: Kind; label: string }[] = [
  { id: 'focus', label: '專注' },
  { id: 'class', label: '上課' },
  { id: 'move', label: '運動' },
  { id: 'learn', label: '英文與閱讀' },
  { id: 'life', label: '生活' },
];

/** 新增或編輯時段時，類型選單上的名稱。順序就是選單的順序 */
export const TYPE_LABEL: Record<BlockType, string> = {
  deep: '深度工作',
  plan: '規劃與回顧',
  class: '上課',
  exercise: '運動',
  english: '英文',
  reading: '閱讀',
  commute: '通勤',
  prep: '起床、整理、睡前準備',
  meal: '用餐',
  rest: '休息',
  free: '自由時間',
};
