// 時間表的拖曳排序。用指標事件實作，滑鼠、觸控、手寫筆都能用（原生的 HTML 拖放在手機上不會動）。
// 把手本身是按鈕，鍵盤與閱讀器的使用者把焦點移到把手上按上下鍵移動，不需要拖曳。
// 拖曳過程只標示放開後會落在哪裡，不改畫面內容，放開才通知外面重排，所以過程中不會重畫。

interface Drag {
  from: number;
  over: number;
  pointerId: number;
  handle: HTMLElement;
  row: HTMLElement;
  y: number;
  raf: number;
}

let drag: Drag | null = null;

/** 拖曳進行中。這時外面不要重畫整頁，否則拖曳的列會消失 */
export const isDragging = (): boolean => drag !== null;

/** 靠近視窗上下緣多少像素內開始自動捲動 */
const EDGE = 64;

export function initDrag(root: HTMLElement, onDrop: (from: number, to: number) => void): void {
  const rows = () => [...root.querySelectorAll<HTMLElement>('#timeline > li[data-i]')];

  /** 離指標最近的可拖曳列。指標在列裡面距離是 0，在列與列之間就取邊緣最近的 */
  function targetAt(y: number, from: number): number {
    let best = from;
    let bestDist = Infinity;
    for (const r of rows()) {
      const box = r.getBoundingClientRect();
      const dist = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0;
      if (dist < bestDist) {
        bestDist = dist;
        best = Number(r.dataset.i);
      }
    }
    return best;
  }

  /** 標示放開後會落在哪：往下拖落在目標之後，往上拖落在目標之前 */
  function mark(d: Drag) {
    for (const r of rows()) r.classList.remove('is-drop-before', 'is-drop-after');
    if (d.over === d.from) return;
    const target = rows().find(r => Number(r.dataset.i) === d.over);
    target?.classList.add(d.over > d.from ? 'is-drop-after' : 'is-drop-before');
  }

  function update(d: Drag) {
    d.over = targetAt(d.y, d.from);
    mark(d);
  }

  /** 拖到視窗邊緣時自動捲動，長清單才拖得到看不見的位置 */
  function autoScroll() {
    const d = drag;
    if (!d) return;
    const bottom = window.innerHeight - EDGE;
    const dy = d.y < EDGE ? -Math.ceil((EDGE - d.y) / 4) : d.y > bottom ? Math.ceil((d.y - bottom) / 4) : 0;
    if (dy !== 0) {
      window.scrollBy(0, dy);
      update(d);
    }
    d.raf = requestAnimationFrame(autoScroll);
  }

  function finish(commit: boolean) {
    const d = drag;
    if (!d) return;
    drag = null;
    cancelAnimationFrame(d.raf);
    d.row.classList.remove('is-dragging');
    for (const r of rows()) r.classList.remove('is-drop-before', 'is-drop-after');
    document.body.classList.remove('is-dragging');
    if (d.handle.hasPointerCapture(d.pointerId)) d.handle.releasePointerCapture(d.pointerId);
    if (commit && d.over !== d.from) onDrop(d.from, d.over);
  }

  root.addEventListener('pointerdown', e => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    const row = handle?.closest<HTMLElement>('li[data-i]');
    if (!handle || !row) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    drag = { from: Number(row.dataset.i), over: Number(row.dataset.i), pointerId: e.pointerId, handle, row, y: e.clientY, raf: 0 };
    row.classList.add('is-dragging');
    document.body.classList.add('is-dragging');
    drag.raf = requestAnimationFrame(autoScroll);
  });

  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.y = e.clientY;
    update(drag);
  });

  root.addEventListener('pointerup', e => {
    if (drag && e.pointerId === drag.pointerId) finish(true);
  });

  root.addEventListener('pointercancel', e => {
    if (drag && e.pointerId === drag.pointerId) finish(false);
  });

  // Esc 取消這一次拖曳，列維持原位
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) finish(false);
  });
}
