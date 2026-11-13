import { REVIEW_QUESTIONS } from '../config/habits';
import { data } from '../lib/store';
import { dkey, esc, mondayOf } from '../lib/time';

export function renderReview(): string {
  const key = dkey(mondayOf(new Date()));
  const r = data.reviews[key] ?? {};
  const qs = REVIEW_QUESTIONS
    .map((q, i) => `<div class="q"><div>${q}</div><textarea data-q="${i}">${esc(r[i] ?? '')}</textarea></div>`)
    .join('');
  return `<div class="card"><h3>每週回顧（${key} 起這一週）</h3>${qs}
      <div class="small">內容會自動儲存。</div></div>
    <div class="card"><h3>備份</h3>
      <div class="small" style="margin-bottom:8px">資料主檔在專案的 data/momentum.json；也可以另外匯出一份。</div>
      <button class="btn" id="btn-export">匯出 JSON</button>
      <button class="btn" id="btn-import">匯入 JSON</button>
      <input type="file" id="file-import" accept="application/json" hidden></div>`;
}
