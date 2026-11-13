import { html, type TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { adjustBar, adjustEntry, adjustHint } from '../components/adjust';
import { dayChips } from '../components/day-chips';
import { habitList } from '../components/habit-list';
import { hero } from '../components/hero';
import { legend, timeline } from '../components/timeline';
import { viewHead } from '../components/view-head';
import { weekNav } from '../components/week-nav';
import { RECOVER_NOTE } from '../config/habits';
import { DAY_NAMES, DAY_THEME } from '../config/schedule';
import { blocksFor, isConfirmed, isRecovering } from '../lib/schedule';
import { data } from '../lib/store';
import { currentTime, dkey, fmtMD, isToday, weekDates } from '../lib/time';
import { state } from '../state';

// 「今天」頁：把元件組起來。每次都整頁重畫，lit-html 只會改動有變化的部分，
// 所以每分鐘更新「現在」不會打斷螢幕閱讀器，焦點也留在原本的元件上。

export function renderToday(): TemplateResult {
  const now = currentTime();
  const sel = state.selDate;
  const dk = dkey(sel);
  const day = sel.getDay();
  const today = isToday(sel);
  const week = weekDates(sel);
  const blocks = blocksFor(dk, day);
  const draft = state.draft?.date === dk ? state.draft : null;
  // 過去的日子與已經定稿的日子不能調整
  const lockedNote =
    dk < dkey(now) ? '這一天已經結束，不能再調整。'
    : isConfirmed(dk) ? '這一天的時間表已經確認定稿，不能再調整。'
    : null;

  const title = html`${fmtMD(sel)} 週${DAY_NAMES[day]}${today ? html`<span class="badge badge-today">今天</span>` : ''}`;

  return html`${viewHead(title, DAY_THEME[day])}
    <div class="stack">
      ${weekNav()}
      ${dayChips(week, dk)}
      ${today
        ? ''
        : html`<div class="banner" role="note"><p>正在查看 ${fmtMD(sel)}（週${DAY_NAMES[day]}），不是今天。</p><button type="button" class="btn" data-today>回到今天</button></div>`}
    </div>
    ${today ? hero(now, dk, blocks) : ''}
    <div class="today-grid">
      <section class="sec">
        <div class="sec-head"><h2>時間表</h2>${legend()}</div>
        ${draft ? adjustHint() : adjustEntry(lockedNote)}
        ${timeline(dk, blocks, now, draft)}
        ${draft ? adjustBar() : ''}
      </section>
      <div class="stack">
        <section class="sec">
          <h2>恢復模式</h2>
          <div class="tool">
            <label class="check-label" for="recover"><input type="checkbox" id="recover" aria-describedby="recover-note" .checked=${live(isRecovering(dk))}><span>啟用恢復模式</span></label>
            <p class="hint" id="recover-note">${RECOVER_NOTE}</p>
          </div>
        </section>
        <section class="sec">
          <h2>今日習慣</h2>
          ${habitList(dk, week)}
        </section>
        <section class="sec field">
          <h2><label for="note">今日產出與進度</label></h2>
          <p class="hint" id="note-hint">深度工作開始前寫下要產出什麼，結束時記錄進度與下一步。</p>
          <textarea id="note" rows="4" aria-describedby="note-hint" .value=${live(data.notes[dk] ?? '')}></textarea>
        </section>
      </div>
    </div>`;
}
