export type BlockType =
  | 'commute' | 'class' | 'deep' | 'plan' | 'exercise' | 'english'
  | 'reading' | 'rest' | 'meal' | 'free' | 'prep';

/** [開始, 結束, 內容, 類型]，時間格式 HH:MM */
export type Block = [start: string, end: string, label: string, type: BlockType];

export type ModeId = 'normal' | 'adjust' | 'recover';

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
  modes: Record<string, ModeId>;
  notes: Record<string, string>;
  /** reviews[該週週一日期][問題序號] = 回答 */
  reviews: Record<string, Record<string, string>>;
}
