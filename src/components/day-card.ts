import { html, type TemplateResult } from 'lit-html';
import { DAY_NAMES, DAY_THEME } from '../config/schedule';
import { wokeAt } from '../lib/log';
import { blocksFor, blocksOfType, floatsFor, isAdjusted, isCanceled, plannedWake } from '../lib/schedule';
import { dkey, fmtMD, isToday, toMin } from '../lib/time';
import type { Block } from '../types';
import { timeRange } from './time-range';

/** 一類時段的時間。withLabel 時附上名稱，恢復模式取消的運動會註明 */
function times(dk: string, blocks: Block[], withLabel = false): TemplateResult {
  return html`${blocks.map(
    b => html`<span class="fact-line"><span>${timeRange(b.start, b.end)}</span>${withLabel
        ? html`<span class="fact-note">${b.label}${isCanceled(dk, b) ? '（取消）' : ''}</span>`
        : ''}</span>`,
  )}`;
}

/** 「本週」頁的一天：起床、上課、深度工作、運動、英文、閱讀的時間，照時間先後排列，以及前往那天的按鈕 */
export function dayCard(d: Date): TemplateResult {
  const day = d.getDay();
  const dk = dkey(d);
  const today = isToday(d);
  const blocks = blocksFor(dk, day);
  // 起床：假日按過「起床」就寫實際時間，旁邊附上目標；平日是固定時段，寫原定時間
  const target = plannedWake(day);
  const woke = wokeAt(dk, floatsFor(day));
  const wake = woke ? html`${woke}${target && woke !== target ? html`<span class="fact-note">目標 ${target}</span>` : ''}` : target;
  // 每一行附上排序用的時間：起床用實際或目標時間，其他用那一類最早的開始時間；那天沒有的類別不顯示
  const row = (label: string, type: Block['type'], withLabel = false): [string, TemplateResult, number] => {
    const bs = blocksOfType(blocks, type);
    return [label, times(dk, bs, withLabel), bs.length ? Math.min(...bs.map(b => toMin(b.start))) : Infinity];
  };
  const wakeAt = woke ?? target;
  const facts = [
    ['起床', wake ?? '', wakeAt ? toMin(wakeAt) : Infinity] as [string, string | TemplateResult, number],
    row('上課', 'class'),
    row('深度工作', 'deep', true),
    row('運動', 'exercise', true),
    row('英文', 'english'),
    row('閱讀', 'reading'),
  ]
    .filter(f => f[2] !== Infinity)
    .sort((a, b) => a[2] - b[2]);
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
