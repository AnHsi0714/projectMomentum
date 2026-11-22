import { DEFAULT_SLEEP_TIME, DEFAULT_STAGES, DEFAULT_TEMPLATE } from '../config/schedule';
import type { AppData, Block, Entry, Settings } from '../types';
import {
  applySleepTime, blocksOf, isBlockType, isSleepTime, isTime, legacyType, parseBlocks, parsePending, parseStages, parseTemplate,
} from './blocks';
import { parseKey, toMin } from './time';

// 紀錄（AppData）存在 data/momentum.json，設定（Settings）存在 data/settings.json，
// 分別由開發伺服器的 /api/data 與 /api/settings 讀寫；瀏覽器也各留一份暫存。

export type SaveStatus = 'file' | 'local' | 'saving' | 'error';

const emptyData = (): AppData => ({
  checks: {}, schedules: {}, pending: {}, log: {}, confirmed: {}, recover: {}, notes: {}, reviews: {},
});

export const data: AppData = emptyData();

export const settings: Settings = {
  template: parseTemplate(DEFAULT_TEMPLATE, DEFAULT_TEMPLATE),
  stages: parseStages(DEFAULT_STAGES, DEFAULT_STAGES),
  sleep: DEFAULT_SLEEP_TIME,
};

/** 兩個檔案：存檔時只寫有變動的那個 */
type Store = 'data' | 'settings';
const STORES: Record<Store, { api: string; ls: string; value: () => unknown }> = {
  data: { api: '/api/data', ls: 'momentum.v1', value: () => data },
  settings: { api: '/api/settings', ls: 'momentum.settings.v1', value: () => settings },
};
const dirty = new Set<Store>();

let status: SaveStatus = 'local';
let onStatus: (s: SaveStatus) => void = () => {};
export const setStatusListener = (fn: (s: SaveStatus) => void) => { onStatus = fn; };
const setStatus = (s: SaveStatus) => { status = s; onStatus(s); };

/**
 * 舊版的資料多一個 modes（每天選正常、調整、恢復），讀進來時轉成新格式。
 * 更早的版本把每週範本（template）也放在紀錄裡，讀進來時搬到設定。
 */
type StoredData = Partial<AppData> & { modes?: unknown; template?: unknown; stages?: unknown; sleep?: unknown };

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
  const e: Entry = { ref, label, type: legacyType(type, label), start };
  if (end !== undefined) e.end = end;
  if (cut === true) e.cut = true;
  if (float === true) e.float = true;
  if (long === true) e.long = true;
  return e;
}

/**
 * 讀取設定。每週範本沒有時用預設範本，某一天格式不對，那一天退回預設；
 * 先後階段沒有或格式不對，用預設的階段
 */
function mergeSettings(src: Partial<Record<keyof Settings, unknown>>) {
  // 就寢時間要先讀：範本裡的活動要在就寢前結束
  settings.sleep = isSleepTime(src.sleep) ? src.sleep : DEFAULT_SLEEP_TIME;
  applySleepTime(settings.sleep);
  settings.template = parseTemplate(src.template, DEFAULT_TEMPLATE);
  settings.stages = parseStages(src.stages, DEFAULT_STAGES);
}

/** 讀取紀錄。要先讀設定：調整過的時間表要和每週範本比對 */
function merge(src: StoredData) {
  const { modes, ...rest } = src;
  // 範本與階段在設定裡，由 mergeSettings 讀
  delete rest.template;
  delete rest.stages;
  delete rest.sleep;
  Object.assign(data, emptyData(), rest);

  // 舊版手動勾的起床（sleep）拿掉：起床改依起床時間判斷，不看勾選
  if (isRecord(data.checks)) {
    for (const day of Object.values(data.checks)) if (isRecord(day)) delete day.sleep;
  }

  // 只留下格式正確、而且真的和原定時間表不同的調整紀錄，壞掉的那一天退回原定時間表。
  // 舊紀錄裡的自由時間、彈性時間與生活時段（吃飯、洗澡、休息）會在 parseBlocks 拿掉
  const schedules: AppData['schedules'] = {};
  if (isRecord(data.schedules)) {
    for (const [day, raw] of Object.entries(data.schedules)) {
      const parsed = parseBlocks(raw);
      const original = blocksOf(settings.template[parseKey(day).getDay()]);
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

const isEmpty = (d: object) =>
  !d || Object.values(d).every(v => !v || Object.keys(v).length === 0);

const readLocal = (key: string): Record<string, unknown> => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    return isRecord(v) ? v : {};
  } catch {
    return {};
  }
};

async function fetchJson(api: string): Promise<Record<string, unknown>> {
  const res = await fetch(api);
  if (!res.ok) throw new Error(String(res.status));
  const v: unknown = await res.json();
  return isRecord(v) ? v : {};
}

/**
 * 啟動時載入：優先讀資料夾裡的檔案；沒有伺服器時退回瀏覽器暫存。
 * 紀錄檔是空的但瀏覽器有舊資料，遷移到檔案；設定檔沒有範本但紀錄裡有（舊版），搬到設定檔。
 */
export async function load(): Promise<void> {
  const local = readLocal(STORES.data.ls);
  const localSettings = readLocal(STORES.settings.ls);
  try {
    const [file, fileSettings] = await Promise.all([fetchJson(STORES.data.api), fetchJson(STORES.settings.api)]);
    const migrate = isEmpty(file) && !isEmpty(local);
    const src = (migrate ? local : file) as StoredData;
    const moveTemplate = fileSettings.template === undefined && src.template !== undefined;
    mergeSettings(moveTemplate ? { template: src.template } : fileSettings);
    merge(src);
    setStatus('file');
    if (migrate || moveTemplate) {
      dirty.add('data');
      dirty.add('settings');
      await flush();
    }
  } catch {
    const src = local as StoredData;
    mergeSettings(localSettings.template !== undefined ? localSettings : { template: src.template });
    merge(src);
    setStatus('local');
  }
}

function saveLocal(which: Store): string {
  const body = JSON.stringify(STORES[which].value(), null, 2);
  try { localStorage.setItem(STORES[which].ls, body); } catch { /* ignore */ }
  return body;
}

async function flush(): Promise<void> {
  const todo = [...dirty];
  dirty.clear();
  const bodies = todo.map(w => [w, saveLocal(w)] as const);
  if (status === 'local') return; // 沒有伺服器，只存瀏覽器
  try {
    for (const [w, body] of bodies) {
      const res = await fetch(STORES[w].api, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) throw new Error(String(res.status));
    }
    setStatus('file');
  } catch {
    todo.forEach(w => dirty.add(w)); // 下一次存檔再試
    setStatus('error');
  }
}

let timer: number | undefined;
/** 紀錄變更後呼叫；稍微延遲合併多次輸入 */
export function save(which: Store = 'data'): void {
  dirty.add(which);
  saveLocal(which);
  if (status !== 'local') setStatus('saving');
  clearTimeout(timer);
  timer = window.setTimeout(flush, 400);
}

/** 設定變更後呼叫 */
export const saveSettings = (): void => save('settings');

/** 備份檔是一個 JSON：紀錄加上設定（每週範本 template、先後階段 stages），匯入時設定搬回設定檔 */
export function exportJson(): void {
  const blob = new Blob([JSON.stringify({ ...data, ...settings }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `momentum-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJson(file: File): Promise<void> {
  const parsed: unknown = JSON.parse(await file.text());
  if (!isRecord(parsed)) throw new Error('備份檔格式不正確');
  const src = parsed as StoredData;
  // 舊備份沒有的設定項目不動目前的設定
  if (src.template !== undefined || src.stages !== undefined || src.sleep !== undefined) {
    mergeSettings({ template: src.template ?? settings.template, stages: src.stages ?? settings.stages, sleep: src.sleep ?? settings.sleep });
    save('settings');
  }
  merge(src);
  save('data');
}
