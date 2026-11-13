import { html, svg, type TemplateResult } from 'lit-html';
import { fmtMD, isSameWeek, mondayOf, weekDates } from '../lib/time';
import { state } from '../state';

/** 11月9日至11月15日 */
function weekRangeText(ref: Date): string {
  const w = weekDates(ref);
  return `${fmtMD(w[0])}至${fmtMD(w[6])}`;
}

/** 本週、上週、下週，再遠的用「N 週前、N 週後」 */
export function weekTitle(ref: Date): string {
  const diff = Math.round((mondayOf(ref).getTime() - mondayOf(new Date()).getTime()) / (7 * 24 * 60 * 60 * 1000));
  if (diff === 0) return '本週';
  if (diff === -1) return '上週';
  if (diff === 1) return '下週';
  return diff < 0 ? `${-diff} 週前` : `${diff} 週後`;
}

/** 箭頭是圖形不是文字，名稱由 aria-label 提供，不會和可見文字不一致 */
const chevron = (dir: 'prev' | 'next') =>
  html`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${svg`<path d=${dir === 'prev' ? 'M10.5 2.5L5 8l5.5 5.5' : 'M5.5 2.5L11 8l-5.5 5.5'}/>`}</svg>`;

/** 上一週、下一週與回到本週。日期範圍夾在兩個箭頭中間，整組靠左 */
export function weekNav(): TemplateResult {
  const current = isSameWeek(state.selDate, new Date());
  return html`<div class="weeknav">
    <button type="button" class="btn icon-btn" data-week="-1" aria-label="上一週">${chevron('prev')}</button>
    <span class="weeknav-range">${weekRangeText(state.selDate)}</span>
    <button type="button" class="btn icon-btn" data-week="1" aria-label="下一週">${chevron('next')}</button>
    ${current ? html`<span class="badge">本週</span>` : html`<button type="button" class="btn-link" data-week="0">回到本週</button>`}
  </div>`;
}
