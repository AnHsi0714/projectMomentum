import { html, type TemplateResult } from 'lit-html';
import { KIND_OF } from '../config/kinds';
import { SLEEP_TIME } from '../config/schedule';
import { isCanceled } from '../lib/schedule';
import { currentInfo, fmtDur, toMin } from '../lib/time';
import type { Block } from '../types';
import { timeRange } from './time-range';

// 「現在」區塊：現在是哪個時段、還剩多久、進度尺，以及接著是什麼。

const progress = (m: number, s: number, e: number) => Math.round(((m - s) / (e - s)) * 100);

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

/** 正在某個時段裡：標題、時間、剩餘時間、進度尺與下一個時段 */
function inBlock(m: number, dk: string, cur: Block, nxt: Block | undefined): TemplateResult {
  const s = toMin(cur[0]);
  const e = toMin(cur[1]);
  const canceled = isCanceled(dk, cur);
  // 被取消的時段和時間表一樣：加「取消」標記，標題劃線，不再上螢光筆
  return html`<p class="hero-eyebrow">現在${canceled ? html`<span class="badge">取消</span>` : ''}</p>
    <h2 class="hero-title kind-${KIND_OF[cur[3]]} ${canceled ? 'is-canceled' : ''}">${cur[2]}</h2>
    <p class="hero-time">${timeRange(cur[0], cur[1])}</p>
    <p class="hero-count"><span class="hero-count-label">還剩</span> <span class="hero-count-value">${fmtDur(e - m)}</span></p>
    <div class="hero-meter" aria-hidden="true"><i style="width:${progress(m, s, e)}%"></i>${ticks(s, e)}</div>
    <div class="hero-foot">
      <p class="hero-meta"><span>已進行 ${fmtDur(m - s)}</span><span aria-hidden="true">・每格 ${fmtDur(tickStep(e - s))}</span></p>
      <p class="hero-next">${nxt ? html`接著 <b>${nxt[0]}</b> ${nxt[2]}` : html`接著 <b>${SLEEP_TIME}</b> 就寢`}</p>
    </div>`;
}

/** 「現在」區塊。只在看今天時顯示 */
export function hero(now: Date, dk: string, blocks: Block[]): TemplateResult {
  const info = currentInfo(now, blocks);
  let body: TemplateResult;
  if (info.state === 'in') {
    body = inBlock(info.m, dk, blocks[info.idx], blocks[info.idx + 1]);
  } else if (info.state === 'before' || info.state === 'gap') {
    const next = blocks[info.state === 'gap' ? info.idx : 0];
    body = html`<p class="hero-eyebrow">${info.state === 'gap' ? '現在' : '尚未開始'}</p>
      <h2 class="hero-title">${info.state === 'gap' ? '沒有安排' : '起床前'}</h2>
      <div class="hero-foot"><p class="hero-next">${fmtDur(toMin(next[0]) - info.m)}後 <b>${next[0]}</b> ${next[2]}</p></div>`;
  } else if (info.state === 'empty') {
    body = html`<p class="hero-eyebrow">今天沒有安排</p>
      <h2 class="hero-title">休息</h2>
      <div class="hero-foot"><p class="hero-next">不延後睡眠來補進度。</p></div>`;
  } else {
    body = html`<p class="hero-eyebrow">今日時程已結束</p>
      <h2 class="hero-title">${info.m < toMin(SLEEP_TIME) ? '準備睡覺' : '該就寢了'}</h2>
      <div class="hero-foot"><p class="hero-next">不延後睡眠來補進度。</p></div>`;
  }
  return html`<section class="hero" id="now-card">${body}</section>`;
}
