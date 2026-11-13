import './styles/main.scss';
import { DAY_NAMES } from './config/schedule';
import { data, exportJson, importJson, load, save, setStatusListener, type SaveStatus } from './lib/store';
import { dkey, mondayOf, pad, parseKey } from './lib/time';
import { state, type ViewId } from './state';
import { renderToday } from './views/today';
import { renderWeek } from './views/week';
import { renderReview } from './views/review';
import type { ModeId } from './types';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

const STATUS_TEXT: Record<SaveStatus, string> = {
  file: '已儲存到 data/momentum.json',
  saving: '儲存中…',
  local: '僅瀏覽器暫存（請用 npm run dev 開啟）',
  error: '儲存失敗，請確認伺服器仍在執行',
};

function render() {
  // 輸入中不重繪，避免打字被打斷
  if (document.activeElement?.tagName === 'TEXTAREA') return;
  const views: Record<ViewId, () => string> = { today: renderToday, week: renderWeek, review: renderReview };
  $('#main').innerHTML = views[state.view]();
  const n = new Date();
  $('#clock').textContent = `${n.getFullYear()}/${n.getMonth() + 1}/${n.getDate()} 週${DAY_NAMES[n.getDay()]} ${pad(n.getHours())}:${pad(n.getMinutes())}`;
}

$('#nav').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
  if (!b) return;
  state.view = b.dataset.v as ViewId;
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x === b));
  render();
});

$('#main').addEventListener('click', e => {
  const t = e.target as HTMLElement;
  const d = t.closest<HTMLElement>('[data-d]');
  const m = t.closest<HTMLElement>('[data-m]');
  if (d) { state.selDate = parseKey(d.dataset.d!); render(); }
  if (m) { data.modes[dkey(state.selDate)] = m.dataset.m as ModeId; save(); render(); }
  if (t.id === 'btn-export') exportJson();
  if (t.id === 'btn-import') $<HTMLInputElement>('#file-import').click();
});

$('#main').addEventListener('change', async e => {
  const t = e.target as HTMLInputElement;
  if (t.dataset.h) {
    const dk = dkey(state.selDate);
    (data.checks[dk] ??= {})[t.dataset.h] = t.checked;
    save();
  } else if (t.id === 'file-import' && t.files?.[0]) {
    try { await importJson(t.files[0]); render(); } catch { alert('匯入失敗：不是有效的備份檔'); }
  }
});

$('#main').addEventListener('input', e => {
  const t = e.target as HTMLTextAreaElement;
  if (t.id === 'note') {
    data.notes[dkey(state.selDate)] = t.value;
    save();
  } else if (t.dataset.q !== undefined) {
    const key = dkey(mondayOf(new Date()));
    (data.reviews[key] ??= {})[t.dataset.q] = t.value;
    save();
  }
});

setStatusListener(s => { $('#save-status').textContent = STATUS_TEXT[s]; });

load().then(() => {
  render();
  setInterval(render, 30_000);
});
