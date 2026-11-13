import { REVIEW_QUESTIONS } from '../config/habits';
import { data } from '../lib/store';
import { dkey, esc, mondayOf } from '../lib/time';
import { state } from '../state';
import { viewHead, weekNav, weekTitle } from './parts';

export function renderReview(): string {
  const key = dkey(mondayOf(state.selDate));
  const answers = data.reviews[key] ?? {};

  const questions = REVIEW_QUESTIONS.map(
    (q, i) => `<div class="field">
      <label class="q" for="q${i}"><span class="q-num" aria-hidden="true">${i + 1}</span><span>${q}</span></label>
      <textarea id="q${i}" data-q="${i}" rows="3">${esc(answers[i] ?? '')}</textarea>
    </div>`,
  ).join('');

  return `${viewHead('每週回顧', `${weekTitle(state.selDate)}的回顧`)}
    <div class="stack">
      ${weekNav()}
      <section class="sec">
        <h2>這一週的回顧</h2>
        <div class="field-list">${questions}</div>
        <p class="hint hint-after">內容會自動儲存。</p>
      </section>
      <section class="sec">
        <h2>備份</h2>
        <p class="hint">資料主檔在專案的 data/momentum.json。也可以另外匯出一份，或從備份檔還原。</p>
        <div class="actions">
          <button type="button" class="btn" id="btn-export">匯出 JSON</button>
          <button type="button" class="btn" id="btn-import">匯入 JSON</button>
          <input type="file" id="file-import" accept="application/json,.json" hidden>
        </div>
        <p class="form-msg" id="backup-msg" role="status"></p>
      </section>
    </div>`;
}
