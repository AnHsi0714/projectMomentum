export type BlockType =
  | 'commute' | 'class' | 'deep' | 'plan' | 'exercise' | 'english'
  | 'reading' | 'rest' | 'meal' | 'free' | 'prep';

/** [開始, 結束, 內容, 類型]，時間格式 HH:MM */
export type Block = [start: string, end: string, label: string, type: BlockType];

export interface Habit {
  id: string;
  name: string;
  /** 每週目標次數 */
  target: number;
  /** 內容細項（教材、菜單等），尚未決定 */
  detail: string;
}

export interface AppData {
  /** checks[日期][習慣id] = 是否完成 */
  checks: Record<string, Record<string, boolean>>;
  /** 當天調整過的時間表，key 是日期。沒有這一天的紀錄就用 config/schedule.ts 的原定時間表 */
  schedules: Record<string, Block[]>;
  /** 按過確認、已經定稿的日期。定稿後這一天的時間表不能再調整 */
  confirmed: Record<string, true>;
  /**
   * 勾了恢復模式的日期。值是勾選當下這一天已經過了幾分鐘（0 到 1440），
   * 結束時間晚於這個值的運動時段才算取消，勾選前就已完成的不受影響。
   */
  recover: Record<string, number>;
  notes: Record<string, string>;
  /** reviews[該週週一日期][問題序號] = 回答 */
  reviews: Record<string, Record<string, string>>;
}
