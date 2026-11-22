import { DAY_NAMES, DEFAULT_TEMPLATE } from './config/schedule';
import { parseTimeInput } from './lib/blocks';
import { saveSettings, settings } from './lib/store';
import { addStage, moveStage, stageUsers } from './lib/stages';
import {
  addRow, commitTemplateDraft, isTemplateDirty, moveTemplateRow, removeRow, replaceRows, resizeTemplateRow, setRow, sortRows, spanOf, stripRows, type ActRow,
} from './lib/template-draft';
import { fmtTime } from './lib/time';
import { currentRoute, state } from './state';
import { currentTemplateDraft } from './views/settings';

// 設定頁的事件：選星期、改欄位、新增、刪除、還原、儲存、複製。main.ts 只負責呼叫 initSettingsPage。
// 所有改動先進草稿（state.tdraft），按儲存才寫進設定檔。

interface PageTools {
  render: () => void;
  setMessage: (id: string, text: string, isError?: boolean) => void;
  focusStill: (el: HTMLElement) => void;
}

const dayName = (day: number) => `週${DAY_NAMES[day]}`;

/** 有沒儲存的變更時先問；回傳 false 表示使用者想留下來。離開後草稿丟掉 */
export function leaveTemplateDraft(): boolean {
  const d = state.tdraft;
  if (d && isTemplateDirty(d) && !confirm(`${dayName(d.day)}的範本還沒儲存，離開會放棄這些變更。要離開嗎？`)) return false;
  state.tdraft = null;
  return true;
}

export const hasTemplateChanges = (): boolean => !!state.tdraft && isTemplateDirty(state.tdraft);

export function initSettingsPage(main: HTMLElement, { render, setMessage, focusStill }: PageTools): void {
  const focusId = (id: string) => {
    const el = main.querySelector<HTMLElement>(`#${id}`);
    if (el) focusStill(el);
    return !!el;
  };

  main.addEventListener('click', e => {
    if (currentRoute() !== 'settings') return;
    const t = e.target as HTMLElement;
    const dayBtn = t.closest<HTMLElement>('[data-set-day]');
    const act = t.closest<HTMLElement>('[data-set-act]');
    const stageAct = t.closest<HTMLElement>('[data-stage-act]');
    const seg = t.closest<HTMLElement>('.set-strip [data-seg]');
    if (seg) {
      const at = rowAt(Number(seg.dataset.seg));
      return at === undefined ? undefined : gotoRow(at);
    }
    if (stageAct) return handleStage(stageAct.dataset.stageAct!, Number(stageAct.dataset.k));
    if (dayBtn) {
      const day = Number(dayBtn.dataset.setDay);
      if (day === state.setDay || !leaveTemplateDraft()) return;
      state.setDay = day;
      state.copyFrom = null;
      render();
      focusId('set-day-title') || focusStill(dayBtn);
      return;
    }
    if (!act) return;
    const d = currentTemplateDraft();
    const i = Number(act.dataset.i);
    switch (act.dataset.setAct) {
      case 'add': {
        const at = addRow(d);
        render();
        setMessage('set-msg', `已新增活動 ${at + 1}，填好後按儲存。`);
        focusId(`s${at}-label`);
        break;
      }
      case 'delete': {
        const row = removeRow(d, i);
        render();
        setMessage('set-msg', `已刪除「${row?.label || `活動 ${i + 1}`}」，按儲存後才會生效。`);
        // 同一個位置換成下一個活動；刪的是最後一個就放在新增鈕
        focusId(`s${i}-label`) || focusId(`s${i - 1}-label`) || focusStill(main.querySelector<HTMLElement>('[data-set-act="add"]')!);
        break;
      }
      case 'default':
        replaceRows(d, DEFAULT_TEMPLATE[d.day]);
        render();
        setMessage('set-msg', `已換成${dayName(d.day)}的預設活動，按儲存後才會生效。`);
        break;
      case 'revert':
        if (!isTemplateDirty(d)) {
          setMessage('set-msg', '沒有要取消的變更。');
          break;
        }
        if (!confirm('要放棄還沒儲存的變更嗎？')) return;
        state.tdraft = null;
        render();
        setMessage('set-msg', '已取消變更，回到儲存過的樣子。');
        break;
      case 'save': {
        const acts = commitTemplateDraft(d, settings.stages.map(s => s.id));
        render();
        if (!acts) {
          const rows = new Set(d.problems.map(p => p.index)).size;
          setMessage('set-error', `有 ${rows} 個活動需要修正，原因已標在欄位下面。`, true);
          const p = d.problems[0];
          focusId(`s${p.index}-${p.field}`);
          return;
        }
        settings.template[d.day] = acts;
        saveSettings();
        setMessage('set-msg', `已儲存${dayName(d.day)}的範本。`);
        break;
      }
      case 'copy': {
        const from = state.copyFrom ?? d.day;
        const days = state.copyTo.filter(day => day !== from);
        if (from === d.day && isTemplateDirty(d)) {
          setMessage('copy-msg', `${dayName(d.day)}還有沒儲存的變更，請先按儲存或取消變更。`, true);
          return;
        }
        if (!days.length) {
          setMessage('copy-msg', '請先勾選要複製到哪幾天。', true);
          return;
        }
        const names = days.map(dayName).join('、');
        // 複製到正在編輯的那一天：草稿換成複製過來的內容，沒儲存的變更會不見
        const overwriteDraft = days.includes(d.day) && isTemplateDirty(d) ? `${dayName(d.day)}還沒儲存的變更也會不見。` : '';
        if (!confirm(`${names}原本的活動會換成${dayName(from)}的活動。${overwriteDraft}確定要複製嗎？`)) return;
        for (const day of days) settings.template[day] = settings.template[from].map(a => ({ ...a }));
        saveSettings();
        if (days.includes(d.day)) state.tdraft = null;
        state.copyTo = [];
        render();
        setMessage('copy-msg', `已把${dayName(from)}複製到${names}。`);
        focusId('copy-from');
        break;
      }
    }
  });

  // 欄位輸入：改草稿並重畫，開始時間或種類改完再照時間重排（見 resort）
  const onField = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const field = t.dataset.sf as keyof Omit<ActRow, 'id'> | undefined;
    if (!field || currentRoute() !== 'settings' || !state.tdraft) return;
    const i = Number(t.dataset.i);
    setRow(state.tdraft, i, field, t.value);
    // 改成浮動事項時先選最後一個階段（整天都會列出），之後可以再改
    const row = state.tdraft.rows[i];
    if (field === 'mode' && row?.mode === 'float' && !row.stage) row.stage = settings.stages.at(-1)?.id ?? '';
    // 開始時間改完統一寫成 10:30 的樣子（打 1030 也可以）
    if (e.type === 'change' && field === 'start' && row) row.start = parseTimeInput(row.start) ?? row.start;
    // 輸入時就重畫：時間條、卡片標題與重疊跟著變。欄位用 live() 綁定，打字不會被打斷
    render();
    // 開始時間或種類改完（離開欄位）才照時間重排，等焦點移到下一個欄位後再排，焦點跟著原本那一列走
    if (e.type === 'change' && (field === 'start' || field === 'mode') && row) {
      setTimeout(() => resort(row.id), 0);
    }
  };

  afterEdit = (id: string) => {
    const d = state.tdraft;
    if (!d) return;
    sortRows(d);
    render();
    const seg = document.getElementById(`seg-${id}`);
    if (seg) focusStill(seg);
  };

  /** 跳到清單裡第 i 列的名稱欄（從時間條點過來），捲動有動畫 */
  function gotoRow(i: number) {
    const el = main.querySelector<HTMLElement>(`#s${i}-label`);
    if (!el) return;
    el.closest('.act-row')?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
    el.focus({ preventScroll: true });
  }

  // 時間條的鍵盤操作：和調整時間表一樣，左右鍵 5 分鐘、Page Up／Page Down 30 分鐘、Shift 加左右鍵改長度；Enter 跳到那一列
  const KEY_STEP: Record<string, number> = { ArrowLeft: -5, ArrowRight: 5, PageUp: -30, PageDown: 30 };
  main.addEventListener('keydown', e => {
    const t = e.target as HTMLElement;
    if (currentRoute() !== 'settings' || !t.matches('.set-strip [data-seg]') || !state.tdraft) return;
    const i = rowAt(Number(t.dataset.seg));
    if (i === undefined) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      return gotoRow(i);
    }
    const step = KEY_STEP[e.key];
    const sp = state.tdraft.rows[i] && spanOf(state.tdraft.rows[i]);
    if (step === undefined || !sp) return;
    e.preventDefault();
    const resize = e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    if (resize) resizeTemplateRow(state.tdraft, i, sp.end + step);
    else moveTemplateRow(state.tdraft, i, sp.start + step, stripLo());
    afterStripEdit(state.tdraft.rows[i].id);
  });

  /** 照時間重排清單；moved 是剛改時間的那一列，它換了位置就播報 */
  function resort(moved: string) {
    const d = state.tdraft;
    if (!d || currentRoute() !== 'settings') return;
    const active = document.activeElement as HTMLElement | null;
    const inRow = active?.dataset.i !== undefined && active.closest('.act-row');
    const keepId = inRow ? d.rows[Number(active!.dataset.i)]?.id : undefined;
    const keepField = active?.dataset.sf;
    const keepAct = active?.dataset.setAct;
    if (!sortRows(d)) return;
    render();
    const at = d.rows.findIndex(r => r.id === moved);
    if (at >= 0) setMessage('set-msg', `清單已照時間重排，「${d.rows[at].label.trim() || '未命名'}」現在是第 ${at + 1} 個。`);
    if (keepId) {
      const k = d.rows.findIndex(r => r.id === keepId);
      const btn = keepAct && main.querySelector<HTMLElement>(`[data-set-act="${keepAct}"][data-i="${k}"]`);
      if (btn) focusStill(btn);
      else focusId(keepField ? `s${k}-${keepField}` : `s${k}-label`);
    }
  }
  main.addEventListener('input', onField);

  // 複製的來源與勾選記在 state，重畫時才留得住（來源換了，勾選框要跟著停用來源那天）
  main.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (currentRoute() !== 'settings') return;
    if (t.id === 'copy-from') {
      state.copyFrom = Number(t.value);
      render();
      focusId('copy-from');
    } else if (t.dataset.copyDay !== undefined) {
      const day = Number(t.dataset.copyDay);
      state.copyTo = t.checked ? [...state.copyTo, day] : state.copyTo.filter(x => x !== day);
    }
  });
  main.addEventListener('change', onField);

  /** 先後階段的新增與刪除，改了直接儲存 */
  function handleStage(act: string, k: number) {
    const stages = settings.stages;
    if (act === 'add') {
      const s = addStage(stages);
      saveSettings();
      render();
      setMessage('stage-msg', `已新增第 ${stages.length} 階段「${s.label}」，可以直接改名稱。`);
      focusId(`st-${s.id}-label`);
    } else if (act === 'delete') {
      const s = stages[k];
      if (!s) return;
      if (stages.length === 1) return setMessage('stage-msg', '至少要留一個階段。', true);
      // 已儲存的範本與設定頁還沒儲存的那一天都要看
      const d = state.tdraft;
      const users = [...new Set([
        ...stageUsers(s.id, settings.template),
        ...(d ? stageUsers(s.id, settings.template, { day: d.day, acts: d.rows }) : []),
      ])];
      if (users.length) {
        return setMessage('stage-msg', `「${s.label}」還有 ${users.join('、')} 在用，先把它們改到別的階段再刪除。`, true);
      }
      stages.splice(k, 1);
      saveSettings();
      render();
      setMessage('stage-msg', `已刪除階段「${s.label}」。`);
      const next = stages[Math.min(k, stages.length - 1)];
      focusId(`st-${next.id}-label`);
    }
  }

  // 階段的名稱與順序：名稱打完離開欄位才存（空白就退回原本的名稱），順序選了就移動並存檔
  main.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (currentRoute() !== 'settings') return;
    const stages = settings.stages;
    if (t.dataset.stageLabel !== undefined) {
      const s = stages[Number(t.dataset.stageLabel)];
      if (!s) return;
      const label = t.value.trim();
      if (!label) {
        t.value = s.label;
        return setMessage('stage-msg', '階段名稱不能空白，已退回原本的名稱。', true);
      }
      s.label = label;
      saveSettings();
      render();
      setMessage('stage-msg', `已改名為「${label}」。`);
    } else if (t.dataset.stageOrder !== undefined) {
      const from = Number(t.dataset.stageOrder);
      const s = stages[from];
      if (!s) return;
      moveStage(stages, from, Number(t.value));
      saveSettings();
      render();
      setMessage('stage-msg', `「${s.label}」移到第 ${stages.indexOf(s) + 1} 階段。`);
      focusId(`st-${s.id}-order`);
    }
  });
}

/** 捲動要不要動畫：使用者要求減少動態時直接跳過去 */
const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** 時間條上第 k 塊對應清單上的第幾列（見 template-draft.ts 的 stripRows） */
const rowAt = (k: number): number | undefined => (state.tdraft ? stripRows(state.tdraft.rows)[k]?.index : undefined);

/** 設定頁時間條的左端（分鐘），拖動時最早只能到這裡 */
const stripLo = (): number => Number(document.querySelector<HTMLElement>('.set-strip .strip-track')?.dataset.lo ?? 0);

let afterEdit: (id: string) => void = () => {};

/**
 * 時間條改完（放開或按鍵）：照時間重排，焦點留在同一個活動的那一塊。
 * initSettingsPage 設定實際的做法，因為要用到重畫與聚焦
 */
const afterStripEdit = (id: string) => afterEdit(id);

/**
 * 給 main.ts 的時間條拖動用：設定頁的時間條拖動時改範本草稿。k 是時間條上第幾塊（順序不隨清單變）。
 * 每移一格就照時間重排清單，下面的表格跟著變；被拖的那一塊在時間條上的位置編號不變，拖動不會中斷
 */
export const settingsStrip = {
  times(k: number): [string, string] | undefined {
    const i = rowAt(k);
    const r = i === undefined ? undefined : state.tdraft?.rows[i];
    const sp = r && spanOf(r);
    return sp ? [fmtTime(sp.start), fmtTime(Math.min(sp.end, 24 * 60 - 1))] : undefined;
  },
  move(k: number, start: number): void {
    const i = rowAt(k);
    if (!state.tdraft || i === undefined) return;
    moveTemplateRow(state.tdraft, i, start, stripLo());
    sortRows(state.tdraft);
  },
  resize(k: number, end: number): void {
    const i = rowAt(k);
    if (state.tdraft && i !== undefined) resizeTemplateRow(state.tdraft, i, end);
  },
  /** 放開：重排後焦點跟著被拖的那一塊 */
  end(k: number): void {
    const i = rowAt(k);
    const id = i === undefined ? undefined : state.tdraft?.rows[i]?.id;
    if (id) afterStripEdit(id);
  },
};
