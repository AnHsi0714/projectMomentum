import { DAY_NAMES } from '../config/schedule';
import { isSleepTime, parseTimeInput, SLEEP_MIN } from './blocks';
import type { Activity, Settings, Stage, WeekTemplate } from '../types';
import { addStage, moveStage } from './stages';
import { toMin } from './time';
import {
  checkTemplateDraft, commitTemplateDraft, isTemplateDirty, startTemplateDraft, type ActRow, type TemplateDraft,
} from './template-draft';

// 設定頁的整份草稿：每一天的活動與先後階段都先改在這裡，按一次「儲存」全部寫進設定檔。
// 切換星期不會丟掉改到一半的內容；每一步改動前記一份快照，可以一步一步復原。
// 只放純運算，不碰儲存，方便單獨測試。

export interface SettingsDraft {
  /** 改過或看過的那幾天；沒有的那天就是設定檔裡存的樣子 */
  days: Partial<Record<number, TemplateDraft>>;
  stages: Stage[];
  origStages: string;
  /** 就寢時間欄位的文字，儲存時才檢查 */
  sleep: string;
  origSleep: string;
  /** 復原用的快照，最新的在最後 */
  undo: string[];
}

/** 最多記幾步復原 */
const UNDO_MAX = 50;

const stagesText = (stages: Stage[]) => JSON.stringify(stages);

export function startSettingsDraft(saved: Settings): SettingsDraft {
  const stages = saved.stages.map(s => ({ ...s }));
  return { days: {}, stages, origStages: stagesText(stages), sleep: saved.sleep, origSleep: saved.sleep, undo: [] };
}

/** 某一天的草稿，還沒有就從設定檔裡存的開始 */
export function dayDraft(sd: SettingsDraft, day: number, saved: WeekTemplate): TemplateDraft {
  return (sd.days[day] ??= startTemplateDraft(day, saved[day] ?? []));
}

export const stagesDirty = (sd: SettingsDraft): boolean => stagesText(sd.stages) !== sd.origStages;

/** 有沒儲存變更的星期，照週一到週日排 */
export const dirtyDays = (sd: SettingsDraft): number[] =>
  [1, 2, 3, 4, 5, 6, 0].filter(day => {
    const d = sd.days[day];
    return d ? isTemplateDirty(d) : false;
  });

/** 就寢時間改了沒（1030 和 10:30 算一樣） */
export const sleepDirty = (sd: SettingsDraft): boolean => (parseTimeInput(sd.sleep) ?? sd.sleep) !== sd.origSleep;

/** 草稿裡的就寢時間（分鐘）：格式不對或不在範圍內時，先照存過的算，儲存時才擋 */
export function draftSleep(sd: SettingsDraft): number {
  const t = parseTimeInput(sd.sleep);
  return t && isSleepTime(t) ? toMin(t) : SLEEP_MIN;
}

export const isSettingsDirty = (sd: SettingsDraft): boolean => stagesDirty(sd) || sleepDirty(sd) || dirtyDays(sd).length > 0;

/** 還沒儲存的有哪些，給畫面寫成一句話，例如「週一、週三、先後階段」 */
export const dirtyNames = (sd: SettingsDraft): string[] => [
  ...(sleepDirty(sd) ? ['就寢時間'] : []),
  ...dirtyDays(sd).map(day => `週${DAY_NAMES[day]}`),
  ...(stagesDirty(sd) ? ['先後階段'] : []),
];

// 復原

interface Snapshot {
  days: Record<number, ActRow[]>;
  stages: Stage[];
  sleep: string;
}

const snapshotOf = (sd: SettingsDraft): string => {
  const days: Record<number, ActRow[]> = {};
  for (const [day, d] of Object.entries(sd.days)) if (d) days[Number(day)] = d.rows;
  return JSON.stringify({ days, stages: sd.stages, sleep: sd.sleep } satisfies Snapshot);
};

/** 改動前呼叫：記下現在的樣子。和上一份一樣就不記（例如點了欄位但沒改） */
export function pushUndo(sd: SettingsDraft): void {
  const snap = snapshotOf(sd);
  if (sd.undo.at(-1) === snap) return;
  sd.undo.push(snap);
  if (sd.undo.length > UNDO_MAX) sd.undo.shift();
}

/**
 * 復原一步。快照之後才打開的那幾天，回到存過的樣子。
 * 回傳有沒有復原（沒有可以復原的就是 false）
 */
export function undo(sd: SettingsDraft): boolean {
  // 最新的快照可能和現在一樣（記了但沒改），跳過
  const now = snapshotOf(sd);
  while (sd.undo.at(-1) === now) sd.undo.pop();
  const raw = sd.undo.pop();
  if (!raw) return false;
  const snap = JSON.parse(raw) as Snapshot;
  for (const [day, d] of Object.entries(sd.days)) {
    if (!d) continue;
    d.rows = snap.days[Number(day)] ?? (JSON.parse(d.orig) as ActRow[]);
    d.problems = [];
  }
  sd.stages = snap.stages;
  sd.sleep = snap.sleep;
  return true;
}

// 先後階段

/** 哪些浮動事項用到這個階段，例如「週一的晚餐」。看的是草稿裡的內容 */
export function stageUsers(sd: SettingsDraft, saved: WeekTemplate, id: string): string[] {
  const out: string[] = [];
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const acts: Pick<ActRow, 'label' | 'mode' | 'stage'>[] = sd.days[day]?.rows ?? (saved[day] ?? []).map(a => ({ ...a, stage: a.stage ?? '' }));
    for (const a of acts) if (a.mode === 'float' && a.stage === id) out.push(`週${DAY_NAMES[day]}的${a.label.trim() || '未命名活動'}`);
  }
  return out;
}

/** 把用到 from 階段的浮動事項都改到 to 階段（刪除階段前用） */
export function reassignStage(sd: SettingsDraft, saved: WeekTemplate, from: string, to: string): void {
  for (let day = 0; day < 7; day++) {
    const uses = (sd.days[day]?.rows ?? saved[day] ?? []).some(a => a.mode === 'float' && a.stage === from);
    if (!uses) continue;
    for (const r of dayDraft(sd, day, saved).rows) if (r.mode === 'float' && r.stage === from) r.stage = to;
  }
}

export const addDraftStage = (sd: SettingsDraft): Stage => addStage(sd.stages);
export const moveDraftStage = (sd: SettingsDraft, from: number, to: number): void => moveStage(sd.stages, from, to);

// 儲存

/** 儲存前檢查的結果：就寢時間有問題（訊息），或第一個有問題的星期（問題記在那天的草稿上），或都沒問題 */
export type SettingsCheck = { sleep: string } | { day: number } | null;

/**
 * 檢查就寢時間與改過的日子。改了就寢時間的話七天都要檢查，沒改過的日子也可能排到新的就寢時間之後
 */
export function checkSettingsDraft(sd: SettingsDraft, saved: WeekTemplate): SettingsCheck {
  const t = parseTimeInput(sd.sleep);
  if (!t || !isSleepTime(t)) return { sleep: '就寢時間請用 24 小時制，在 18:00 到 23:55 之間，例如 2330 或 23:30。' };
  const sleep = toMin(t);
  const ids = sd.stages.map(s => s.id);
  const days = sleepDirty(sd) ? [1, 2, 3, 4, 5, 6, 0] : dirtyDays(sd);
  let first: number | null = null;
  for (const day of days) {
    if (!checkTemplateDraft(dayDraft(sd, day, saved), ids, sleep) && first === null) first = day;
  }
  return first === null ? null : { day: first };
}

/** 檢查通過後呼叫：回傳要寫進設定檔的內容（改過的那幾天與先後階段），草稿換成存好的樣子 */
export function commitSettingsDraft(sd: SettingsDraft): { days: Record<number, Activity[]>; stages: Stage[]; sleep: string } {
  const days: Record<number, Activity[]> = {};
  for (const day of dirtyDays(sd)) days[day] = commitTemplateDraft(sd.days[day]!);
  const stages = sd.stages.map(s => ({ ...s }));
  sd.origStages = stagesText(sd.stages);
  const sleep = parseTimeInput(sd.sleep)!;
  sd.sleep = sd.origSleep = sleep;
  sd.undo = [];
  return { days, stages, sleep };
}
