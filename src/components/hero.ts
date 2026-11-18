import { html, nothing, type TemplateResult } from 'lit-html';
import { KIND_OF } from '../config/kinds';
import { SLEEP_TIME } from '../config/schedule';
import { isLocked } from '../lib/blocks';
import { cutTasks, floatsLeft, logFor, nextTask, plannedEnd, previousTask, remainingOf, running } from '../lib/log';
import { isCanceled } from '../lib/schedule';
import { fmtDur, fmtTime, toMin } from '../lib/time';
import type { Block, Entry, Float } from '../types';
import { timeRange } from './time-range';

// 「現在」區塊：依實際紀錄顯示現在在做什麼。
//   有任務或浮動事項在進行：名稱、已進行多久、進度尺、結束按鈕；超過預定長度太多時問還在不在做。
//   任務多一個暫停，以及「回到」前一個任務：這個先暫停，切回去做前一個，之後再按繼續回來。
//   固定時段（上課、通勤）照時鐘：名稱、還剩多久、進度尺，不用按。
//   都沒有：休息，下面是下一個任務的開始按鈕、被打斷的任務的繼續按鈕，以及剛結束的任務的接著做按鈕。
// 浮動事項（吃飯、洗澡、假日起床）的開始按鈕一直列在最下面，按下去會暫停正在做的任務。
// 按鈕用 data-run 標示動作、data-ref 標示對象，由 main.ts 處理。

const progress = (m: number, s: number, e: number) => Math.min(100, Math.max(0, Math.round(((m - s) / (e - s)) * 100)));

/** 刻度間隔（分鐘）：1 小時內每 5 分，2 小時內每 10 分，4 小時內每 30 分，更長每 1 小時 */
const tickStep = (len: number) => (len <= 60 ? 5 : len <= 120 ? 10 : len <= 240 ? 30 : 60);

/**
 * 進度尺的刻度，對齊時鐘上的整點，不是從時段開始算。
 * 整點最長最粗，半點次之，其餘最短。頭尾剛好落在刻度上時也畫，看得出這段從幾點到幾點。
 */
function ticks(s: number, e: number): TemplateResult[] {
  const step = tickStep(e - s);
  const out: TemplateResult[] = [];
  for (let t = Math.ceil(s / step) * step; t <= e; t += step) {
    const level = t % 60 === 0 ? 'tick-hour' : t % 30 === 0 ? 'tick-half' : '';
    out.push(html`<span class="tick ${level}" style="left:${(((t - s) / (e - s)) * 100).toFixed(2)}%"></span>`);
  }
  return out;
}

const meter = (m: number, s: number, e: number) =>
  html`<div class="hero-meter" aria-hidden="true"><i style="width:${progress(m, s, e)}%"></i>${ticks(s, e)}</div>`;

/** 超過預定長度的一半還沒按結束，就問還在不在做 */
const OVER_RATIO = 1.5;

/** 「接著」：下一個任務或就寢 */
const nextLine = (nxt: Block | undefined) =>
  html`<p class="hero-next">${nxt ? html`接著 <b>${nxt.start}</b> ${nxt.label}` : html`接著 <b>${SLEEP_TIME}</b> 就寢`}</p>`;

/** 正在進行的任務或浮動事項：名稱、開始時間、已進行、進度尺、結束按鈕 */
function runningBody(m: number, r: Entry, planEnd: number, nxt: Block | undefined, back: Block | undefined): TemplateResult {
  const s = toMin(r.start);
  const planned = planEnd - s;
  const over = m - planEnd;
  const ask = !r.long && m - s > planned * OVER_RATIO;
  const actions = ask
    ? html`<div class="hero-actions" role="group" aria-label="還在做「${r.label}」嗎？">
        <span class="hero-actions-label">已經超過預定時間 ${fmtDur(over)}，還在做「${r.label}」嗎？</span>
        <button type="button" class="btn" data-run="keep">還在做</button>
        <button type="button" class="btn" data-run="planned" data-at=${planEnd}>在預定時間 ${fmtTime(planEnd)} 結束</button>
        <button type="button" class="btn" data-run="end">結束於現在</button>
      </div>`
    : html`<div class="hero-actions">
        <button type="button" class="btn btn-solid" data-run="end">結束<span class="sr-only">「${r.label}」</span></button>
        ${r.float ? nothing : html`<button type="button" class="btn" data-run="pause">暫停<span class="sr-only">「${r.label}」</span></button>`}
        ${back ? html`<button type="button" class="btn" data-run="switch" data-ref=${back.id}>回到「${back.label}」</button>` : nothing}
      </div>`;
  return html`<p class="hero-eyebrow">${r.float ? '進行中・浮動' : '進行中'}</p>
    <h2 class="hero-title kind-${KIND_OF[r.type]}">${r.label}</h2>
    <p class="hero-time">${r.start} 開始</p>
    <p class="hero-count"><span class="hero-count-label">已進行</span> <span class="hero-count-value">${fmtDur(m - s)}</span></p>
    ${meter(m, s, planEnd)}
    <div class="hero-foot">
      <p class="hero-meta"><span>${over > 0 ? `超過預定 ${fmtDur(over)}` : `預定 ${fmtDur(planned)}，還剩 ${fmtDur(-over)}`}</span></p>
      ${r.float ? nothing : nextLine(nxt)}
    </div>
    ${actions}`;
}

/** 固定時段（上課、通勤）照時鐘：名稱、時間、還剩多久、進度尺 */
function fixedBody(m: number, dk: string, cur: Block, nxt: Block | undefined): TemplateResult {
  const s = toMin(cur.start);
  const e = toMin(cur.end);
  const canceled = isCanceled(dk, cur);
  return html`<p class="hero-eyebrow">現在・固定${canceled ? html`<span class="badge">取消</span>` : ''}</p>
    <h2 class="hero-title kind-${KIND_OF[cur.type]} ${canceled ? 'is-canceled' : ''}">${cur.label}</h2>
    <p class="hero-time">${timeRange(cur.start, cur.end)}</p>
    <p class="hero-count"><span class="hero-count-label">還剩</span> <span class="hero-count-value">${fmtDur(e - m)}</span></p>
    ${meter(m, s, e)}
    <div class="hero-foot">
      <p class="hero-meta"><span>已進行 ${fmtDur(m - s)}</span><span aria-hidden="true">・每格 ${fmtDur(tickStep(e - s))}</span></p>
      ${nextLine(nxt)}
    </div>`;
}

/**
 * 剛按了結束的任務：今天最後一段任務紀錄（不算浮動事項）已經結束、不是被打斷的，而且還在時間表上。
 * 按錯結束或想再做一下時，可以從現在接著做。
 */
function lastEnded(dk: string, blocks: Block[]): Block | undefined {
  const last = logFor(dk).filter(e => !e.float).at(-1);
  if (!last?.end || last.cut) return undefined;
  return blocks.find(b => b.id === last.ref);
}

/**
 * 沒有在做任何事：休息。下面是被打斷或暫停的任務的繼續按鈕（每一個都列，最近停的在前）、下一個任務的開始按鈕，
 * 以及剛結束的任務的接著做按鈕（從現在記新的一段，中間的休息不算）。
 */
function restBody(
  m: number, dk: string, blocks: Block[], next: Block | undefined, cut: Block[], again: Block | undefined, started: boolean,
): TemplateResult {
  const first = blocks[0];
  const beforeDay = !started && first && m < toMin(first.start);
  const late = next ? m - toMin(next.start) : 0;
  const when = next ? (late > 0 ? `預定 ${next.start}，晚了 ${fmtDur(late)}` : late < 0 ? `預定 ${next.start}，還有 ${fmtDur(-late)}` : `預定 ${next.start}`) : '';
  const buttons = [
    ...cut.map(
      (c, k) =>
        html`<button type="button" class="btn ${k === 0 ? 'btn-solid' : ''}" data-run="start" data-ref=${c.id}>繼續「${c.label}」<span class="hero-btn-note">還剩 ${fmtDur(remainingOf(dk, c))}</span></button>`,
    ),
    next
      ? html`<button type="button" class="btn ${cut.length ? '' : 'btn-solid'}" data-run="start" data-ref=${next.id}>開始「${next.label}」</button>`
      : nothing,
    again
      ? html`<button type="button" class="btn ${cut.length || next ? '' : 'btn-solid'}" data-run="again" data-ref=${again.id}>接著做「${again.label}」</button>`
      : nothing,
  ];
  return html`<p class="hero-eyebrow">現在</p>
    <h2 class="hero-title">${beforeDay ? '起床前' : '休息'}</h2>
    <div class="hero-foot">
      <p class="hero-next">${next ? html`下一個：<b>${next.label}</b>，${when}` : html`今天的任務都結束了，${SLEEP_TIME} 就寢。不延後睡眠來補進度。`}</p>
    </div>
    ${next || cut.length || again ? html`<div class="hero-actions">${buttons}</div>` : nothing}`;
}

/** 浮動事項的開始按鈕：吃飯、洗澡、假日起床。按下去會暫停正在做的任務 */
function floatTools(items: Float[]): TemplateResult | typeof nothing {
  if (!items.length) return nothing;
  return html`<div class="hero-floats" role="group" aria-labelledby="float-title">
    <span class="hero-floats-label" id="float-title">浮動事項</span>
    ${items.map(f => html`<button type="button" class="btn" data-run="float" data-ref=${f.id}>開始「${f.label}」<span class="hero-btn-note">約 ${fmtDur(f.minutes)}</span></button>`)}
  </div>`;
}

/**
 * 「現在」區塊。只在看今天時顯示。adjusting 為 true 表示正在調整時間表，這時不顯示浮動事項，開始與結束按鈕由樣式藏起來。
 * 訊息區一直都在，閱讀器才播報得到按下按鈕後的結果。
 */
export function hero(now: Date, dk: string, blocks: Block[], floats: Float[], adjusting = false): TemplateResult {
  const m = now.getHours() * 60 + now.getMinutes();
  const r = running(dk);
  const next = nextTask(dk, blocks, now);
  const fixed = blocks.find(b => isLocked(b) && toMin(b.start) <= m && m < toMin(b.end));
  const upcoming = blocks.find(b => toMin(b.start) > m && !isLocked(b)) ?? next;
  let body: TemplateResult;
  if (r) body = runningBody(m, r, plannedEnd(dk, r, blocks, floats), next, previousTask(dk, blocks));
  else if (fixed) body = fixedBody(m, dk, fixed, upcoming);
  else body = restBody(m, dk, blocks, next, cutTasks(dk, blocks, now), lastEnded(dk, blocks), logFor(dk).length > 0);
  const tools = adjusting || (r && r.float) ? nothing : floatTools(floatsLeft(dk, floats));
  return html`<section class="hero ${adjusting ? 'is-adjusting' : ''}" id="now-card">${body}${adjusting ? nothing : tools}
    <p class="form-msg" id="hero-msg" role="status"></p></section>`;
}
