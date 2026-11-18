import type { Block, Entry, Float } from '../types';
import {
  baseBlocks, blanks, conflicts, copyBlock, dayProblems, durOf, isBlockType, isLocked, LIFE_TYPES, mergeTouching, moveBlock, newId,
  resizeBlock, sameTask, SLEEP_MIN, sortBlocks, STEP_MIN, touches, withLock, type Conflict, type Problem,
} from './blocks';
import { logFor, plannedEnd, replaceLog } from './log';
import { applyDay, blocksFor, floatsFor, pendingFor, plannedWake } from './schedule';
import { currentTime, dkey, elapsedMinutes, fmtTime, parseKey, toMin } from './time';

/**
 * 「調整時間表」的草稿：開始調整時把這一天整理成一份清單，之後所有編輯、拖動、插入、刪除
 * 都只改草稿，按「確認」才存進資料，按取消就整份丟掉。
 *
 * 時間表以實際為準，計畫只是一開始的安排：
 *   做過的（有實際紀錄的任務與浮動事項）照實際的時間列出，被打斷再繼續的任務分成兩段。
 *     拖動、改長度、刪除改的就是實際紀錄。
 *   沒做的照計畫列出，改的是計畫。
 *   「有做」切換一列是實際還是計畫：忘了按開始，就把任務拖到實際的時間再按「有做」。
 *
 * 只要沒定稿，哪一天都能調整，包括過去的日子。鎖定的固定時段不能拖動。
 * 任務可以暫時重疊，重疊的地方列成衝突，全部解開才能確認（見 draftConflicts）。
 */

/** 一列的實際紀錄資訊。有這個的列是做過的，沒有的是計畫 */
export interface Rec {
  /** 實際紀錄的 ref：任務或浮動事項的 id */
  ref: string;
  float?: true;
  cut?: true;
  long?: true;
}

/** 草稿的一列：時段，做過的多帶實際紀錄的資訊 */
export type DraftRow = Block & { rec?: Rec };

export interface Draft {
  date: string;
  /** 正在編輯的整天時間表，依開始時間排好（拖動途中例外，放開後才重排） */
  blocks: DraftRow[];
  /** 暫待區 */
  pending: Block[];
  /** 開始調整時的樣子，用來判斷有沒有未確認的變動 */
  original: DraftRow[];
  originalPending: Block[];
  /** 上一次儲存沒通過檢查時，各列要修正的地方 */
  problems: Problem[];
}

export type Result = { ok: true; message: string; index?: number } | { ok: false; error: string };

const copy = <T extends Block>(blocks: T[]): T[] => blocks.map(copyBlock);
const nameOf = (b: Block) => b.label.trim() || '未命名的任務';

/** 這一天是今天，而且這一列做過、結束時間在現在之後：還在進行 */
export const isRunningRow = (date: string, b: DraftRow, now: Date): boolean =>
  !!b.rec && date === dkey(now) && toMin(b.end) > elapsedMinutes(date, now);

/**
 * 把一天整理成草稿的列：每一段實際紀錄一列，沒有紀錄的計畫各一列。
 * 進行中的那一段，結束先當成預計結束（實際開始加上還剩的長度），已經超過就到下一個 5 分鐘。
 * 開始與結束在同一分鐘的紀錄（剛開始就被打斷）沒有長度，不列出，確認後也就不留。
 * 做過的列一律不鎖定，才能拖動。
 */
function buildRows(dk: string, plan: Block[], now: Date): DraftRow[] {
  const elapsed = elapsedMinutes(dk, now);
  const floats = floatsFor(parseKey(dk).getDay());
  const log = logFor(dk);
  const recorded = new Set(log.map(e => e.ref));
  const rows = log.flatMap((e, i): DraftRow[] => {
    const s = toMin(e.start);
    const end = e.end
      ? toMin(e.end)
      : Math.max(plannedEnd(dk, e, plan, floats), Math.ceil((elapsed + 1) / STEP_MIN) * STEP_MIN, s + STEP_MIN);
    const finish = Math.min(end, SLEEP_MIN);
    if (finish <= s) return [];
    const rec: Rec = { ref: e.ref };
    if (e.float) rec.float = true;
    if (e.cut) rec.cut = true;
    if (e.long) rec.long = true;
    const label = (e.float ? undefined : plan.find(b => b.id === e.ref)?.label) ?? e.label;
    return [withLock<DraftRow>({ id: `r${i}`, start: e.start, end: fmtTime(finish), label, type: e.type, rec }, false)];
  });
  return sortBlocks([...rows, ...plan.filter(b => !recorded.has(b.id)).map(copyBlock)]);
}

/** 開始調整 */
export function startDraft(dateKey: string, day: number, now: Date): Draft {
  const blocks = buildRows(dateKey, blocksFor(dateKey, day), now);
  const pending = copy(pendingFor(dateKey));
  return { date: dateKey, blocks, pending, original: copy(blocks), originalPending: copy(pending), problems: [] };
}

/** 有沒有還沒確認的變動 */
export const isDirty = (d: Draft): boolean =>
  JSON.stringify([d.blocks, d.pending]) !== JSON.stringify([d.original, d.originalPending]);

/**
 * 兩列是不是同一件事，接在一起或重疊時確認會合併成一段：
 * 做過的看是不是同一個任務或浮動事項的紀錄；計畫看名稱、類型與鎖定是否都相同。做過的和計畫不合併。
 */
export const sameItem = (a: DraftRow, b: DraftRow): boolean =>
  a.rec && b.rec ? a.rec.ref === b.rec.ref : !a.rec && !b.rec && sameTask(a, b);

/** 確認時會合併的兩列（在草稿裡的位置，a < b），拖動時就列出來，不用等確認後才知道 */
export function draftMerges(d: Draft): [number, number][] {
  const out: [number, number][] = [];
  d.blocks.forEach((a, i) =>
    d.blocks.forEach((b, j) => {
      if (i < j && sameItem(a, b) && touches(a, b)) out.push([i, j]);
    }),
  );
  return out;
}

/**
 * 草稿目前的衝突。同一件事重疊不算衝突，確認時直接合併（見 sameItem）。
 * 做過的彼此重疊一定是衝突，同一段時間不能做兩件事。
 * 其他的重疊（牽涉到計畫或固定時段）只看現在之後的部分：現在之前的計畫只是參考，
 * 例如沒做的任務或通勤和做過的事疊在一起，不用為了它去改。過去的日子因此只檢查做過的。
 */
export function draftConflicts(d: Draft): Conflict[] {
  const elapsed = elapsedMinutes(d.date, currentTime());
  return conflicts(d.blocks)
    .filter(c => !sameItem(d.blocks[c.a], d.blocks[c.b]))
    .flatMap(c => {
      if (d.blocks[c.a].rec && d.blocks[c.b].rec) return [c];
      const start = Math.max(c.start, elapsed);
      return c.end > start ? [{ ...c, start }] : [];
    })
    .sort((x, y) => x.start - y.start);
}

/**
 * 依開始時間重排草稿，回傳某個任務重排後的位置。拖動或按鍵移動之後呼叫，
 * 清單與時間條的順序才會跟著時間走。任務本身是同一個物件，用它找新位置。
 */
export function sortDraft(d: Draft, keep?: DraftRow): number {
  d.blocks = sortBlocks(d.blocks);
  return keep ? d.blocks.indexOf(keep) : -1;
}

/**
 * 時間條的左端（分鐘數）：開始調整時第一個任務所在整點的前一小時，第一個任務最早只能拉到這裡。
 * 只看開始調整時的樣子與目前最早的任務的整點，拖動第一個任務時刻度不會跟著跑。
 */
export function stripStart(d: Draft): number {
  const hour = (b: Block | undefined) => (b ? Math.floor(toMin(b.start) / 60) * 60 : SLEEP_MIN);
  const first = d.blocks.reduce<Block | undefined>((a, b) => (!a || toMin(b.start) < toMin(a.start) ? b : a), undefined);
  // 假日起床是浮動事項，不在時間表上：從起床準備完的整點開始，早上的任務才拖得到更早
  const wake = plannedWake(new Date(`${d.date}T00:00`).getDay());
  const afterWake = wake ? Math.floor((toMin(wake) + 30) / 60) * 60 : SLEEP_MIN;
  return Math.max(0, Math.min(hour(d.original[0]), hour(first), afterWake));
}

/**
 * 使用者在某一列改了名稱或類型。不重畫、不排序，邊打字邊更新草稿。改類型時保留原本的鎖定狀態。
 * 起床、吃飯、休息這類生活類型不能當成任務的類型（固定時段例外）。
 * 做過的任務被打斷分成好幾段時，名稱與類型是同一個任務的，所以每一段一起改。
 */
export function setField(d: Draft, index: number, field: 'label' | 'type', value: string): void {
  const b = d.blocks[index];
  if (!b) return;
  const same = b.rec && !b.rec.float ? d.blocks.flatMap((x, i) => (x.rec?.ref === b.rec!.ref && !x.rec.float ? [i] : [])) : [index];
  for (const i of same) {
    const x = d.blocks[i];
    if (field === 'label') x.label = value;
    else if (isBlockType(value) && (!LIFE_TYPES.has(value) || isLocked(x))) d.blocks[i] = withLock({ ...x, type: value }, isLocked(x));
  }
  // 這一列改過，之前標的問題先拿掉，下次儲存會重新檢查
  d.problems = d.problems.filter(p => !same.includes(p.index));
}

/** 切換鎖定。生活類型（睡前準備、平日起床）解除鎖定就不再是時段，所以不能解除；做過的也不能鎖定 */
export function toggleLock(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  if (b.rec) return { ok: false, error: `「${nameOf(b)}」已經做過，不能設成固定。` };
  const locked = !isLocked(b);
  if (!locked && LIFE_TYPES.has(b.type)) return { ok: false, error: `「${nameOf(b)}」是固定時段，不能解除固定。` };
  d.blocks[index] = withLock(b, locked);
  return {
    ok: true,
    index,
    message: locked ? `已把「${nameOf(b)}」設成固定，照時鐘自動開始與結束，不能拖動。` : `「${nameOf(b)}」改成任務，要按開始才開始。`,
  };
}

/**
 * 切換「有做」：計畫變成做過的實際紀錄，或做過的改回計畫（沒做）。
 *   改成有做：要在現在之前開始。結束在現在之後的，確認後就是進行中。
 *   改回沒做：浮動事項沒有計畫，只能刪除。被打斷分成好幾段的任務，改回的那一段變成另一個計畫中的任務。
 */
export function toggleDone(d: Draft, index: number, now: Date): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  if (isLocked(b)) return { ok: false, error: `「${nameOf(b)}」是固定時段，照時鐘走，不用記有沒有做。` };
  if (b.rec) {
    if (b.rec.float) return { ok: false, error: `「${nameOf(b)}」是浮動事項，沒做的話請按刪除。` };
    const ref = b.rec.ref;
    const { rec: _, ...plan } = b;
    const shared = d.blocks.some(x => x !== b && (x.id === ref || x.rec?.ref === ref));
    d.blocks[index] = { ...plan, id: shared ? newId() : ref };
    d.problems = d.problems.filter(p => p.index !== index);
    return { ok: true, index, message: `「${nameOf(b)}」改成沒做，留在 ${b.start} 到 ${b.end} 當計畫。按確認後才會儲存。` };
  }
  const elapsed = elapsedMinutes(d.date, now);
  if (toMin(b.start) > elapsed) return { ok: false, error: `「${nameOf(b)}」預定 ${b.start} 開始，還沒到，不能記成有做。` };
  d.blocks[index] = { ...b, rec: { ref: b.id } };
  const running = isRunningRow(d.date, d.blocks[index], now);
  return {
    ok: true,
    index,
    message: `「${nameOf(b)}」記成有做，${running ? `${b.start} 開始，現在還在進行` : `${b.start} 到 ${b.end}`}。時間不對的話在時間條上拖動。按確認後才會儲存。`,
  };
}

/** 在時間條上整塊移動第 index 個任務到 start（分鐘數），可以蓋過其他任務 */
export const moveRow = (d: Draft, index: number, start: number): void =>
  moveBlock(d.blocks, index, start, stripStart(d));

/** 在時間條上改第 index 個任務的結束時間（分鐘數） */
export const resizeRow = (d: Draft, index: number, end: number): void => resizeBlock(d.blocks, index, end);

/** 插入時填的內容。float 有值時插入的是那個浮動事項（名稱、類型照它），用來補記忘了按的吃飯、洗澡 */
export interface NewTask {
  label: string;
  type: Block['type'];
  start: string;
  minutes: number;
  locked: boolean;
  float?: Float;
}

/** 有幾個衝突的說明文字，沒有就是空字串 */
const conflictNote = (d: Draft): string => {
  const n = draftConflicts(d).length;
  return n ? `現在有 ${n} 個衝突，拖開之後才能確認。` : '';
};

/**
 * 插入一個開始時間確定的任務，放在指定的時間。不推動其他任務：
 * 和原本的任務重疊就列成衝突，由使用者決定要挪開、縮短還是刪除。
 *   浮動事項一定是做過的，所以要在現在之前開始。
 *   任務整段都在現在之前的，當成忘了記的事，直接記成有做；不是的話按「有做」取消。
 */
export function insertRow(d: Draft, t: NewTask, now: Date): Result {
  const s = toMin(t.start);
  const elapsed = elapsedMinutes(d.date, now);
  if (s + t.minutes > SLEEP_MIN) return { ok: false, error: `要在 ${fmtTime(SLEEP_MIN)} 前結束，不延後睡眠來補進度。` };
  if (t.float && s > elapsed) return { ok: false, error: `浮動事項只能記已經發生的，開始要在現在（${fmtTime(elapsed)}）之前。` };
  const end = fmtTime(s + t.minutes);
  const id = newId();
  const block: DraftRow = t.float
    ? withLock<DraftRow>({ id, start: t.start, end, label: t.float.label, type: t.float.type, rec: { ref: t.float.id, float: true } }, false)
    : withLock<DraftRow>({ id, start: t.start, end, label: t.label.trim(), type: t.type }, t.locked);
  if (!t.float && !t.locked && s + t.minutes <= elapsed) block.rec = { ref: id };
  d.blocks.push(block);
  const index = sortDraft(d, block);
  d.problems = [];
  const done = block.rec && !t.float ? '已經過了，記成有做。' : '';
  return {
    ok: true,
    index,
    message: `已插入「${nameOf(block)}」${block.start} 到 ${block.end}。${done}${conflictNote(d)}按確認後才會儲存。`,
  };
}

/** 刪除一列，它的時間變成空白。做過的就是刪掉那段實際紀錄 */
export function removeRow(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  d.blocks.splice(index, 1);
  d.problems = [];
  const what = b.rec ? `「${nameOf(b)}」${b.start} 到 ${b.end} 的紀錄` : `「${nameOf(b)}」`;
  return { ok: true, message: `已刪除${what}，這段時間變成空白。${conflictNote(d)}按確認後才會儲存。`, index };
}

/** 把一列移到暫待區：今天先不排，但還沒決定要不要做。它的時間變成空白。做過的不能移 */
export function parkRow(d: Draft, index: number): Result {
  const b = d.blocks[index];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  if (isLocked(b)) return { ok: false, error: `「${nameOf(b)}」是固定時段，不能移到暫待區。` };
  if (b.rec) return { ok: false, error: `「${nameOf(b)}」已經做過，不能移到暫待區。沒做的話先按「有做」取消。` };
  d.blocks.splice(index, 1);
  d.pending.push(b);
  d.problems = [];
  return { ok: true, message: `已把「${nameOf(b)}」移到暫待區。${conflictNote(d)}按確認後才會儲存。`, index };
}

/**
 * 把暫待區的第 k 個任務排回時間表：放進第一段放得下的空白（今天只看現在之後），
 * 都放不下就放進最長的一段並縮短成那段的長度。沒有 5 分鐘以上的空白就失敗。
 */
export function restorePending(d: Draft, k: number, now: Date): Result {
  const b = d.pending[k];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  const from = elapsedMinutes(d.date, now);
  const open = blanks(d.blocks)
    .map(([s, e]): [number, number] => [Math.max(s, from), e])
    .filter(([s, e]) => e - s >= STEP_MIN);
  if (!open.length) return { ok: false, error: '時間表上已經沒有空白，請先刪除或縮短其他任務。' };
  const fit = open.find(([s, e]) => e - s >= durOf(b));
  const [s, e] = fit ?? open.reduce((a, g) => (g[1] - g[0] > a[1] - a[0] ? g : a));
  const placed: Block = { ...b, start: fmtTime(s), end: fmtTime(Math.min(s + durOf(b), e)) };
  d.pending.splice(k, 1);
  d.blocks.push(placed);
  const index = sortDraft(d, placed);
  const short = fit ? '' : `，空白不夠長，縮短成 ${durOf(placed)} 分鐘`;
  return {
    ok: true,
    index,
    message: `已把「${nameOf(b)}」排回 ${placed.start} 到 ${placed.end}${short}。按確認後才會儲存。`,
  };
}

/** 從暫待區刪除，今天不做了 */
export function dropPending(d: Draft, k: number): Result {
  const b = d.pending[k];
  if (!b) return { ok: false, error: '找不到這個任務。' };
  d.pending.splice(k, 1);
  return { ok: true, message: `已從暫待區刪除「${nameOf(b)}」，按確認後才會儲存。` };
}

/** 計畫還原成原定時間表，暫待區清空。實際紀錄回到開始調整前的樣子，做過的事不會因為還原而消失 */
export function resetRows(d: Draft, day: number, now: Date): void {
  d.blocks = buildRows(d.date, baseBlocks(day), now);
  d.pending = [];
  d.problems = [];
}

export type ConfirmResult = { problems: Problem[] } | { conflicts: Conflict[] } | { merged: number };

/**
 * 做過的任務在計畫裡的樣子。計畫時間保留原本的，看得出原本排在哪裡；
 * 還在進行的，計畫長度改成做過的加上這一段，預計結束才會落在時間條上拉到的地方。
 * 原本沒有計畫的（插入時就記成有做的），計畫就是第一段開始到最後一段結束。
 */
function recordedPlan(ref: string, segs: DraftRow[], old: Block | undefined, running: boolean): Block {
  const last = segs[segs.length - 1];
  let start: number;
  let end: number;
  if (old) {
    start = toMin(old.start);
    end = running ? Math.min(start + segs.reduce((sum, b) => sum + durOf(b), 0), SLEEP_MIN) : toMin(old.end);
  } else {
    start = toMin(segs[0].start);
    end = toMin(last.end);
  }
  return withLock({ id: ref, start: fmtTime(start), end: fmtTime(Math.max(end, start + STEP_MIN)), label: last.label, type: last.type }, false);
}

/**
 * 儲存調整。欄位有問題或還有衝突就不存，回傳問題或衝突。
 * 沒問題就先把同一件事接在一起或重疊的合併（見 sameItem），再存兩份：
 *   實際紀錄：做過的每一列一段。今天結束在現在之後的是進行中，不寫結束。
 *   計畫：沒做的各列，加上做過的任務的計畫（見 recordedPlan）。
 * 回傳合併掉幾列。
 */
export function confirmDraft(d: Draft, now: Date): ConfirmResult {
  const elapsed = elapsedMinutes(d.date, now);
  const problems = [
    ...dayProblems(d.blocks),
    ...d.blocks.flatMap((b, index): Problem[] =>
      b.rec && toMin(b.start) > elapsed ? [{ index, field: 'time', message: `還沒到 ${b.start}，不能記成有做。` }] : [],
    ),
  ];
  d.problems = problems;
  if (problems.length > 0) return { problems };
  const found = draftConflicts(d);
  if (found.length > 0) return { conflicts: found };

  // 同一件事接在一起或重疊的先合併：做過的合成一段紀錄，中斷、超時的標記照後面那一段
  const recMerge = mergeTouching(d.blocks.filter(b => b.rec), sameItem, (into, from) => (into.rec = from.rec));
  const planMerge = mergeTouching(d.blocks.filter(b => !b.rec), sameItem);
  const rows = sortBlocks([...recMerge.blocks, ...planMerge.blocks]);
  const done = rows.filter(b => b.rec);
  const entries = done.map((b): Entry => {
    const r = b.rec!;
    const running = isRunningRow(d.date, b, now);
    const e: Entry = { ref: r.ref, label: b.label, type: b.type, start: b.start };
    if (!running) e.end = b.end;
    if (r.cut && !running) e.cut = true;
    if (r.float) e.float = true;
    if (r.long) e.long = true;
    return e;
  });

  const oldPlan = blocksFor(d.date, parseKey(d.date).getDay());
  const refs = [...new Set(done.filter(b => !b.rec!.float).map(b => b.rec!.ref))];
  const recPlans = refs.map(ref => {
    const segs = done.filter(b => b.rec!.ref === ref);
    return recordedPlan(ref, segs, oldPlan.find(b => b.id === ref), segs.some(b => isRunningRow(d.date, b, now)));
  });
  const plan = rows.filter(b => !b.rec).map(({ rec: _, ...b }) => b);

  replaceLog(d.date, entries);
  applyDay(d.date, [...plan, ...recPlans], d.pending);
  return { merged: recMerge.merged + planMerge.merged };
}
