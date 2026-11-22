import { pxPerMinute } from './components/day-strip';
import { STEP_MIN } from './lib/blocks';
import { toMin } from './lib/time';

// 時間條的拖動：按住任務左右拖是整塊移動，按住右邊緣是改長度。滑鼠、觸控、手寫筆都用指標事件。
// 每移動一格（5 分鐘）就通知外面改草稿並重畫；lit-html 重畫時沿用同一個元素，所以拖曳不會中斷。
// 放開時通知外面（onEnd，附上拖的是第幾個），這時才依時間重排、播報衝突，拖動途中任務的位置編號不會變。
// 鍵盤操作不在這裡，由 main.ts 的 keydown 處理。

interface StripDrag {
  index: number;
  resize: boolean;
  pointerId: number;
  el: HTMLElement;
  x: number;
  start: number;
  end: number;
  ppm: number;
  last: number;
  /** 拖動過（不只是點一下）。放開後的 click 要擋掉，免得被當成點擊 */
  moved: boolean;
}

let drag: StripDrag | null = null;

/** 拖曳進行中。這時外面的定時重畫要先停，否則換算會錯 */
export const isStripDragging = (): boolean => drag !== null;

export function initStripDrag(
  root: HTMLElement,
  times: (index: number) => [string, string] | undefined,
  onMove: (index: number, start: number) => void,
  onResize: (index: number, end: number) => void,
  onEnd: (index: number) => void,
): void {
  root.addEventListener('pointerdown', e => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-seg]');
    const track = el?.closest<HTMLElement>('.strip-track');
    if (!el || !track) return;
    const index = Number(el.dataset.seg);
    const t = times(index);
    if (!t) return;
    e.preventDefault();
    // 抓住指標，拖到時間條外面也繼續算；抓不到（例如指標已經放開）就照樣拖，放開時一樣會結束
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 沒抓到也能拖 */
    }
    drag = {
      index,
      resize: !!(e.target as HTMLElement).closest('[data-grip]'),
      pointerId: e.pointerId,
      el,
      x: e.clientX,
      start: toMin(t[0]),
      end: toMin(t[1]),
      ppm: pxPerMinute(track),
      last: 0,
      moved: false,
    };
    el.classList.add('is-dragging');
  });

  root.addEventListener('pointermove', e => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const steps = Math.round((e.clientX - d.x) / d.ppm / STEP_MIN) * STEP_MIN;
    if (steps === d.last) return;
    d.last = steps;
    d.moved = true;
    if (d.resize) onResize(d.index, d.end + steps);
    else onMove(d.index, d.start + steps);
  });

  const finish = (e: PointerEvent) => {
    const d = drag;
    if (!d || e.pointerId !== d.pointerId) return;
    drag = null;
    d.el.classList.remove('is-dragging');
    if (d.el.hasPointerCapture(d.pointerId)) d.el.releasePointerCapture(d.pointerId);
    if (d.moved) {
      // 放開後瀏覽器還會送一次 click，拖動過的話擋掉（設定頁的時間條點一下是跳到那一列）
      const block = (ev: Event) => ev.stopPropagation();
      window.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', block, { capture: true }), 0);
    }
    onEnd(d.index);
  };
  root.addEventListener('pointerup', finish);
  root.addEventListener('pointercancel', finish);
}
