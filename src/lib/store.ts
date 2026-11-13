import { SCHEDULE } from '../config/schedule';
import type { AppData } from '../types';
import { parseBlocks } from './blocks';
import { parseKey } from './time';

const LS_KEY = 'momentum.v1';
const API = '/api/data';

export type SaveStatus = 'file' | 'local' | 'saving' | 'error';

const emptyData = (): AppData => ({ checks: {}, schedules: {}, confirmed: {}, recover: {}, notes: {}, reviews: {} });

export const data: AppData = emptyData();

let status: SaveStatus = 'local';
let onStatus: (s: SaveStatus) => void = () => {};
export const setStatusListener = (fn: (s: SaveStatus) => void) => { onStatus = fn; };
const setStatus = (s: SaveStatus) => { status = s; onStatus(s); };

/** 舊版的資料多一個 modes（每天選正常、調整、恢復），讀進來時轉成新格式 */
type StoredData = Partial<AppData> & { modes?: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function merge(src: StoredData) {
  const { modes, ...rest } = src;
  Object.assign(data, emptyData(), rest);

  // 只留下格式正確、而且真的和原定時間表不同的調整紀錄，壞掉的那一天退回原定時間表
  const schedules: AppData['schedules'] = {};
  if (isRecord(data.schedules)) {
    for (const [day, raw] of Object.entries(data.schedules)) {
      const blocks = parseBlocks(raw);
      const original = SCHEDULE[parseKey(day).getDay()];
      if (blocks && JSON.stringify(blocks) !== JSON.stringify(original)) schedules[day] = blocks;
    }
  }
  data.schedules = schedules;

  const confirmed: AppData['confirmed'] = {};
  if (isRecord(data.confirmed)) {
    for (const [day, on] of Object.entries(data.confirmed)) if (on === true) confirmed[day] = true;
  }
  data.confirmed = confirmed;

  const recover: AppData['recover'] = {};
  if (isRecord(data.recover)) {
    for (const [day, since] of Object.entries(data.recover)) {
      if (typeof since === 'number' && since >= 0 && since <= 24 * 60) recover[day] = since;
    }
  }
  // 舊版選過恢復模式的日子：當時整天的運動都算取消，所以從 0 分鐘算起
  if (isRecord(modes)) {
    for (const [day, mode] of Object.entries(modes)) {
      if (mode === 'recover' && recover[day] === undefined) recover[day] = 0;
    }
  }
  data.recover = recover;
}

const isEmpty = (d: StoredData) =>
  !d || Object.values(d).every(v => !v || Object.keys(v).length === 0);

/** 啟動時載入：優先讀資料夾裡的檔案；沒有伺服器時退回瀏覽器暫存 */
export async function load(): Promise<void> {
  let local: StoredData = {};
  try { local = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'); } catch { /* ignore */ }
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(String(res.status));
    const file = (await res.json()) as StoredData;
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
  merge(parsed as StoredData);
  save();
}
