import { html, type TemplateResult } from 'lit-html';
import { DAY_NAMES } from '../config/schedule';
import { dkey, fmtMD, isToday } from '../lib/time';

/**
 * 一週七天的日期選擇，selected 是目前看的那天（YYYY-MM-DD）。點選由 main.ts 依 data-d 處理。
 * 名稱直接取自可見文字（符合 WCAG 2.5.3），完整日期與「今天」用只給閱讀器的文字補在後面。
 */
export function dayChips(week: Date[], selected: string): TemplateResult {
  return html`<ul class="chips" role="list" aria-label="選擇日期">${week.map(d => {
    const k = dkey(d);
    const today = isToday(d);
    return html`<li><button type="button" class="chip ${today ? 'is-today' : ''}" data-d=${k} aria-pressed=${k === selected ? 'true' : 'false'}>
      <span class="dow">週${DAY_NAMES[d.getDay()]}</span><span class="dom">${d.getDate()}</span><span class="sr-only">，${fmtMD(d)}${today ? '，今天' : ''}</span>
    </button></li>`;
  })}</ul>`;
}
