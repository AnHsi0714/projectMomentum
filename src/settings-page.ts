import { DAY_NAMES, DEFAULT_TEMPLATE } from './config/schedule';
import { saveSettings, settings } from './lib/store';
import { addStage, moveStage, stageUsers } from './lib/stages';
import { addRow, commitTemplateDraft, isTemplateDirty, removeRow, replaceRows, setRow, type ActRow } from './lib/template-draft';
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

/** 改了就要重畫的欄位：種類決定有沒有先後階段、開始欄位的名稱 */
const RERENDER: ReadonlySet<string> = new Set(['mode']);

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
    if (stageAct) return handleStage(stageAct.dataset.stageAct!, Number(stageAct.dataset.k));
    if (dayBtn) {
      const day = Number(dayBtn.dataset.setDay);
      if (day === state.setDay || !leaveTemplateDraft()) return;
      state.setDay = day;
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
        if (isTemplateDirty(d)) {
          setMessage('copy-msg', `${dayName(d.day)}還有沒儲存的變更，請先按儲存或取消變更。`, true);
          return;
        }
        const days = [...main.querySelectorAll<HTMLInputElement>('[data-copy-day]:checked')].map(c => Number(c.dataset.copyDay));
        if (!days.length) {
          setMessage('copy-msg', '請先勾選要複製到哪幾天。', true);
          return;
        }
        const names = days.map(dayName).join('、');
        if (!confirm(`${names}原本的活動會換成${dayName(d.day)}的活動，確定要複製嗎？`)) return;
        for (const day of days) settings.template[day] = settings.template[d.day].map(a => ({ ...a }));
        saveSettings();
        main.querySelectorAll<HTMLInputElement>('[data-copy-day]').forEach(c => (c.checked = false));
        setMessage('copy-msg', `已複製到${names}。`);
        break;
      }
    }
  });

  // 欄位輸入只改草稿不重畫，打字不會被打斷；種類改了才重畫（先後階段、開始欄位的名稱會變）
  const onField = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const field = t.dataset.sf as keyof Omit<ActRow, 'id'> | undefined;
    if (!field || currentRoute() !== 'settings' || !state.tdraft) return;
    const i = Number(t.dataset.i);
    setRow(state.tdraft, i, field, t.value);
    // 改成浮動事項時先選最後一個階段（整天都會列出），之後可以再改
    const row = state.tdraft.rows[i];
    if (field === 'mode' && row?.mode === 'float' && !row.stage) row.stage = settings.stages.at(-1)?.id ?? '';
    if (e.type === 'change' && RERENDER.has(field)) {
      render();
      focusId(t.id);
    }
  };
  main.addEventListener('input', onField);
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
