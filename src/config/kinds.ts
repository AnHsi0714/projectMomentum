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
