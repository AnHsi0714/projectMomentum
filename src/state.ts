import type { Draft } from './lib/draft';

export type ViewId = 'today' | 'week' | 'review' | 'terms';

export const state: {
  /** 目前檢視的日期，三個畫面共用（週導覽以它所在的那一週為準） */
  selDate: Date;
  /** 是否跟著「今天」走，跨過午夜時會自動換日 */
  followToday: boolean;
  /** 正在調整的那一天的草稿。有草稿就是調整模式，按更新或保存才存檔，不寫進資料檔 */
  draft: Draft | null;
} = {
  selDate: new Date(),
  followToday: true,
  draft: null,
};

let lastRoute: ViewId = 'today';

/** 網址 hash 是否是路由，例如 #/week */
export const isRouteHash = (hash: string) => /^#\/(today|week|review|terms)$/.test(hash);

/**
 * 由網址的 hash 決定畫面。不認識的 hash（例如頁內錨點）不會切換畫面，
 * 維持上一個有效的畫面；一開始沒有 hash 時是今天。
 */
export function currentRoute(): ViewId {
  if (isRouteHash(location.hash)) lastRoute = location.hash.slice(2) as ViewId;
  return lastRoute;
}
