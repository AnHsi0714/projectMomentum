import { html, type TemplateResult } from 'lit-html';

/**
 * 完成的記號：畫面上是打勾，報讀器念「完成」。習慣、任務、每週目標的完成都用這個，用詞才會一致。
 * 打勾是符號不是顏色，不只靠顏色區分。
 */
export const checkMark = (): TemplateResult => html`<span aria-hidden="true">✓</span><span class="sr-only">完成</span>`;
