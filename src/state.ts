import type { Draft } from './lib/draft';
import type { SettingsDraft } from './lib/settings-draft';

export type ViewId = 'today' | 'week' | 'review' | 'terms' | 'settings';

export const state: {
  /** 目前檢視的日期，三個畫面共用（週導覽以它所在的那一週為準） */
  selDate: Date;
  /** 是否跟著「今天」走，跨過午夜時會自動換日 */
  followToday: boolean;
  /** 正在調整的那一天的草稿。有草稿就是調整模式，按更新或保存才存檔，不寫進資料檔 */
  draft: Draft | null;
  /**
   * 剛切換過恢復模式的日期。恢復模式平常只在還有運動時顯示，
   * 但剛關掉時要留著，開關才不會在操作當下消失、焦點跟著不見；重新整理後才收起來
   */
  recoverTouched: string | null;
  /** 設定頁正在編輯星期幾的範本（0=日） */
  setDay: number;
  /** 設定頁整份設定的草稿（每一天的活動與先後階段），按儲存才寫進設定檔。離開設定頁時丟掉 */
  sdraft: SettingsDraft | null;
  /** 設定頁「複製」的來源星期，null 表示跟著上面選的那一天；複製到的星期 */
  copyFrom: number | null;
  copyTo: number[];
} = {
  selDate: new Date(),
  followToday: true,
  draft: null,
  recoverTouched: null,
  setDay: new Date().getDay(),
  sdraft: null,
  copyFrom: null,
  copyTo: [],
};

let lastRoute: ViewId = 'today';

/** 網址 hash 是否是路由，例如 #/week */
export const isRouteHash = (hash: string) => /^#\/(today|week|review|terms|settings)$/.test(hash);

/**
 * 由網址的 hash 決定畫面。不認識的 hash（例如頁內錨點）不會切換畫面，
 * 維持上一個有效的畫面；一開始沒有 hash 時是今天。
 */
export function currentRoute(): ViewId {
  if (isRouteHash(location.hash)) lastRoute = location.hash.slice(2) as ViewId;
  return lastRoute;
}
