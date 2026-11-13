import './styles/main.scss';
import { DAY_NAMES } from './config/schedule';
import { initDrag, isDragging } from './drag';
import { addRow, confirmDraft, isDirty, removeRow, reorderRows, resetRows, setField, startDraft } from './lib/draft';
import { setRecover } from './lib/schedule';
import { data, exportJson, importJson, load, save, setStatusListener, type SaveStatus } from './lib/store';
import { addDays, dkey, elapsedMinutes, fmtMD, isDone, isToday, mondayOf, pad, parseKey } from './lib/time';
import { currentRoute, isRouteHash, state, type ViewId } from './state';
import { refreshLive, renderToday, updateHabitCounts } from './views/today';
import { renderReview } from './views/review';
import { renderWeek } from './views/week';

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
 * 調整中的欄位內容都在 state.draft 裡，所以重畫不會丟掉使用者改到一半的東西。
 */
/**
 * 移動焦點但不捲動畫面。Chrome 對時間欄位會忽略 preventScroll 硬是捲過去，
 * 所以聚焦後再把捲動位置放回原處，拖曳或按鈕操作後畫面才會留在原地。
 */
function focusStill(el: HTMLElement): void {
  const x = window.scrollX;
  const y = window.scrollY;
  el.focus({ preventScroll: true });
  if (window.scrollX !== x || window.scrollY !== y) window.scrollTo(x, y);
}

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
    focusStill(main.querySelector<HTMLElement>(key) ?? $('#view-title'));
  }
}

/** 在畫面上已經存在的訊息區（role="status" 或 "alert"）寫入文字，閱讀器會播報 */
function setMessage(id: string, text: string, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', isError);
}

/** 把焦點放到時間表上的某個按鈕，找不到或按鈕停用就回傳 false */
function focusButton(act: string, index?: number): boolean {
  const sel = `button[data-act="${act}"]${index === undefined ? '' : `[data-i="${index}"]`}`;
  const el = main.querySelector<HTMLButtonElement>(sel);
  if (!el || el.disabled) return false;
  focusStill(el);
  return true;
}

/** 把焦點放到某一列的欄位（名稱、開始時間） */
function focusField(index: number, field: string): boolean {
  const el = main.querySelector<HTMLElement>(`#r${index}-${field}`);
  if (!el) return false;
  focusStill(el);
  return true;
}

/**
 * 切換到另一天。正在調整的那一天如果有還沒確認的變動，先問過再放棄；
 * 回傳 false 表示使用者想留下來，不要切換。
 */
function goToDate(date: Date, followToday: boolean): boolean {
  const d = state.draft;
  if (d && d.date !== dkey(date)) {
    if (isDirty(d) && !confirm('這一天的調整還沒確認，離開會放棄這些調整。要離開嗎？')) return false;
    state.draft = null;
  }
  state.selDate = date;
  state.followToday = followToday;
  return true;
}

/** 把第 from 列移到第 to 列。用鍵盤移動時焦點跟著把手走；拖曳不移動焦點，免得手機跳出鍵盤 */
function reorder(from: number, to: number, byKey = false) {
  const d = state.draft;
  if (!d) return;
  // 時間表上方的訊息換行數會變，連帶把整張表往上或往下推；記下表在畫面上的位置，最後補回去
  const top = () => document.getElementById('timeline')?.getBoundingClientRect().top ?? 0;
  const before = top();
  const r = reorderRows(d, from, to);
  render();
  // 重畫後焦點會掉，用鍵盤移動時放回把手上：成功就跟到新位置，失敗留在原位
  if (byKey) focusButton('move', r.ok ? (r.index ?? to) : from);
  if (r.ok) setMessage('adjust-msg', r.message);
  else setMessage('adjust-msg', r.error, true);
  const shift = top() - before;
  if (shift !== 0) window.scrollBy(0, shift);
}

/** 調整時間表上的各種按鈕。所有動作都只改草稿，按更新或保存才存檔 */
function handleAction(act: string, index?: number) {
  const sel = state.selDate;
  const now = new Date();
  const d = state.draft;
  if (!d) return;

  if (act === 'add') {
    const { index: at, start } = addRow(d, now);
    render();
    const prev = d.blocks[at - 1];
    setMessage(
      'adjust-msg',
      start
        ? `已從現在 ${start} 插入一個任務${prev ? `，「${prev[2].trim() || '未命名的任務'}」改在這時結束` : ''}。請填入名稱，需要的話改開始時間。`
        : '已在最後面新增一個任務，請填入名稱與開始時間。',
    );
    focusField(at, 'label');
  } else if (act === 'delete' && index !== undefined) {
    const r = removeRow(d, index);
    render();
    if (!r.ok) return setMessage('adjust-msg', r.error, true);
    setMessage('adjust-msg', r.message);
    // 刪掉之後同一個位置換成下一個任務；刪的是最後一個就放在新增鈕
    focusButton('delete', index) || focusButton('add');
  } else if (act === 'reset') {
    resetRows(d, sel.getDay());
    render();
    setMessage('adjust-msg', '已還原成原定時間表，按更新或保存後才會儲存。');
    focusButton('add');
  } else if (act === 'cancel') {
    if (isDirty(d) && !confirm('要放棄這次調整嗎？還沒確認的內容會消失。')) return;
    state.draft = null;
    render();
    $('#btn-adjust').focus({ preventScroll: true });
  } else if (act === 'confirm' || act === 'finalize') {
    // 更新：存起來，之後還能再調整。保存當天：存起來並定稿，不能再改，所以先問一次
    const lock = act === 'finalize';
    if (lock && !confirm('保存後這一天的時間表就定稿，之後不能再調整。要保存嗎？')) return;
    const problems = confirmDraft(d, now, lock);
    if (problems === 'expired') {
      setMessage('adjust-error', '這一天已經結束，調整沒有儲存。請按取消離開。', true);
      return;
    }
    if (problems) {
      render();
      const rows = new Set(problems.map(p => p.index)).size;
      setMessage('adjust-error', `有 ${rows} 個任務需要修正，原因已標在欄位旁邊。`, true);
      focusField(problems[0].index, problems[0].field);
      return;
    }
    state.draft = null;
    render();
    setMessage('adjust-msg', lock ? '已保存並定稿這一天的時間表。' : '已更新這一天的時間表，之後還能再調整。');
    // 定稿後調整鈕停用，拿不到焦點，改放回頁面標題
    focusStill(lock ? $('#view-title') : $('#btn-adjust'));
  }
}

/** 定時與回到分頁時呼叫：更新時鐘、跨日換日、就地更新「現在」 */
function tick() {
  const now = new Date();
  updateClock(now);
  if (state.followToday && dkey(state.selDate) !== dkey(now)) {
    state.selDate = now;
    state.draft = null; // 過了午夜，昨天的調整已經沒有意義
    render();
    return;
  }
  // 拖曳到一半不重畫，否則被拖的列會消失；時段的變化下一次 tick 再處理
  if (currentRoute() === 'today' && isToday(state.selDate) && refreshLive(now) === 'rerender' && !isDragging()) render();
}

main.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const chip = t.closest<HTMLElement>('[data-d]');
  const weekBtn = t.closest<HTMLElement>('[data-week]');
  const openDay = t.closest<HTMLElement>('[data-open-day]');
  const action = t.closest<HTMLElement>('[data-act]');

  if (chip) {
    const date = parseKey(chip.dataset.d!);
    if (goToDate(date, isToday(date))) render();
  } else if (weekBtn) {
    const delta = Number(weekBtn.dataset.week);
    const ok = delta === 0 ? goToDate(new Date(), true) : goToDate(addDays(state.selDate, delta * 7), false);
    if (ok) render();
  } else if (t.closest('[data-today]')) {
    if (goToDate(new Date(), true)) render();
  } else if (openDay) {
    const date = parseKey(openDay.dataset.openDay!);
    if (goToDate(date, isToday(date))) location.hash = '#/today';
  } else if (t.closest('#btn-adjust')) {
    const sel = state.selDate;
    const d = (state.draft = startDraft(dkey(sel), sel.getDay()));
    render();
    // 焦點放在現在或接下來那個任務的名稱。不放時間欄位，那裡第一格是「上午／下午」，不是要改的地方。
    // 整天都過了就放第一個任務；這一天沒有任務就放在新增鈕
    const elapsed = elapsedMinutes(d.date, new Date());
    const next = d.blocks.findIndex(b => !isDone(b, elapsed));
    focusField(Math.max(next, 0), 'label') || focusButton('add');
  } else if (action) {
    handleAction(action.dataset.act!, action.dataset.i === undefined ? undefined : Number(action.dataset.i));
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
  } else if (t.id === 'recover') {
    setRecover(dkey(state.selDate), t.checked, new Date());
    render();
  } else if (t.id === 'file-import' && t.files?.[0]) {
    if (!confirm('匯入會覆蓋目前所有紀錄，確定要繼續嗎？')) {
      t.value = '';
      return;
    }
    try {
      await importJson(t.files[0]);
      render();
      setMessage('backup-msg', '已匯入備份。');
    } catch {
      t.value = '';
      setMessage('backup-msg', '匯入失敗：不是有效的備份檔。', true);
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
  } else if (state.draft && (t.dataset.f === 'label' || t.dataset.f === 'start' || t.dataset.f === 'type')) {
    // 調整時間表的欄位：只更新草稿，不存檔、不重畫，打字不會被打斷
    setField(state.draft, Number(t.dataset.i), t.dataset.f, t.value);
  }
});

initDrag(main, (from, to) => reorder(from, to));

// 移動把手的鍵盤操作：上下鍵把這個任務往前或往後移一格
main.addEventListener('keydown', e => {
  const t = e.target as HTMLElement;
  if (t.dataset.act !== 'move' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const i = Number(t.dataset.i);
  reorder(i, i + (e.key === 'ArrowUp' ? -1 : 1), true);
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

// 調整時間表還沒確認就關掉分頁或重新整理，先提醒
window.addEventListener('beforeunload', e => {
  if (state.draft && isDirty(state.draft)) e.preventDefault();
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
