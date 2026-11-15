import type { AppData, Block, Entry } from '../types';
import { baseBlocks, isBlockType, isTime, parseBlocks, parsePending } from './blocks';
import { parseKey, toMin } from './time';

const LS_KEY = 'momentum.v1';
const API = '/api/data';

export type SaveStatus = 'file' | 'local' | 'saving' | 'error';

const emptyData = (): AppData => ({ checks: {}, schedules: {}, pending: {}, log: {}, confirmed: {}, recover: {}, notes: {}, reviews: {} });

export const data: AppData = emptyData();

let status: SaveStatus = 'local';
let onStatus: (s: SaveStatus) => void = () => {};
export const setStatusListener = (fn: (s: SaveStatus) => void) => { onStatus = fn; };
const setStatus = (s: SaveStatus) => { status = s; onStatus(s); };

/** 舊版的資料多一個 modes（每天選正常、調整、恢復），讀進來時轉成新格式 */
type StoredData = Partial<AppData> & { modes?: unknown };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 舊版的時間表是陣列，沒有 id。讀進來後和原定時間表內容相同的時段沿用原定的 id，
 * 沒調整過的日子才能認出來、不留調整紀錄。
 */
function adoptBaseIds(blocks: Block[], base: Block[]): Block[] {
  const used = new Set<string>();
  return blocks.map(b => {
    if (!/^m\d+$/.test(b.id)) return b;
    const same = base.find(o => !used.has(o.id) && o.start === b.start && o.end === b.end && o.label === b.label && o.type === b.type);
    if (!same) return b;
    used.add(same.id);
    return { ...b, id: same.id };
  });
}

/** 一段實際紀錄的格式是否正確 */
function parseEntry(raw: unknown): Entry | null {
  if (!isRecord(raw)) return null;
  const { ref, label, type, start, end, cut, float, long } = raw;
  if (typeof ref !== 'string' || typeof label !== 'string' || !isBlockType(type) || !isTime(start)) return null;
  if (end !== undefined && (!isTime(end) || toMin(end) < toMin(start))) return null;
  const e: Entry = { ref, label, type, start };
  if (end !== undefined) e.end = end;
  if (cut === true) e.cut = true;
  if (float === true) e.float = true;
  if (long === true) e.long = true;
  return e;
}

function merge(src: StoredData) {
  const { modes, ...rest } = src;
  Object.assign(data, emptyData(), rest);

  // 只留下格式正確、而且真的和原定時間表不同的調整紀錄，壞掉的那一天退回原定時間表。
  // 舊紀錄裡的自由時間、彈性時間與生活時段（吃飯、洗澡、休息）會在 parseBlocks 拿掉
  const schedules: AppData['schedules'] = {};
  if (isRecord(data.schedules)) {
    for (const [day, raw] of Object.entries(data.schedules)) {
      const parsed = parseBlocks(raw);
      const original = baseBlocks(parseKey(day).getDay());
      const blocks = parsed && adoptBaseIds(parsed, original);
      if (blocks && JSON.stringify(blocks) !== JSON.stringify(original)) schedules[day] = blocks;
    }
  }
  data.schedules = schedules;

  const pending: AppData['pending'] = {};
  if (isRecord(data.pending)) {
    for (const [day, raw] of Object.entries(data.pending)) {
      const blocks = parsePending(raw);
      if (blocks.length) pending[day] = blocks;
    }
  }
  data.pending = pending;

  // 實際紀錄：格式不對的那一段丟掉。同一天最多只能有一段沒結束，多的從最早的開始補上結束時間
  const log: AppData['log'] = {};
  if (isRecord(data.log)) {
    for (const [day, raw] of Object.entries(data.log)) {
      const entries = Array.isArray(raw) ? raw.map(parseEntry).filter((e): e is Entry => e !== null) : [];
      const open = entries.filter(e => !e.end);
      open.slice(0, -1).forEach(e => (e.end = e.start));
      if (entries.length) log[day] = entries;
    }
  }
  data.log = log;

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
