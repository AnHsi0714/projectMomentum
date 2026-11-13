import type { Habit } from "../types";

export const HABITS: Habit[] = [
  { id: "sleep", name: "固定時間起床與睡覺", target: 7, detail: "" },
  {
    id: "english",
    name: "英文學習",
    target: 5,
    detail: "每週一個主題：Input、Concept、Output、Review，指令在 NotebookLM",
  },
  {
    id: "reading",
    name: "閱讀",
    target: 4,
    detail: "每週共 2 小時，書名、章節與想法記在每週回顧",
  },
  { id: "workout", name: "正式訓練", target: 3, detail: "" },
  { id: "project", name: "自主專案", target: 4, detail: "" },
  { id: "school", name: "課業整理", target: 2, detail: "" },
  { id: "review", name: "每週回顧（週日）", target: 1, detail: "" },
];

/** 「調整時間表」的說明，對應 docs/rules.md 的突發事件處理規則 */
export const ADJUST_NOTE =
  "臨時有事、晚餐延遲或行程變動時用。保留今天最重要的一項任務，其餘縮短、交換順序或取消，不延後睡眠來補進度。";

/** 「恢復模式」的說明，對應 docs/rules.md 的突發事件處理規則 */
export const RECOVER_NOTE =
  "身體不舒服時勾選。優先處理身體狀況，取消尚未完成的運動時段，已完成的不受影響。恢復後直接接回正常時間表。";

export const REVIEW_QUESTIONS = [
  "本週自主專案完成了什麼？是否達成原定里程碑？",
  "下週最重要的一項交付成果是什麼？",
  "哪些習慣做得到、哪些做不到？原因是什麼？",
  "休息有沒有失去結束點？要調整什麼規則？",
  "時間表哪個時段太滿或太鬆？",
  "讀到哪本書的哪一章？有什麼值得記下的想法？",
];
