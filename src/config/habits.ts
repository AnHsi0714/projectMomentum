import type { Block, Habit } from "../types";

/** 有對應任務的習慣，會自動勾選；其餘的靠手動 */
export const AUTO_HABITS: ReadonlySet<string> = new Set(["project", "english", "reading", "workout", "review"]);

/**
 * 任務對應到哪個習慣。任務按結束、而且當天同一個習慣的任務都完成時，自動勾選這個習慣；
 * 「今天」頁的今日達標也依這個對應列出。沒有對應的（起床睡覺、課業整理）回傳 null，靠手動勾選。
 */
export function habitOf(b: Pick<Block, "type" | "label">): string | null {
  if (b.label.includes("每週回顧")) return "review";
  if (b.type === "deep") return "project";
  if (b.type === "english") return "english";
  if (b.type === "reading") return "reading";
  if (b.type === "exercise") return "workout";
  return null;
}

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
  { id: "workout", name: "運動", target: 3, detail: "" },
  { id: "project", name: "深度工作", target: 4, detail: "專案、課業、文獻、HCI 都算" },
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
