import type { Activity, BlockType, Mode, WeekTemplate } from "../types";

// 星期：0=日 1=一 ... 6=六
// 時段名稱的用詞與先後順序見 src/config/terms.ts（網頁的「名詞」頁）
// 每天的活動存在資料檔的 template（每週範本），這裡只是資料檔還沒有範本時的預設值。
// 活動依 mode 分三種（見 types.ts 的 Mode）：
//   clock 固定：時間條上的固定時段（上課、通勤、睡前準備、平日起床），照時鐘自動開始與結束，不用按。
//   press 任務：時間條上的任務，按「開始」才開始、按「結束」才結束。
//   float 浮動事項：吃飯、洗澡、假日起床，不排在時間條上，按「開始」才開始，並暫停正在做的任務。
// 活動之間沒排東西的時間就是「空白」（自由時間、彈性時間），畫面上寫成休息，不另外列。

/** 每天的就寢時間，任何任務都不能排到這之後 */
export const SLEEP_TIME = "23:30";

export const DAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

export const DAY_THEME: Record<number, string> = {
  1: "長時間上課日",
  2: "課業與自主專案日",
  3: "課業與英文日",
  4: "運動與自主專案日",
  5: "自主專案與運動日",
  6: "自主專案與能力培養日",
  0: "課業整理與每週回顧日",
};

const minutesOf = (start: string, end: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  return m(end) - m(start);
};

/** 排在時間條上的活動：固定（clock）或任務（press） */
const timed =
  (mode: Mode) =>
  (start: string, end: string, label: string, type: BlockType, id?: string): Activity => ({
    id: id ?? type,
    label,
    type,
    mode,
    start,
    minutes: minutesOf(start, end),
  });
const clock = timed("clock");
const press = timed("press");

const WAKE_LABEL = "起床、盥洗、準備";
const wakeAt = (start: string, end: string) => clock(start, end, WAKE_LABEL, "wake");
const WAKE_FLOAT: Activity = { id: "wake", label: WAKE_LABEL, type: "wake", mode: "float", start: "08:30", minutes: 30, stage: 0 };
const BRUNCH: Activity = { id: "brunch", label: "早午餐", type: "meal", mode: "float", minutes: 60, stage: 1 };
const SHOWER: Activity = { id: "shower", label: "洗澡、整理", type: "prep", mode: "float", minutes: 50, stage: 2 };
const DINNER: Activity = { id: "dinner", label: "晚餐", type: "meal", mode: "float", minutes: 70, stage: 2 };
const BEDTIME = clock("23:00", "23:30", "睡前準備", "prep", "bedtime");

/**
 * 預設的每週範本。id 寫進資料檔後就不再變，實際紀錄靠它對應到活動，同一天裡不能重複。
 * 浮動事項的順序就是按鈕的順序。
 */
export const DEFAULT_TEMPLATE: WeekTemplate = {
  1: [
    wakeAt("07:20", "08:00"),
    clock("08:00", "09:00", "通勤", "commute", "commute-go"),
    clock("09:00", "18:30", "上課", "class"),
    clock("18:30", "19:30", "通勤回家", "commute", "commute-back"),
    press("21:00", "21:30", "輕量英文或課業整理", "english"),
    press("21:30", "22:00", "閱讀", "reading"),
    BEDTIME,
    SHOWER,
    DINNER,
  ],
  2: [
    wakeAt("08:25", "09:00"),
    clock("09:00", "10:00", "通勤", "commute", "commute-go"),
    clock("10:00", "16:00", "上課", "class"),
    clock("16:00", "17:00", "通勤回家", "commute", "commute-back"),
    press("18:00", "19:30", "深度工作：課業或專案", "deep"),
    press("21:30", "22:00", "英文", "english"),
    press("22:00", "22:30", "閱讀", "reading"),
    BEDTIME,
    SHOWER,
    DINNER,
  ],
  3: [
    wakeAt("07:20", "08:00"),
    clock("08:00", "09:00", "通勤", "commute", "commute-go"),
    clock("09:00", "16:00", "上課", "class"),
    clock("16:00", "17:00", "通勤回家", "commute", "commute-back"),
    press("18:00", "19:30", "深度工作：課業", "deep"),
    press("21:30", "22:00", "英文", "english"),
    press("22:00", "22:30", "閱讀", "reading"),
    BEDTIME,
    SHOWER,
    DINNER,
  ],
  4: [
    wakeAt("07:20", "08:00"),
    clock("08:00", "09:00", "通勤", "commute", "commute-go"),
    clock("09:00", "15:00", "上課", "class"),
    clock("15:00", "16:00", "通勤回家", "commute", "commute-back"),
    press("16:20", "17:00", "運動", "exercise"),
    press("20:00", "21:30", "深度工作：專案或 HCI", "deep"),
    press("21:30", "22:00", "閱讀", "reading"),
    BEDTIME,
    SHOWER,
    DINNER,
  ],
  5: [
    press("10:00", "11:30", "深度工作：專案", "deep", "deep-am"),
    press("12:00", "13:00", "英文", "english"),
    press("14:00", "15:30", "深度工作：文獻或 HCI", "deep", "deep-pm"),
    press("16:00", "16:40", "運動", "exercise"),
    press("17:40", "18:10", "閱讀或課業整理", "reading"),
    BEDTIME,
    WAKE_FLOAT,
    BRUNCH,
    SHOWER,
    DINNER,
  ],
  6: [
    press("10:00", "11:30", "深度工作：專案", "deep", "deep-am"),
    press("12:00", "13:00", "英文", "english"),
    press("14:00", "15:30", "深度工作：文獻或 HCI", "deep", "deep-pm"),
    press("16:00", "16:40", "運動", "exercise"),
    press("17:40", "18:10", "閱讀或個人興趣", "reading"),
    BEDTIME,
    WAKE_FLOAT,
    BRUNCH,
    SHOWER,
    DINNER,
  ],
  0: [
    press("10:00", "11:30", "深度工作：課業", "deep"),
    press("12:00", "13:00", "英文", "english"),
    press("14:00", "15:00", "閱讀", "reading"),
    press("15:30", "16:00", "輕量活動", "exercise"),
    press("20:30", "21:00", "每週回顧與下週規劃", "plan"),
    BEDTIME,
    WAKE_FLOAT,
    BRUNCH,
    SHOWER,
    DINNER,
  ],
};
