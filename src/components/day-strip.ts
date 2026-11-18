import { html, nothing, type TemplateResult } from 'lit-html';
import { KIND_OF } from '../config/kinds';
import { blanks, isLocked, lanes, SLEEP_MIN, STEP_MIN, type Conflict } from '../lib/blocks';
import { draftConflicts, draftMerges, stripStart, type Draft } from '../lib/draft';
import { fmtDur, fmtTime, pad, toMin } from '../lib/time';
import type { Block } from '../types';

// 調整時間表時，時間表上方的橫向時間條：一天從左排到右，每個任務是一塊，任務之間沒排東西的地方是空白，
// 一律寫成休息。任務可以拖到任何地方，蓋到別的任務時兩個分成上下兩排，
// 都看得到也抓得到；重疊的地方列在時間條下面的衝突清單，全部解開才能確認。
// 每一塊可調整的任務是 role="slider"，值是開始時間：焦點在上面時左右鍵移動 5 分鐘，
// Page Up／Page Down 移動 30 分鐘，Shift 加左右鍵改長度。拖動與按鍵都由 main.ts 處理。

/**
 * 每 5 分鐘至少佔多寬（rem）。時間條平常撐滿整個版面寬度；畫面窄到放不下時才用這個寬度，
 * 時間條本身左右捲動，頁面不會。30 分鐘的任務剛好放得下兩個字，桌機的版面寬度不用捲動
 */
const REM_PER_STEP = 0.38;

/** 短於這個長度的塊太窄，不寫名稱；滑鼠移上去、鍵盤選到或拖動時，下方會浮出完整名稱與時間 */
const LABEL_MIN = 30;

/** 短於這個長度的塊左右幾乎不留白，字才寫得下 */
const WRAP_MIN = 60;

const nameOf = (label: string) => label.trim() || '未命名的任務';

/**
 * 時間條上寫的名稱，換行最多兩行，例如 30 分鐘的「輕量活動」寫成「輕量」「活動」兩行。
 * 兩行寫不下的截掉，完整名稱看浮出的說明
 */
const stripLabel = (text: string, minutes: number): TemplateResult =>
  html`<span class="seg-label ${minutes < WRAP_MIN ? 'is-short' : ''}">${text}</span>`;

/** 一個衝突的說明：「英文」和「晚餐」重疊 21:30–21:45（15 分） */
export const conflictText = (blocks: Block[], c: Conflict): string =>
  `「${nameOf(blocks[c.a].label)}」和「${nameOf(blocks[c.b].label)}」重疊 ${fmtTime(c.start)}–${fmtTime(c.end)}（${fmtDur(c.end - c.start)}）`;

/**
 * 衝突清單：每一項是按鈕，按下去把焦點帶到可以拖動的那個任務。
 * 清單本身不播報，拖動途中才不會每移一格就唸一次；放開或按鍵後由 main.ts 在 #conflict-live 播報數量。
 */
function conflictList(d: Draft): TemplateResult {
  const found = draftConflicts(d);
  return html`<div class="conflicts ${found.length ? 'has-conflict' : ''}" role="group" aria-labelledby="conflict-title">
    <h3 class="conflicts-title" id="conflict-title">衝突${found.length ? html`<span class="conflicts-count">${found.length} 個</span>` : ''}</h3>
    ${found.length
      ? html`<p class="hint">把任務拖開、縮短或刪除，全部解開才能確認。按下面的項目會選到那個任務，可以直接用方向鍵移開。</p>
          <ul class="conflict-list" role="list">
            ${found.map(c => {
              const target = !isLocked(d.blocks[c.b]) ? c.b : c.a;
              return html`<li><button type="button" class="btn conflict-item" data-act="goto" data-i=${target}>${conflictText(d.blocks, c)}</button></li>`;
            })}
          </ul>`
      : html`<p class="hint">沒有衝突，可以確認。</p>`}
    <p class="sr-only" id="conflict-live" role="status"></p>
  </div>`;
}

/**
 * 確認時會合併的清單：同一件事接在一起或重疊，例如被打斷的任務兩段拖到接在一起。
 * 沒有就不顯示。只是提醒，不擋確認，所以不播報也不放按鈕。
 */
function mergeList(d: Draft): TemplateResult | typeof nothing {
  const pairs = draftMerges(d);
  if (!pairs.length) return nothing;
  const when = (b: Block) => `${b.start}–${b.end}`;
  return html`<div class="merges" role="group" aria-labelledby="merge-title">
    <h3 class="conflicts-title" id="merge-title">會合併<span class="conflicts-count">${pairs.length} 處</span></h3>
    <p class="hint">同一件事接在一起或重疊，不算衝突，確認時合成一段。</p>
    <ul class="merge-list" role="list">
      ${pairs.map(([a, b]) => html`<li>「${nameOf(d.blocks[a].label)}」${when(d.blocks[a])} 和 ${when(d.blocks[b])}</li>`)}
    </ul>
  </div>`;
}

export function dayStrip(d: Draft): TemplateResult | typeof nothing {
  const blocks = d.blocks;
  // 刻度從原定第一個時段的整點開始，拖動中不會變
  const lo = stripStart(d);
  const hi = SLEEP_MIN;
  if (lo >= hi) return nothing;
  const at = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`;
  const span = (s: number, e: number) => `left: ${at(s)}; width: calc(${at(e)} - ${at(s)})`;
  // 任務左右各內縮 1px，相鄰的兩塊之間留一條縫，看得出是兩個任務
  const segSpan = (s: number, e: number) => `left: calc(${at(s)} + 1px); width: calc(${at(e)} - ${at(s)} - 2px)`;
  const hours = Array.from({ length: Math.floor(hi / 60) - Math.ceil(lo / 60) + 1 }, (_, k) => Math.ceil(lo / 60) + k);
  const { lane, count } = lanes(blocks);
  const clash = new Set(draftConflicts(d).flatMap(c => [c.a, c.b]));

  return html`<div class="day-strip" role="group" aria-labelledby="strip-title" aria-describedby="strip-help">
    <p class="strip-title" id="strip-title">時間條</p>
    <ul class="hint hint-list" id="strip-help">
      <li>按住任務左右拖是移動，拖右邊緣是改長度，一格 5 分鐘。</li>
      <li>任務可以拖過或蓋過別的任務，重疊時分成上下兩排，下面會列出衝突。</li>
      <li>鍵盤：焦點移到任務上，左右鍵移動 5 分鐘，Page Up／Page Down 移動 30 分鐘，Shift 加左右鍵改長度。</li>
      <li>沒有底色的是任務之間的空白，寫成休息；虛線框的固定時段不能動。</li>
    </ul>
    <div class="strip-scroll">
      <div class="strip-track" data-lo=${lo} data-hi=${hi} style="--lanes: ${count}; width: max(100%, ${((hi - lo) / STEP_MIN) * REM_PER_STEP}rem)">
        ${blanks(blocks)
          .filter(([, e]) => e > lo)
          .map(([s0, e]) => {
            const s = Math.max(s0, lo);
            return html`<span class="blank" style=${span(s, e)} aria-hidden="true">${e - s >= LABEL_MIN ? stripLabel('休息', e - s) : ''}</span>`;
          })}
        ${blocks.map((b, i) => {
          const s = toMin(b.start);
          const e = toMin(b.end);
          // 浮出的完整名稱與時間蓋在下方；後半天的任務靠右對齊，才不會超出時間條
          const pop = html`<span class="seg-pop ${s - lo > (hi - lo) / 2 ? 'is-end' : ''}" aria-hidden="true">${nameOf(b.label)}<span class="seg-pop-time">${b.start}–${b.end}・${fmtDur(e - s)}</span></span>`;
          const label = html`${e - s >= LABEL_MIN ? stripLabel(nameOf(b.label), e - s) : ''}${pop}`;
          const cls = `seg kind-${KIND_OF[b.type]} ${clash.has(i) ? 'is-clash' : ''}`;
          const pos = `${segSpan(s, e)}; --lane: ${lane[i]}`;
          if (isLocked(b)) {
            // 固定的時段不能操作，閱讀器從下面的清單就知道它的時間，這裡只給看的
            return html`<span class=${`${cls} is-locked`} style=${pos} aria-hidden="true">${label}<span class="seg-lock">固定</span></span>`;
          }
          const clashText = clash.has(i) ? '，有衝突' : '';
          return html`<span class=${cls} style=${pos} data-seg=${i} id="r${i}-time" role="slider" tabindex="0"
            aria-label=${nameOf(b.label)} aria-valuemin=${lo} aria-valuemax=${hi - (e - s)} aria-valuenow=${s}
            aria-valuetext="${b.start} 到 ${b.end}，${fmtDur(e - s)}${clashText}">${label}<span class="seg-grip" data-grip=${i} aria-hidden="true"></span></span>`;
        })}
        <div class="strip-hours" aria-hidden="true">
          ${hours.map(h => html`<span class="strip-hour" style="left: ${at(h * 60)}">${pad(h)}:00</span>`)}
          ${hours.filter(h => h * 60 + 30 < hi).map(h => html`<span class="strip-half" style="left: ${at(h * 60 + 30)}"></span>`)}
        </div>
      </div>
    </div>
    ${conflictList(d)}
    ${mergeList(d)}
  </div>`;
}

/** 時間條上 1 分鐘佔幾個像素，拖動時換算用 */
export function pxPerMinute(track: HTMLElement): number {
  const lo = Number(track.dataset.lo);
  const hi = Number(track.dataset.hi);
  return track.getBoundingClientRect().width / (hi - lo);
}
