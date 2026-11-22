import { DAY_NAMES, DEFAULT_TEMPLATE } from './config/schedule';
import { applySleepTime, parseTimeInput } from './lib/blocks';
import {
  addDraftStage, checkSettingsDraft, commitSettingsDraft, dayDraft, draftSleep, isSettingsDirty, moveDraftStage, pushUndo,
  reassignStage, stageUsers, undo,
} from './lib/settings-draft';
import { saveSettings, settings } from './lib/store';
import {
  addRow, copyRowsFrom, moveTemplateRow, removeRow, replaceRows, resizeTemplateRow, setRow, sortRows, spanOf, stripRows, type ActRow,
} from './lib/template-draft';
import { fmtTime } from './lib/time';
import { currentRoute, state } from './state';
import { currentSettingsDraft, currentTemplateDraft, stripFrom } from './views/settings';

// 設定頁的事件：選星期、改欄位、新增、刪除、還原、複製、先後階段、儲存與復原。main.ts 只負責呼叫 initSettingsPage。
// 所有改動先進整份設定的草稿（state.sdraft），按一次儲存全部寫進設定檔。每一步改動前記一份快照，可以復原。
// 訊息都寫在貼在視窗底部的儲存列（#set-msg、#set-error），捲到哪裡都看得到。

interface PageTools {
  render: () => void;
  setMessage: (id: string, text: string, isError?: boolean) => void;
  focusStill: (el: HTMLElement) => void;
}

const dayName = (day: number) => `週${DAY_NAMES[day]}`;
const nameOf = (r: Pick<ActRow, 'label'> | undefined) => r?.label.trim() || '未命名';

/** 有沒儲存的變更時先問；回傳 false 表示使用者想留下來。離開後草稿丟掉 */
export function leaveTemplateDraft(): boolean {
  const sd = state.sdraft;
  if (sd && isSettingsDirty(sd) && !confirm('設定還沒儲存，離開會放棄這些變更。要離開嗎？')) return false;
  state.sdraft = null;
  return true;
}

export const hasTemplateChanges = (): boolean => !!state.sdraft && isSettingsDirty(state.sdraft);

/** 改動前呼叫：記下現在的樣子，之後可以復原 */
const remember = () => pushUndo(currentSettingsDraft());

export function initSettingsPage(main: HTMLElement, { render, setMessage, focusStill }: PageTools): void {
  const focusId = (id: string) => {
    const el = document.getElementById(id);
    if (el && main.contains(el)) focusStill(el);
    return !!el;
  };
  const say = (text: string) => setMessage('set-msg', text);
  const fail = (text: string) => setMessage('set-error', text, true);

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
      // 換星期不會丟掉改到一半的內容，所以不用問
      const day = Number(dayBtn.dataset.setDay);
      if (day === state.setDay) return;
      state.setDay = day;
      state.copyFrom = null;
      render();
      focusStill(dayBtn);
      return;
    }
    if (act) handleAct(act.dataset.setAct!, Number(act.dataset.i));
  });

  function handleAct(act: string, i: number) {
    const sd = currentSettingsDraft();
    const d = currentTemplateDraft();
    switch (act) {
      case 'add': {
        remember();
        const at = addRow(d, stripFrom(d), draftSleep(sd));
        const row = d.rows[at];
        render();
        say(row.start
          ? `已在 ${row.start} 新增一個 ${row.minutes} 分鐘的任務，可以在時間條上拖到想要的時間。請填名稱並選類型。`
          : '已新增一個任務，這一天沒有空白了，請自己填開始時間。請填名稱並選類型。');
        focusId(`s${at}-label`);
        break;
      }
      case 'delete': {
        remember();
        const row = removeRow(d, i);
        render();
        say(`已刪除「${nameOf(row)}」，按儲存後才會生效，按「復原上一步」可以救回來。`);
        // 同一個位置換成下一個活動；刪的是最後一個就放在新增鈕
        focusId(`s${i}-label`) || focusId(`s${i - 1}-label`) || focusStill(main.querySelector<HTMLElement>('[data-set-act="add"]')!);
        break;
      }
      case 'default':
        remember();
        replaceRows(d, DEFAULT_TEMPLATE[d.day]);
        render();
        say(`已把${dayName(d.day)}換成預設的活動，按儲存後才會生效。`);
        break;
      case 'undo': {
        if (!undo(sd)) {
          say('沒有可以復原的步驟。');
          break;
        }
        render();
        say('已復原上一步。');
        // 沒有更早的步驟時復原鈕會停用，焦點改放到儲存
        const btn = main.querySelector<HTMLButtonElement>('[data-set-act="undo"]');
        focusStill(btn && !btn.disabled ? btn : main.querySelector<HTMLElement>('[data-set-act="save"]')!);
        break;
      }
      case 'revert':
        if (!isSettingsDirty(sd)) {
          say('沒有要取消的變更。');
          break;
        }
        if (!confirm('要放棄所有還沒儲存的變更嗎？')) return;
        state.sdraft = null;
        render();
        say('已取消所有變更，回到儲存過的樣子。');
        break;
      case 'save':
        save();
        break;
      case 'copy': {
        const from = state.copyFrom ?? d.day;
        const days = state.copyTo.filter(day => day !== from);
        if (!days.length) return fail('請先勾選要複製到哪幾天。');
        const names = days.map(dayName).join('、');
        if (!confirm(`${names}原本的活動會換成${dayName(from)}的活動（按儲存後才生效）。確定要複製嗎？`)) return;
        remember();
        const src = dayDraft(sd, from, settings.template);
        for (const day of days) copyRowsFrom(dayDraft(sd, day, settings.template), src);
        state.copyTo = [];
        render();
        say(`已把${dayName(from)}複製到${names}，按儲存後才會生效。`);
        focusId('copy-from');
        break;
      }
    }
  }

  /** 儲存：檢查所有改過的日子，有問題就換到那一天並把焦點放到要修的欄位 */
  function save() {
    const sd = currentSettingsDraft();
    if (!isSettingsDirty(sd)) return say('沒有要儲存的變更。');
    const bad = checkSettingsDraft(sd, settings.template);
    if (bad && 'sleep' in bad) {
      fail(bad.sleep);
      focusId('set-sleep');
      return;
    }
    if (bad) {
      state.setDay = bad.day;
      render();
      const d = currentTemplateDraft();
      const rows = new Set(d.problems.map(p => p.index)).size;
      fail(`${dayName(bad.day)}有 ${rows} 個活動需要修正，原因已標在欄位下面。`);
      const p = d.problems[0];
      focusId(`s${p.index}-${p.field}`);
      return;
    }
    const { days, stages, sleep } = commitSettingsDraft(sd);
    for (const [day, acts] of Object.entries(days)) settings.template[Number(day)] = acts;
    settings.stages = stages;
    settings.sleep = sleep;
    applySleepTime(sleep);
    saveSettings();
    render();
    say('已儲存設定。');
  }

  // 就寢時間：打字時只記文字，離開欄位才統一寫成 23:30 的樣子並重畫（時間條的右端跟著變）
  const onSleep = (e: Event) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== 'set-sleep' || currentRoute() !== 'settings') return;
    const sd = currentSettingsDraft();
    sd.sleep = e.type === 'change' ? (parseTimeInput(t.value) ?? t.value) : t.value;
    if (e.type === 'change') render();
  };
  main.addEventListener('input', onSleep);
  main.addEventListener('change', onSleep);

  // 欄位輸入：改草稿並重畫，開始時間或種類改完再照時間重排（見 resort）
  const onField = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const field = t.dataset.sf as keyof Omit<ActRow, 'id'> | undefined;
    if (!field || currentRoute() !== 'settings' || !state.sdraft) return;
    const d = currentTemplateDraft();
    const i = Number(t.dataset.i);
    setRow(d, i, field, t.value);
    // 改成浮動事項時先選最後一個階段（整天都會列出），之後可以再改
    const row = d.rows[i];
    if (field === 'mode' && row?.mode === 'float' && !row.stage) row.stage = state.sdraft.stages.at(-1)?.id ?? '';
    // 開始時間改完統一寫成 10:30 的樣子（打 1030 也可以）
    if (e.type === 'change' && field === 'start' && row) row.start = parseTimeInput(row.start) ?? row.start;
    // 輸入時就重畫：時間條、卡片標題與重疊跟著變。欄位用 live() 綁定，打字不會被打斷
    render();
    // 開始時間或種類改完（離開欄位）才照時間重排，等焦點移到下一個欄位後再排，焦點跟著原本那一列走
    if (e.type === 'change' && (field === 'start' || field === 'mode') && row) {
      setTimeout(() => resort(row.id), 0);
    }
  };
  main.addEventListener('input', onField);
  main.addEventListener('change', onField);

  // 開始改一個欄位前記一份快照：一個欄位從進去到離開算一步復原
  main.addEventListener('focusin', e => {
    const t = e.target as HTMLElement;
    if (currentRoute() !== 'settings') return;
    if (t.dataset.sf !== undefined || t.dataset.stageLabel !== undefined || t.dataset.stageOrder !== undefined || t.id === 'set-sleep') remember();
  });

  afterEdit = (id: string) => {
    const d = currentTemplateDraft();
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
    if (currentRoute() !== 'settings' || !t.matches('.set-strip [data-seg]') || !state.sdraft) return;
    const i = rowAt(Number(t.dataset.seg));
    if (i === undefined) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      return gotoRow(i);
    }
    const d = currentTemplateDraft();
    const step = KEY_STEP[e.key];
    const sp = d.rows[i] && spanOf(d.rows[i]);
    if (step === undefined || !sp) return;
    e.preventDefault();
    remember();
    const resize = e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
    const sleep = draftSleep(currentSettingsDraft());
    if (resize) resizeTemplateRow(d, i, sp.end + step, sleep);
    else moveTemplateRow(d, i, sp.start + step, stripLo(), sleep);
    afterStripEdit(d.rows[i].id);
  });

  /** 照時間重排清單；moved 是剛改時間的那一列，它換了位置就播報 */
  function resort(moved: string) {
    if (!state.sdraft || currentRoute() !== 'settings') return;
    const d = currentTemplateDraft();
    const active = document.activeElement as HTMLElement | null;
    const inRow = active?.dataset.i !== undefined && active.closest('.act-row');
    const keepId = inRow ? d.rows[Number(active!.dataset.i)]?.id : undefined;
    const keepField = active?.dataset.sf;
    const keepAct = active?.dataset.setAct;
    if (!sortRows(d)) return;
    render();
    const at = d.rows.findIndex(r => r.id === moved);
    if (at >= 0) say(`清單已照時間重排，「${nameOf(d.rows[at])}」現在是第 ${at + 1} 個。`);
    if (keepId) {
      const k = d.rows.findIndex(r => r.id === keepId);
      const btn = keepAct && main.querySelector<HTMLElement>(`[data-set-act="${keepAct}"][data-i="${k}"]`);
      if (btn) focusStill(btn);
      else focusId(keepField ? `s${k}-${keepField}` : `s${k}-label`);
    }
  }

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

  /** 先後階段的新增與刪除。和活動一樣先進草稿，按儲存才生效 */
  function handleStage(act: string, k: number) {
    const sd = currentSettingsDraft();
    const stages = sd.stages;
    if (act === 'add') {
      remember();
      const s = addDraftStage(sd);
      render();
      say(`已新增第 ${stages.length} 階段「${s.label}」，可以直接改名稱。`);
      focusId(`st-${s.id}-label`);
    } else if (act === 'delete') {
      const s = stages[k];
      if (!s) return;
      if (stages.length === 1) return fail('至少要留一個階段。');
      const users = stageUsers(sd, settings.template, s.id);
      // 還有活動在用：改到前一個階段（刪的是第一個就改到下一個），問過再做
      const to = stages[k - 1] ?? stages[k + 1];
      if (users.length && !confirm(`「${s.label}」還有 ${users.join('、')} 在用。要把它們改到「${to.label}」，再刪除這個階段嗎？`)) return;
      remember();
      if (users.length) reassignStage(sd, settings.template, s.id, to.id);
      stages.splice(k, 1);
      render();
      say(`已刪除階段「${s.label}」${users.length ? `，原本用它的 ${users.length} 個活動改到「${to.label}」` : ''}。按儲存後才會生效。`);
      const next = stages[Math.min(k, stages.length - 1)];
      focusId(`st-${next.id}-label`);
    }
  }

  // 階段的名稱與順序：名稱打完離開欄位才改（空白就退回原本的名稱），順序選了就移動
  main.addEventListener('change', e => {
    const t = e.target as HTMLInputElement;
    if (currentRoute() !== 'settings' || !state.sdraft) return;
    const stages = state.sdraft.stages;
    if (t.dataset.stageLabel !== undefined) {
      const s = stages[Number(t.dataset.stageLabel)];
      if (!s) return;
      const label = t.value.trim();
      if (!label) {
        t.value = s.label;
        return fail('階段名稱不能空白，已退回原本的名稱。');
      }
      s.label = label;
      render();
    } else if (t.dataset.stageOrder !== undefined) {
      const from = Number(t.dataset.stageOrder);
      const s = stages[from];
      if (!s) return;
      moveDraftStage(state.sdraft, from, Number(t.value));
      render();
      say(`「${s.label}」移到第 ${stages.indexOf(s) + 1} 階段。`);
      focusId(`st-${s.id}-order`);
    }
  });
}

/** 捲動要不要動畫：使用者要求減少動態時直接跳過去 */
const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/** 時間條上第 k 塊對應清單上的第幾列（見 template-draft.ts 的 stripRows） */
const rowAt = (k: number): number | undefined => (state.sdraft ? stripRows(currentTemplateDraft().rows)[k]?.index : undefined);

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
 * 每移一格就照時間重排清單，下面的表格跟著變；被拖的那一塊在時間條上的位置編號不變，拖動不會中斷。
 * 按下去（times 被呼叫）時記一份快照，整次拖動算一步復原
 */
export const settingsStrip = {
  times(k: number): [string, string] | undefined {
    const i = rowAt(k);
    const r = i === undefined ? undefined : currentTemplateDraft().rows[i];
    const sp = r && spanOf(r);
    if (sp) remember();
    return sp ? [fmtTime(sp.start), fmtTime(Math.min(sp.end, 24 * 60 - 1))] : undefined;
  },
  move(k: number, start: number): void {
    const i = rowAt(k);
    if (i === undefined) return;
    const d = currentTemplateDraft();
    moveTemplateRow(d, i, start, stripLo(), draftSleep(currentSettingsDraft()));
    sortRows(d);
  },
  resize(k: number, end: number): void {
    const i = rowAt(k);
    if (i !== undefined) resizeTemplateRow(currentTemplateDraft(), i, end, draftSleep(currentSettingsDraft()));
  },
  /** 放開：重排後焦點跟著被拖的那一塊 */
  end(k: number): void {
    const i = rowAt(k);
    const id = i === undefined ? undefined : currentTemplateDraft().rows[i]?.id;
    if (id) afterStripEdit(id);
  },
};
