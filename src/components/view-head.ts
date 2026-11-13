import { html, type TemplateResult } from 'lit-html';

/** 每個畫面的頂端標題。h1 會在換頁後接收焦點，所以要能被程式聚焦 */
export const viewHead = (title: string | TemplateResult, sub: string) =>
  html`<div class="view-head"><h1 id="view-title" tabindex="-1">${title}</h1><p class="view-sub">${sub}</p></div>`;
