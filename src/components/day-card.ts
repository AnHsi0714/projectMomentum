import { html, type TemplateResult } from 'lit-html';
import { DAY_NAMES, DAY_THEME } from '../config/schedule';
import { blocksFor, blocksOfType, isAdjusted, isCanceled, wakeTime } from '../lib/schedule';
import { dkey, fmtMD, isToday } from '../lib/time';
import type { Block } from '../types';
import { timeRange } from './time-range';

const none = html`<span class="fact-none">無</span>`;

/** 一類時段的時間。withLabel 時附上名稱，恢復模式取消的運動會註明 */
function times(dk: string, blocks: Block[], withLabel = false): TemplateResult {
  if (!blocks.length) return none;
  return html`${blocks.map(
    b => html`<span class="fact-line"><span>${timeRange(b[0], b[1])}</span>${withLabel
        ? html`<span class="fact-note">${b[2]}${isCanceled(dk, b) ? '（取消）' : ''}</span>`
        : ''}</span>`,
  )}`;
}

/** 「本週」頁的一天：起床、上課、深度工作、運動、英文、閱讀的時間，以及前往那天的按鈕 */
export function dayCard(d: Date): TemplateResult {
  const day = d.getDay();
  const dk = dkey(d);
  const today = isToday(d);
  const blocks = blocksFor(dk, day);
  const wake = wakeTime(blocks);
  const facts: [string, string | TemplateResult][] = [
    ['起床', wake ?? none],
    ['上課', times(dk, blocksOfType(blocks, 'class'))],
    ['深度工作', times(dk, blocksOfType(blocks, 'deep'), true)],
    ['運動', times(dk, blocksOfType(blocks, 'exercise'), true)],
    ['英文', times(dk, blocksOfType(blocks, 'english'))],
    ['閱讀', times(dk, blocksOfType(blocks, 'reading'))],
  ];
  return html`<article class="daycard ${today ? 'is-today' : ''}">
    <header class="daycard-head">
      <h3>週${DAY_NAMES[day]}</h3>
      <span class="daycard-date">${fmtMD(d)}</span>
      ${today ? html`<span class="badge badge-today">今天</span>` : ''}
      ${isAdjusted(dk) ? html`<span class="badge">已調整</span>` : ''}
      <p class="daycard-theme">${DAY_THEME[day]}</p>
    </header>
    <dl class="facts">
      ${facts.map(([k, v]) => html`<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`)}
    </dl>
    <button type="button" class="btn" data-open-day=${dk}>查看完整時間表<span class="sr-only">（週${DAY_NAMES[day]}）</span></button>
  </article>`;
}
