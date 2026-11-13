import { html, type TemplateResult } from 'lit-html';
import { KIND_OF, TYPE_LABEL } from '../config/kinds';
import { NAMING_RULES, PRIORITY, PRIORITY_NOTE, TERM_GROUPS, type Term } from '../config/terms';
import { viewHead } from '../components/view-head';

/** 名詞用和時間表一樣的螢光筆底色，類型另外寫成文字，顏色只是輔助 */
const termItem = (t: Term) => html`<div class="term">
  <dt><span class="term-name ${t.type ? `kind-${KIND_OF[t.type]}` : ''}">${t.term}</span></dt>
  <dd>${t.meaning}</dd>
  <dd class="term-type">類型：${t.type ? TYPE_LABEL[t.type] : '依時段而定'}</dd>
</div>`;

export function renderTerms(): TemplateResult {
  return html`${viewHead('名詞', '時段名稱的意思與先後順序')}
    <div class="stack">
      <section class="sec">
        <h2>命名規則</h2>
        <ul class="rule-list">${NAMING_RULES.map(r => html`<li>${r}</li>`)}</ul>
      </section>
      <section class="sec">
        <h2>時間不夠時的取捨順序</h2>
        <p class="hint">越前面越要保住，越後面越先縮短或取消。</p>
        <ol class="priority-list">
          ${PRIORITY.map(p => html`<li><b>${p.name}</b>：${p.note}</li>`)}
        </ol>
        <p class="hint hint-after">${PRIORITY_NOTE}</p>
      </section>
      <section class="sec">
        <h2>名詞解釋</h2>
        ${TERM_GROUPS.map(
          g => html`<div class="term-group">
            <h3>${g.title}</h3>
            ${g.note ? html`<p class="hint">${g.note}</p>` : ''}
            <dl class="term-list">${g.items.map(termItem)}</dl>
          </div>`,
        )}
      </section>
    </div>`;
}
