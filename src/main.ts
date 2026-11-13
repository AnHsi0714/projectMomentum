import './styles/main.scss';
import { DAY_NAMES } from './config/schedule';
import { MODES } from './config/habits';
import { data, exportJson, importJson, load, save, setStatusListener, type SaveStatus } from './lib/store';
import { addDays, dkey, fmtMD, isToday, mondayOf, pad, parseKey } from './lib/time';
import { currentRoute, isRouteHash, state, type ViewId } from './state';
import { refreshLive, renderToday, updateHabitCounts } from './views/today';
import { renderReview } from './views/review';
import { renderWeek } from './views/week';
import type { ModeId } from './types';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const main = $('#main');

const VIEWS: Record<ViewId, { title: string; render: () => string }> = {
  today: { title: '今天', render: renderToday },
  week: { title: '本週', render: renderWeek },
  review: { title: '回顧', render: renderReview },
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  file: '已儲存到 data/momentum.json',
  saving: '儲存中…',
  local: '僅存在瀏覽器，請用 npm run dev 開啟',
  error: '儲存失敗，請確認伺服器仍在執行',
};

function updateClock(now: Date) {
  $('#clock').textContent = `${fmtMD(now)} 週${DAY_NAMES[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 記下目前焦點所在的元件，重畫後用來找回同一個元件 */
function focusKey(el: Element | null): string | null {
  if (!(el instanceof HTMLElement) || el === main || !main.contains(el)) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const attrs = Object.entries(el.dataset).map(
    ([k, v]) => `[data-${k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}="${CSS.escape(v ?? '')}"]`,
  );
  return attrs.length ? el.tagName.toLowerCase() + attrs.join('') : null;
}

/**
 * 重畫目前的畫面。
 * navigated 為 true 表示使用者換了頁：回到頂端並把焦點移到新頁標題。
 * 否則是資料變動造成的重畫：把焦點還給原本的元件，鍵盤操作不會中斷。
 */
function render(navigated = false) {
  const view = currentRoute();
  const key = navigated ? null : focusKey(document.activeElement);

  main.innerHTML = VIEWS[view].render();

  document.querySelectorAll<HTMLAnchorElement>('#nav a').forEach(a => {
    if (a.dataset.v === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${VIEWS[view].title}｜Momentum 週間自律`;
  updateClock(new Date());

  if (navigated) {
    window.scrollTo(0, 0);
    $('#view-title').focus({ preventScroll: true });
  } else if (key) {
    (main.querySelector<HTMLElement>(key) ?? $('#view-title')).focus({ preventScroll: true });
  }
}

function setBackupMessage(text: string, isError = false) {
  const el = document.getElementById('backup-msg');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

/** 定時與回到分頁時呼叫：更新時鐘、跨日換日、就地更新「現在」 */
function tick() {
  const now = new Date();
  updateClock(now);
  if (state.followToday && dkey(state.selDate) !== dkey(now)) {
    state.selDate = now;
    render();
    return;
  }
  if (currentRoute() === 'today' && isToday(state.selDate)) refreshLive(now);
}

main.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const chip = t.closest<HTMLElement>('[data-d]');
  const weekBtn = t.closest<HTMLElement>('[data-week]');
  const openDay = t.closest<HTMLElement>('[data-open-day]');

  if (chip) {
    state.selDate = parseKey(chip.dataset.d!);
    state.followToday = isToday(state.selDate);
    render();
  } else if (weekBtn) {
    const delta = Number(weekBtn.dataset.week);
    if (delta === 0) {
      state.selDate = new Date();
      state.followToday = true;
    } else {
      state.selDate = addDays(state.selDate, delta * 7);
      state.followToday = false;
    }
    render();
  } else if (t.closest('[data-today]')) {
    state.selDate = new Date();
    state.followToday = true;
    render();
  } else if (openDay) {
    state.selDate = parseKey(openDay.dataset.openDay!);
    state.followToday = isToday(state.selDate);
    location.hash = '#/today';
  } else if (t.closest('#btn-export')) {
    exportJson();
  } else if (t.closest('#btn-import')) {
    $<HTMLInputElement>('#file-import').click();
  }
});

main.addEventListener('change', async e => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.h) {
    const dk = dkey(state.selDate);
    (data.checks[dk] ??= {})[t.dataset.h] = t.checked;
    save();
    updateHabitCounts();
  } else if (t.name === 'mode' && t.value in MODES) {
    data.modes[dkey(state.selDate)] = t.value as ModeId;
    save();
    render();
  } else if (t.id === 'file-import' && t.files?.[0]) {
    if (!confirm('匯入會覆蓋目前所有紀錄，確定要繼續嗎？')) {
      t.value = '';
      return;
    }
    try {
      await importJson(t.files[0]);
      render();
      setBackupMessage('已匯入備份。');
    } catch {
      t.value = '';
      setBackupMessage('匯入失敗：不是有效的備份檔。', true);
    }
  }
});

main.addEventListener('input', e => {
  const t = e.target as HTMLTextAreaElement;
  if (t.id === 'note') {
    data.notes[dkey(state.selDate)] = t.value;
    save();
  } else if (t.dataset.q !== undefined) {
    const key = dkey(mondayOf(state.selDate));
    (data.reviews[key] ??= {})[t.dataset.q] = t.value;
    save();
  }
});

setStatusListener(s => {
  const status = $('#save-status');
  status.dataset.state = s;
  $('#save-text').textContent = STATUS_TEXT[s];
  // 螢幕閱讀器只在最終狀態改變時才播報，儲存中不播報，避免每次輸入都被打斷
  if (s !== 'saving') {
    const live = $('#save-live');
    if (live.textContent !== STATUS_TEXT[s]) live.textContent = STATUS_TEXT[s];
  }
});

window.addEventListener('hashchange', () => {
  if (isRouteHash(location.hash)) render(true);
});

// 跳過連結直接把焦點移到主內容，不改網址 hash（hash 是路由用的）
document.querySelector('.skip-link')?.addEventListener('click', e => {
  e.preventDefault();
  main.focus();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

load().then(() => {
  render();
  window.setInterval(tick, 20_000);
});
