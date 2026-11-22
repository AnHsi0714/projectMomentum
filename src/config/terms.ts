import { SLEEP_TIME } from "./schedule";
import type { BlockType } from "../types";

// 「名詞」頁的內容。時段名稱以這裡為準，新增或改名時段時先看有沒有現成的名詞。

/** 時段名稱的命名規則 */
export const NAMING_RULES = [
  "「或」表示選一件做，例如「閱讀或自由時間」。",
  "「、」表示都要做，例如「洗澡、整理」。",
  "「A、B」照順序做，先做 A 再做 B。",
  "「A或B」優先選 A，A 做不了或不需要時才改做 B。",
  "冒號後面是這段要做的事，例如「深度工作：課業或專案」。",
];

/**
 * 時段的種類：每個時段是其中一種，決定要不要按開始、怎樣算完成。
 * 對應到程式裡活動的 mode：固定是 clock，任務是 press，浮動事項是 float。
 */
export const SLOT_KINDS: { term: string; meaning: string }[] = [
  {
    term: "固定",
    meaning:
      "上課、通勤、臨時行程、睡前準備、平日起床。照時鐘自動開始與結束，不用按，也不能拖動；結束時間到了就算完成。調整時間表時，任務也可以設成固定。",
  },
  {
    term: "任務",
    meaning: "深度工作、英文、運動、閱讀、每週回顧。按「開始」才開始，按「結束」才結束，按了結束才算完成。",
  },
  {
    term: "浮動事項",
    meaning:
      "吃飯、洗澡、假日起床。長度大致固定，但不知道什麼時候開始，所以不排在時間表上，要做時按開始。有目標時間的（假日起床 08:30），比目標晚 30 分鐘以內開始才算完成。",
  },
  {
    term: "✓",
    meaning: "完成。時間表上的任務、今日達標與每週目標，完成了都打勾。",
  },
];

export type Term = {
  term: string;
  meaning: string;
  /** 對應的時段類型；null 表示會出現在不同類型的時段裡 */
  type: BlockType | null;
};

export const TERM_GROUPS: { title: string; note?: string; items: Term[] }[] = [
  {
    title: "專注",
    items: [
      {
        term: "深度工作",
        meaning:
          "60 到 90 分鐘，一次只做一件事。名稱冒號後面寫這段做什麼：專案（自主專案）、課業、文獻（閱讀文獻）或 HCI（學習 HCI 知識），排前面的優先。開始前決定要產出什麼，記在每日筆記。課業做不完時優先課業；自主專案最多兩個同時進行。",
        type: "deep",
      },
      {
        term: "課業整理",
        meaning: "整理筆記、對照課表、處理零碎的課業事項，不需要長時間專心。",
        type: null,
      },
      {
        term: "每週回顧與下週規劃",
        meaning: "回答「回顧」頁的問題，確認下週的課程、作業與考試，決定下週最重要的交付成果。",
        type: "plan",
      },
    ],
  },
  {
    title: "學習",
    items: [
      {
        term: "英文",
        meaning: "照英文學習制度進行，完整指令在 NotebookLM。",
        type: "english",
      },
      {
        term: "輕量英文",
        meaning: "時間短或很累時的英文，只做 Review 或短的 Concept。",
        type: "english",
      },
      {
        term: "閱讀",
        meaning: "每週共 2 小時，書名、章節與想法記在每週回顧。",
        type: "reading",
      },
      {
        term: "個人興趣",
        meaning: "自己想學的東西或嗜好，有累積性，不含純娛樂。",
        type: null,
      },
    ],
  },
  {
    title: "運動",
    items: [
      {
        term: "運動",
        meaning: "週四到週六的居家訓練，每週 3 次。",
        type: "exercise",
      },
      {
        term: "輕量活動",
        meaning: "週日的輕量有氧、伸展或散步，疲勞時可以不做。",
        type: "exercise",
      },
    ],
  },
  {
    title: "休息與空檔",
    note: "這四個最容易混淆，差別在有沒有任務。",
    items: [
      {
        term: "休息",
        meaning: "只休息，不安排任何事。開始前先決定休息多久。",
        type: "rest",
      },
      {
        term: "彈性時間",
        meaning: "緩衝，時間表上的空白。前面的事延誤了就從這裡扣，沒有延誤就休息。",
        type: null,
      },
      {
        term: "輕量任務",
        meaning:
          "不需要專心、10 到 30 分鐘做得完的小事，例如回訊息、整理桌面、繳費。",
        type: null,
      },
      {
        term: "自由時間",
        meaning:
          "時間表上的空白，畫面上寫成休息。娛樂、社交、看影片都算，不必有產出，不把它當成罪惡。",
        type: null,
      },
    ],
  },
  {
    title: "生活",
    items: [
      {
        term: "起床、盥洗、準備",
        meaning: "起床到出門或開始第一件事之前。",
        type: "wake",
      },
      { term: "洗澡、整理", meaning: "回家或運動後洗澡、收拾。", type: "prep" },
      {
        term: "睡前準備",
        meaning: `${SLEEP_TIME} 就寢前的準備，不再開始新任務。`,
        type: "prep",
      },
      { term: "晚餐", meaning: "時間浮動，不要求固定開始。", type: "meal" },
      {
        term: "早午餐",
        meaning: "週五到週日不吃早餐，併成早午餐。",
        type: "meal",
      },
      {
        term: "通勤",
        meaning: "善用零碎時間，但不強迫學習。",
        type: "commute",
      },
    ],
  },
];

/** 時間不夠時的取捨順序：越前面越要保住，越後面越先縮短或取消 */
export const PRIORITY: { name: string; note: string }[] = [
  { name: "睡眠", note: `${SLEEP_TIME} 就寢與睡前準備，不延後睡眠來補進度。` },
  { name: "上課與通勤", note: "固定行程，不在這裡調整。" },
  { name: "吃飯與洗澡", note: "可以挪時間，不取消。" },
  { name: "當天最重要的一項任務", note: "通常是深度工作，週日是每週回顧。" },
  {
    name: "英文、運動、閱讀、課業整理",
    note: "其餘的習慣，縮短比取消好。",
  },
  { name: "輕量任務", note: "可以延到別天。" },
  {
    name: "空白（自由時間、彈性時間）",
    note: "本來就是拿來吸收延誤的，任務晚開始或做太久，最先用掉的就是空白。",
  },
];

export const PRIORITY_NOTE =
  "休息不在這個順序裡：可以縮短，但不要整個取消，休息超時也不懲罰自己。時間表只是參考，晚開始不用改；時間真的不夠時，照這個順序自己決定縮短、移到暫待區或今天不做。吃飯、洗澡是浮動事項，時間到了按開始就好。身體不舒服時改用「今天」頁的恢復模式，先取消運動。";
