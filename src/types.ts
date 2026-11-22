export type BlockType =
  | 'commute' | 'class' | 'deep' | 'plan' | 'exercise' | 'english'
  | 'reading' | 'rest' | 'meal' | 'wake' | 'prep' | 'event';

/**
 * 活動怎麼開始、怎麼算完成：
 *   clock 固定：照時鐘開始與結束，不用按，結束時間到了就算完成。
 *   press 任務：按開始才開始，按結束才結束。
 *   float 浮動事項：不排在時間表上，按了才開始；有 start 的話是目標時間。
 */
export type Mode = 'clock' | 'press' | 'float';

/**
 * 每週範本裡的一個活動。id 建立後不變，實際紀錄（Entry）的 ref 指向它，同一天裡不重複。
 * start 是 HH:MM（24 小時制），clock、press 一定有；float 可以沒有。
 * stage 只有 float 用：先後階段的 id（見 Settings 的 stages）。
 */
export interface Activity {
  id: string;
  label: string;
  type: BlockType;
  mode: Mode;
  start?: string;
  minutes: number;
  stage?: string;
}

/**
 * 浮動事項的先後階段。順序就是在清單裡的位置（畫面上寫 1 到 n）：
 * 做了後面階段的事，前面階段的就不再列出；第 1 階段在當天開始做任何事之後就不再列出（例如起床）。
 * id 建立後不變，活動的 stage 指向它，所以調整順序不用改活動。
 */
export interface Stage {
  id: string;
  label: string;
}

/** 每週範本：星期（0=日 1=一 ... 6=六）對應那一天的活動 */
export type WeekTemplate = Record<number, Activity[]>;

/** 排在時間表上的活動只有兩種：固定時段與任務 */
export type BlockMode = Exclude<Mode, 'float'>;

/**
 * 時間表上的一個時段。id 用來把實際紀錄（Entry）對應到計畫裡的任務，調整時間、名稱都不會變。
 * mode 是 clock（固定，照時鐘走，到了結束時間就算完成）或 press（任務，按了才算）。
 */
export interface Block {
  id: string;
  start: string;
  end: string;
  label: string;
  type: BlockType;
  mode: BlockMode;
}

/**
 * 浮動事項：吃飯、洗澡、浮動的起床這類長度大致固定、但不知道什麼時候開始的事。
 * 不排在時間表上，按「開始」才開始，並暫停正在做的任務。minutes 是大概的長度，
 * stage 是先後階段的順序（從 0 開始，0 是第 1 階段）。由每週範本裡 mode 是 float 的活動產生。
 * start 是目標時間（例如起床 08:30）：有的話，比目標晚 30 分鐘以內開始才算完成。
 */
export interface Float {
  id: string;
  label: string;
  type: BlockType;
  minutes: number;
  stage: number;
  start?: string;
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

/**
 * 設定，存在 data/settings.json，和紀錄（AppData）分開。在「設定」頁修改。
 * 之後就寢時間、習慣這些寫在程式裡的設定也會搬到這裡。
 */
export interface Settings {
  /** 每週範本：每天原定的活動。設定檔裡沒有時用 config/schedule.ts 的 DEFAULT_TEMPLATE */
  template: WeekTemplate;
  /** 浮動事項的先後階段，依先後排好。設定檔裡沒有時用 config/schedule.ts 的 DEFAULT_STAGES */
  stages: Stage[];
  /** 就寢時間 HH:MM，任何任務都不能排到這之後。設定檔裡沒有時用 DEFAULT_SLEEP_TIME */
  sleep: string;
}

/** 紀錄，存在 data/momentum.json */
export interface AppData {
  /** checks[日期][習慣id] = 是否完成。任務按結束、當天這類任務都完成時自動勾選，也能手動改 */
  checks: Record<string, Record<string, boolean>>;
  /** 當天調整過的時間表，key 是日期。沒有這一天的紀錄就用每週範本產生的原定時間表 */
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
