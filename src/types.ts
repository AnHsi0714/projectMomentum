export type BlockType =
  | 'commute' | 'class' | 'deep' | 'plan' | 'exercise' | 'english'
  | 'reading' | 'rest' | 'meal' | 'prep' | 'event';

/**
 * 原定時間表（config/schedule.ts）的一列：[開始, 結束, 內容, 類型, 鎖定]，時間格式 HH:MM（24 小時制）。
 * 鎖定省略時依類型決定（上課、通勤、臨時行程預設鎖定）。讀進來時轉成 Block。
 */
export type Row =
  | [start: string, end: string, label: string, type: BlockType]
  | [start: string, end: string, label: string, type: BlockType, locked: boolean];

/**
 * 時間表上的一個時段。id 用來把實際紀錄（Entry）對應到計畫裡的任務，調整時間、名稱都不會變。
 * locked 和類型的預設相同時不寫，紀錄才能和原定時間表直接比對。
 */
export interface Block {
  id: string;
  start: string;
  end: string;
  label: string;
  type: BlockType;
  locked?: boolean;
}

/**
 * 浮動事項：吃飯、洗澡、假日起床這類長度大致固定、但不知道什麼時候開始的事。
 * 不排在時間表上，按「開始」才開始，並暫停正在做的任務。minutes 是大概的長度，
 * stage 是先後階段（起床 0，早午餐 1，洗澡與晚餐 2）。設定在 config/schedule.ts 的 FLOATS。
 */
export interface Float {
  id: string;
  label: string;
  type: BlockType;
  minutes: number;
  stage: number;
}

/**
 * 實際紀錄的一段：按「開始」到「結束」。ref 是計畫裡任務或浮動事項的 id。
 * end 沒寫表示還在進行。cut 表示被浮動事項打斷，之後可以按「繼續」接著做。
 * float 表示這段是浮動事項。long 表示超過預定長度後，使用者回答過「還在做」，不再提醒。
 */
export interface Entry {
  ref: string;
  label: string;
  type: BlockType;
  start: string;
  end?: string;
  cut?: true;
  float?: true;
  long?: true;
}

export interface Habit {
  id: string;
  name: string;
  /** 每週目標次數 */
  target: number;
  /** 內容細項（教材、菜單等），尚未決定 */
  detail: string;
}

export interface AppData {
  /** checks[日期][習慣id] = 是否完成。任務按結束、當天這類任務都完成時自動勾選，也能手動改 */
  checks: Record<string, Record<string, boolean>>;
  /** 當天調整過的時間表，key 是日期。沒有這一天的紀錄就用 config/schedule.ts 的原定時間表 */
  schedules: Record<string, Block[]>;
  /** 暫待區：調整時間表時先拿出時間表、還沒決定要不要做的任務，key 是日期。時間是拿出前的時間 */
  pending: Record<string, Block[]>;
  /** 實際紀錄：按開始、結束記下的真實時間，key 是日期 */
  log: Record<string, Entry[]>;
  /** 舊版按過「保存當天時間表」、已經定稿的日期。定稿後這一天的時間表不能再調整 */
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
