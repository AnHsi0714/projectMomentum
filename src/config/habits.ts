import type { Habit, ModeId } from '../types';

export const HABITS: Habit[] = [
  { id: 'sleep',   name: '固定時間起床與睡覺', target: 7, detail: '' },
  { id: 'english', name: '英文學習',           target: 5, detail: '' },
  { id: 'reading', name: '閱讀',               target: 4, detail: '' },
  { id: 'workout', name: '正式運動',           target: 3, detail: '' },
  { id: 'project', name: '自主專案',           target: 4, detail: '' },
  { id: 'school',  name: '校內課業整理',       target: 2, detail: '' },
  { id: 'review',  name: '每週回顧（週日）',   target: 1, detail: '' },
];

export const MODES: Record<ModeId, { name: string; note: string }> = {
  normal:  { name: '正常模式', note: '照原定時間表執行。' },
  adjust:  { name: '調整模式', note: '保留今天最重要的一項任務，其餘縮短、交換順序或取消。不延後睡眠來補進度。' },
  recover: { name: '恢復模式', note: '優先處理身體狀況，取消運動及非急迫任務。恢復後直接接回正常時間表。' },
};

export const REVIEW_QUESTIONS = [
  '本週自主專案完成了什麼？是否達成原定里程碑？',
  '下週最重要的一項交付成果是什麼？',
  '哪些習慣做得到、哪些做不到？原因是什麼？',
  '休息有沒有失去結束點？要調整什麼規則？',
  '時間表哪個時段太滿或太鬆？',
];
