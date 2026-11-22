import './styles/main.scss';
import { render as paint, type TemplateResult } from 'lit-html';
import { DAY_NAMES } from './config/schedule';
import { initStripDrag, isStripDragging } from './strip-drag';
import { isBlockType, parseTimeInput, SLEEP_MIN, STEP_MIN } from './lib/blocks';
import {
  confirmDraft, draftConflicts, dropPending, insertRow, isDirty, moveRow, parkRow, removeRow, resetRows, resizeRow, restorePending,
  setField, sortDraft, startDraft, toggleDone, toggleLock, type Draft, type Result,
} from './lib/draft';
import { endRunning, keepRunning, pauseRunning, remainingOf, running, startFloat, startTask } from './lib/log';
import { blocksFor, floatsFor, setRecover } from './lib/schedule';
import { data, exportJson, importJson, load, save, setStatusListener, type SaveStatus } from './lib/store';
import { addDays, currentTime, dkey, elapsedMinutes, fmtDur, fmtMD, isDone, isToday, mondayOf, pad, parseKey, toMin } from './lib/time';
import { currentRoute, isRouteHash, state, type ViewId } from './state';
import { renderToday } from './views/today';
import { renderReview } from './views/review';
import { renderTerms } from './views/terms';
import { renderWeek } from './views/week';
import { renderSettings } from './views/settings';
import { hasTemplateChanges, initSettingsPage, leaveTemplateDraft } from './settings-page';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const main = $('#main');

const VIEWS: Record<ViewId, { title: string; render: () => TemplateResult }> = {
  today: { title: '今天', render: renderToday },
  week: { title: '本週', render: renderWeek },
  review: { title: '回顧', render: renderReview },
  terms: { title: '名詞', render: renderTerms },
  settings: { title: '設定', render: renderSettings },
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  file: '已儲存到 data 資料夾',
  saving: '儲存中…',
  local: '僅存在瀏覽器，請用 npm run dev 開啟',
  error: '儲存失敗，請確認伺服器仍在執行',
};

function updateClock(now: Date) {
  $('#clock').textContent = `${fmtMD(now)} 週${DAY_NAMES[now.getDay()]} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

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

/**
 * 重畫目前的畫面。lit-html 只改動有變化的部分，元件本身留在原處，所以焦點與捲動位置不會跑掉。
 * navigated 為 true 表示使用者換了頁：回到頂端並把焦點移到新頁標題。
 * 否則是資料變動造成的重畫：原本有焦點的元件如果因此消失（例如「回到本週」按下後就不見了），
 * 焦點改放到頁面標題，不會掉到頁面最前面。
 * 調整中的欄位內容都在 state.draft 裡，所以重畫不會丟掉使用者改到一半的東西。
 */
/** 畫面上目前是哪一頁，換頁時用來判斷是不是離開設定頁 */
let shown: ViewId | null = null;

function render(navigated = false) {
  const view = currentRoute();
  shown = view;
  const hadFocus = main.contains(document.activeElement) && document.activeElement !== main;

  // 訊息區沒有綁定內容，lit-html 不會清它；照原本的習慣，每次重畫先清掉上一次的訊息
  main.querySelectorAll('.form-msg').forEach(el => (el.textContent = ''));
  paint(VIEWS[view].render(), main);

  document.querySelectorAll<HTMLAnchorElement>('#nav a').forEach(a => {
    if (a.dataset.v === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${VIEWS[view].title}｜Momentum 律動計畫`;
  updateClock(currentTime());

  if (navigated) {
    window.scrollTo(0, 0);
    $('#view-title').focus({ preventScroll: true });
  } else if (hadFocus && !main.contains(document.activeElement)) {
    focusStill($('#view-title'));
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

/** 把焦點放到暫待區第 k 個任務的按鈕 */
function focusPending(act: string, k: number): boolean {
  const el = main.querySelector<HTMLButtonElement>(`button[data-act="${act}"][data-k="${k}"]`);
  if (!el) return false;
  focusStill(el);
  return true;
}

/** 把焦點放到某一列的欄位（名稱、時間條上的任務） */
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

/** 上一次播報時的衝突數，數量變了才再播報 */
let lastClash = 0;

/**
 * 開始調整時記下目前的衝突數。之後拖動放開或按鍵移動時，數量有變才在 #conflict-live 播報，
 * 拖動途中不播報，免得每移一格就唸一次。
 */
const resetClash = (d: Draft) => (lastClash = draftConflicts(d).length);

function announceConflicts(): void {
  const d = state.draft;
  if (!d) return;
  const n = draftConflicts(d).length;
  if (n === lastClash) return;
  lastClash = n;
  setMessage('conflict-live', n ? `有 ${n} 個衝突。` : '沒有衝突了，可以確認。');
}

/** 時間條比畫面寬時，捲到第 index 個任務，讓它出現在左邊 */
function scrollStripTo(index: number): void {
  const scroller = main.querySelector<HTMLElement>('.strip-scroll');
  const seg = main.querySelectorAll<HTMLElement>('.seg')[index];
  if (scroller && seg) scroller.scrollLeft += seg.getBoundingClientRect().left - scroller.getBoundingClientRect().left - 16;
}

/**
 * 打開調整時間表，焦點放在現在或接下來那個任務的名稱，時間條捲到它的位置。
 * 草稿裡有紀錄的任務換成了實際的時間，順序可能變，所以用草稿找位置。整天都過了就放第一個任務
 */
function openDraft(): Draft {
  const sel = state.selDate;
  const now = currentTime();
  const d = (state.draft = startDraft(dkey(sel), sel.getDay(), now));
  const elapsed = elapsedMinutes(d.date, now);
  const index = Math.max(d.blocks.findIndex(b => !isDone(b, elapsed)), 0);
  resetClash(d);
  render();
  focusField(index, 'label') || focusStill($('#new-label'));
  scrollStripTo(index);
  return d;
}

/** 把焦點放到時間條上第 index 個任務；固定的任務不能選，改放到它的名稱欄 */
function focusSeg(index: number, scroll = false): boolean {
  const seg = main.querySelector<HTMLElement>(`#r${index}-time`);
  if (!seg) return focusField(index, 'label');
  focusStill(seg);
  if (scroll) scrollStripTo(index);
  return true;
}

/**
 * 「現在」區塊的開始、結束按鈕：寫進實際紀錄並存檔，不經過調整時間表。
 * 按完後焦點放回「現在」區塊的第一個按鈕（按鈕可能換了一組），沒有就放到頁面標題。
 */
function handleRun(act: string, ref: string | undefined, at: number | undefined) {
  const now = currentTime();
  const sel = state.selDate;
  const dk = dkey(sel);
  const blocks = blocksFor(dk, sel.getDay());
  const floats = floatsFor(sel.getDay());
  const r = running(dk);
  // 過了就寢時間不能再開始任何事（畫面上的按鈕也已經拿掉），以防停在舊畫面上按到
  if (['start', 'again', 'float', 'switch'].includes(act) && elapsedMinutes(dk, now) >= SLEEP_MIN) return;
  let message = '';
  if (act === 'start') {
    const b = blocks.find(x => x.id === ref);
    if (!b) return;
    startTask(dk, b, now);
    message = `${r && r.ref !== b.id ? `「${r.label}」已結束。` : ''}開始「${b.label}」。`;
  } else if (act === 'again') {
    // 接著做剛結束的任務：從現在記新的一段。預定長度已經用完，不再問還在不在做
    const b = blocks.find(x => x.id === ref);
    if (!b) return;
    startTask(dk, b, now);
    keepRunning(dk);
    message = `接著做「${b.label}」，從現在開始記，做完再按結束。`;
  } else if (act === 'float') {
    const f = floats.find(x => x.id === ref);
    if (!f) return;
    startFloat(dk, f, now);
    message = `${r ? `「${r.label}」先暫停，結束後可以繼續。` : ''}開始「${f.label}」。`;
  } else if (act === 'end' || act === 'planned') {
    if (!r) return;
    endRunning(dk, now, act === 'planned' ? at : undefined);
    message = `「${r.label}」已結束，接下來是休息，要開始下一個時再按開始。`;
  } else if (act === 'pause') {
    if (!r || r.float) return;
    pauseRunning(dk, now);
    const b = blocks.find(x => x.id === r.ref);
    const left = b ? `，還剩 ${fmtDur(remainingOf(dk, b))}` : '';
    message = `「${r.label}」已暫停${left}。要接著做時按「繼續」。`;
  } else if (act === 'switch') {
    // 回到前一個任務：現在這個先暫停（之後可以繼續），前一個從現在接著做。前一個的預定長度用完了就不再問還在不在做
    const b = blocks.find(x => x.id === ref);
    if (!r || r.float || !b) return;
    pauseRunning(dk, now);
    startTask(dk, b, now);
    if (remainingOf(dk, b) === 0) keepRunning(dk);
    message = `「${r.label}」先暫停，回到「${b.label}」。做完按結束，再按繼續回到「${r.label}」。`;
  } else if (act === 'keep') {
    keepRunning(dk);
    message = `好，「${r?.label ?? ''}」繼續進行，不再提醒。`;
  }
  render();
  setMessage('hero-msg', message);
  focusStill(main.querySelector<HTMLElement>('#now-card button') ?? $('#view-title'));
}

/** 把草稿操作的結果寫進訊息區 */
const report = (r: Result) => (r.ok ? setMessage('adjust-msg', r.message) : setMessage('adjust-msg', r.error, true));

/**
 * 插入：讀表單、檢查，通過就插進草稿，焦點移到新任務的名稱。有問題就把焦點放到該修的欄位。
 * 「項目」選了浮動事項時，名稱、類型與固定都照那個浮動事項，不看那幾個欄位。
 */
function insert(d: Draft) {
  const field = (id: string) => main.querySelector<HTMLInputElement>(`#${id}`)!;
  const now = currentTime();
  const itemId = field('new-item').value;
  const float = itemId ? floatsFor(parseKey(d.date).getDay()).find(f => f.id === itemId) : undefined;
  const label = field('new-label').value.trim();
  const start = parseTimeInput(field('new-start').value);
  const minutes = Number(field('new-len').value);
  const type = field('new-type').value;
  const fail = (id: string, text: string) => {
    setMessage('adjust-msg', text, true);
    focusStill(field(id));
  };
  if (!float && !label) return fail('new-label', '請輸入要插入的任務名稱。');
  if (!start) return fail('new-start', '開始時間請用 24 小時制，例如 1400 或 14:00。');
  if (!Number.isInteger(minutes) || minutes < STEP_MIN) return fail('new-len', `長度至少 ${STEP_MIN} 分鐘，請填整數。`);
  if (!isBlockType(type)) return fail('new-type', '請選擇類型。');
  const r = insertRow(d, { label, type, start, minutes, clock: field('new-lock').checked, float }, now);
  if (!r.ok) return fail('new-start', r.error);
  field('new-label').value = '';
  render();
  report(r);
  if (r.index !== undefined && r.index >= 0) focusField(r.index, 'label');
}

/** 調整時間表上的各種按鈕。所有動作都只改草稿，按確認才存檔 */
function handleAction(act: string, index?: number, k?: number) {
  const sel = state.selDate;
  const now = currentTime();
  const d = state.draft;
  if (!d) return;

  if (act === 'insert') {
    insert(d);
    announceConflicts();
  } else if (act === 'goto' && index !== undefined) {
    focusSeg(index, true);
  } else if (act === 'park' && index !== undefined) {
    const r = parkRow(d, index);
    render();
    report(r);
    announceConflicts();
    focusButton('park', index) || focusPending('restore', d.pending.length - 1) || focusButton('insert');
  } else if (act === 'delete' && index !== undefined) {
    const r = removeRow(d, index);
    render();
    if (!r.ok) return setMessage('adjust-msg', r.error, true);
    setMessage('adjust-msg', r.message);
    announceConflicts();
    // 刪掉之後同一個位置換成下一個任務；刪的是最後一個就放在插入鈕
    focusButton('delete', index) || focusButton('insert');
  } else if (act === 'done' && index !== undefined) {
    const r = toggleDone(d, index, now);
    render();
    report(r);
    announceConflicts();
    focusButton('done', index);
  } else if (act === 'lock' && index !== undefined) {
    const r = toggleLock(d, index);
    render();
    report(r);
    focusButton('lock', index);
  } else if ((act === 'restore' || act === 'drop') && k !== undefined) {
    const r = act === 'restore' ? restorePending(d, k, now) : dropPending(d, k);
    render();
    report(r);
    announceConflicts();
    // 排回後焦點到那個任務的名稱；刪除或排不回時留在暫待區，暫待區空了就到插入鈕
    if (r.ok && act === 'restore' && r.index !== undefined) focusField(r.index, 'label');
    else focusPending(act, k) || focusPending('restore', 0) || focusButton('insert');
  } else if (act === 'reset') {
    resetRows(d, sel.getDay(), now);
    render();
    setMessage('adjust-msg', '計畫已還原成原定時間表，暫待區也清空了；做過的回到開始調整前的樣子。按確認後才會儲存。');
    announceConflicts();
    focusButton('insert');
  } else if (act === 'cancel') {
    if (isDirty(d) && !confirm('要放棄這次調整嗎？還沒確認的內容會消失。')) return;
    state.draft = null;
    render();
    $('#btn-adjust').focus({ preventScroll: true });
  } else if (act === 'confirm') {
    const r = confirmDraft(d, now);
    if ('problems' in r) {
      render();
      const rows = new Set(r.problems.map(p => p.index)).size;
      setMessage('adjust-error', `有 ${rows} 個任務需要修正，原因已標在欄位旁邊。`, true);
      focusField(r.problems[0].index, r.problems[0].field);
      return;
    }
    if ('conflicts' in r) {
      render();
      setMessage('adjust-error', `還有 ${r.conflicts.length} 個衝突，把任務拖開、縮短或移到暫待區之後才能確認。`, true);
      const first = main.querySelector<HTMLElement>('.conflict-item');
      if (first) focusStill(first);
      return;
    }
    state.draft = null;
    render();
    const merged = r.merged ? `同一件事接在一起或重疊的已合成一段，少了 ${r.merged} 列。` : '';
    setMessage('adjust-msg', `已更新這一天的時間表。${merged}`);
    focusStill($('#btn-adjust'));
  }
}

/** 定時與回到分頁時呼叫：更新時鐘、跨日換日、就地更新「現在」 */
function tick() {
  const now = currentTime();
  updateClock(now);
  if (state.followToday && dkey(state.selDate) !== dkey(now)) {
    state.selDate = now;
    state.draft = null; // 過了午夜，昨天的調整已經沒有意義
    render();
    return;
  }
  // 拖曳到一半不重畫，否則放開時的位置會算錯；下一次 tick 再更新
  if (currentRoute() === 'today' && isToday(state.selDate) && !isStripDragging()) render();
}

main.addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const chip = t.closest<HTMLElement>('[data-d]');
  const weekBtn = t.closest<HTMLElement>('[data-week]');
  const openDay = t.closest<HTMLElement>('[data-open-day]');
  const action = t.closest<HTMLElement>('[data-act]');
  const run = t.closest<HTMLElement>('[data-run]');

  if (chip) {
    const date = parseKey(chip.dataset.d!);
    if (goToDate(date, isToday(date))) render();
  } else if (weekBtn) {
    const delta = Number(weekBtn.dataset.week);
    const ok = delta === 0 ? goToDate(currentTime(), true) : goToDate(addDays(state.selDate, delta * 7), false);
    if (ok) render();
  } else if (t.closest('[data-today]')) {
    if (goToDate(currentTime(), true)) render();
  } else if (openDay) {
    const date = parseKey(openDay.dataset.openDay!);
    if (goToDate(date, isToday(date))) location.hash = '#/today';
  } else if (t.closest('#btn-adjust')) {
    // 這一天沒有任務時，焦點放在插入任務的名稱欄（見 openDraft）
    openDraft();
  } else if (run) {
    handleRun(run.dataset.run!, run.dataset.ref, run.dataset.at === undefined ? undefined : Number(run.dataset.at));
  } else if (action) {
    const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));
    handleAction(action.dataset.act!, num(action.dataset.i), num(action.dataset.k));
  } else if (t.closest('#btn-export')) {
    exportJson();
  } else if (t.closest('#btn-import')) {
    $<HTMLInputElement>('#file-import').click();
  }
});

main.addEventListener('change', async e => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'recover') {
    state.recoverTouched = dkey(state.selDate);
    setRecover(state.recoverTouched, t.checked, currentTime());
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
  } else if (state.draft && (t.dataset.f === 'label' || t.dataset.f === 'type')) {
    // 調整時間表的名稱與類型：只更新草稿，不存檔、不重畫，打字不會被打斷
    setField(state.draft, Number(t.dataset.i), t.dataset.f, t.value);
  }
});

// 時間條：拖動任務整塊移動或改長度，每移一格就改草稿並重畫。拖動途中不重排，放開後才依時間重排並播報衝突
initStripDrag(
  main,
  i => {
    const b = state.draft?.blocks[i];
    return b ? [b.start, b.end] : undefined;
  },
  (i, start) => {
    if (!state.draft) return;
    moveRow(state.draft, i, start);
    render();
  },
  (i, end) => {
    if (!state.draft) return;
    resizeRow(state.draft, i, end);
    render();
  },
  () => {
    if (!state.draft) return;
    sortDraft(state.draft);
    render();
    announceConflicts();
  },
);

// 時間條的鍵盤操作：焦點在任務上時左右鍵移動 5 分鐘，Page Up／Page Down 移動 30 分鐘，Shift 加左右鍵改長度。
// 移動後依時間重排，焦點跟著這個任務走
const KEY_STEP: Record<string, number> = { ArrowLeft: -STEP_MIN, ArrowRight: STEP_MIN, PageUp: -30, PageDown: 30 };
main.addEventListener('keydown', e => {
  const t = e.target as HTMLElement;
  const d = state.draft;
  const step = KEY_STEP[e.key];
  if (!d || t.dataset.seg === undefined || step === undefined) return;
  e.preventDefault();
  const i = Number(t.dataset.seg);
  const b = d.blocks[i];
  if (!b) return;
  const resize = e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
  if (resize) resizeRow(d, i, toMin(b.end) + step);
  else moveRow(d, i, toMin(b.start) + step);
  const at = sortDraft(d, b);
  render();
  if (at !== i) focusSeg(at);
  announceConflicts();
});

initSettingsPage(main, { render, setMessage, focusStill });

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
  if (!isRouteHash(location.hash)) return;
  // 離開設定頁時，範本有沒儲存的變更先問；想留下來就把網址改回設定頁（不會再觸發 hashchange）
  if (shown === 'settings' && location.hash !== '#/settings' && !leaveTemplateDraft()) {
    history.replaceState(null, '', '#/settings');
    return;
  }
  render(true);
});

// 調整時間表還沒確認就關掉分頁或重新整理，先提醒
window.addEventListener('beforeunload', e => {
  if ((state.draft && isDirty(state.draft)) || hasTemplateChanges()) e.preventDefault();
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
