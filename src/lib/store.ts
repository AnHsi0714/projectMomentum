import type { AppData } from '../types';

const LS_KEY = 'momentum.v1';
const API = '/api/data';

export type SaveStatus = 'file' | 'local' | 'saving' | 'error';

export const data: AppData = { checks: {}, modes: {}, notes: {}, reviews: {} };

let status: SaveStatus = 'local';
let onStatus: (s: SaveStatus) => void = () => {};
export const setStatusListener = (fn: (s: SaveStatus) => void) => { onStatus = fn; };
const setStatus = (s: SaveStatus) => { status = s; onStatus(s); };

function merge(src: Partial<AppData>) {
  Object.assign(data, { checks: {}, modes: {}, notes: {}, reviews: {} }, src);
}

const isEmpty = (d: Partial<AppData>) =>
  !d || Object.values(d).every(v => !v || Object.keys(v).length === 0);

/** 啟動時載入：優先讀資料夾裡的檔案；沒有伺服器時退回瀏覽器暫存 */
export async function load(): Promise<void> {
  let local: Partial<AppData> = {};
  try { local = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { /* ignore */ }
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as Partial<AppData>;
    const migrate = isEmpty(file) && !isEmpty(local); // 檔案是空的但瀏覽器有舊資料 → 遷移到檔案
    merge(migrate ? local : file);
    setStatus('file');
    if (migrate) await flush();
  } catch {
    merge(local);
    setStatus('local');
  }
}

async function flush(): Promise<void> {
  const body = JSON.stringify(data, null, 2);
  try { localStorage.setItem(LS_KEY, body); } catch { /* ignore */ }
  if (status === 'local') return; // 沒有伺服器，只存瀏覽器
  try {
    const res = await fetch(API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error(String(res.status));
    setStatus('file');
  } catch {
    setStatus('error');
  }
}

let timer: number | undefined;
/** 變更後呼叫；稍微延遲合併多次輸入 */
export function save(): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* ignore */ }
  if (status !== 'local') setStatus('saving');
  clearTimeout(timer);
  timer = window.setTimeout(flush, 400);
}

export function exportJson(): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `momentum-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJson(file: File): Promise<void> {
  const parsed: unknown = JSON.parse(await file.text());
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('備份檔格式不正確');
  }
  merge(parsed as Partial<AppData>);
  save();
}
