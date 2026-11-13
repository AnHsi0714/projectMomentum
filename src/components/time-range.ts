import { html } from 'lit-html';

/** 09:00–10:30。螢幕閱讀器會讀成「09:00 到 10:30」，視覺上顯示破折號 */
export const timeRange = (a: string, b: string) =>
  html`${a}<span class="sr-only">到</span><span aria-hidden="true">–</span>${b}`;
