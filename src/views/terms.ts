import { KIND_OF, TYPE_LABEL } from '../config/kinds';
import { NAMING_RULES, PRIORITY, PRIORITY_NOTE, TERM_GROUPS, type Term } from '../config/terms';
import { esc } from '../lib/time';
import { viewHead } from './parts';

/** 名詞用和時間表一樣的螢光筆底色，類型另外寫成文字，顏色只是輔助 */
function termItem(t: Term): string {
  const kind = t.type ? ` kind-${KIND_OF[t.type]}` : '';
  const type = t.type ? TYPE_LABEL[t.type] : '依時段而定';
  return `<div class="term">
    <dt><span class="term-name${kind}">${esc(t.term)}</span></dt>
    <dd>${esc(t.meaning)}</dd>
    <dd class="term-type">類型：${type}</dd>
  </div>`;
}

export function renderTerms(): string {
  const groups = TERM_GROUPS.map(
    g => `<div class="term-group">
      <h3>${g.title}</h3>
      ${g.note ? `<p class="hint">${g.note}</p>` : ''}
      <dl class="term-list">${g.items.map(termItem).join('')}</dl>
    </div>`,
  ).join('');

  return `${viewHead('名詞', '時段名稱的意思與先後順序')}
    <div class="stack">
      <section class="sec">
        <h2>命名規則</h2>
        <ul class="rule-list">${NAMING_RULES.map(r => `<li>${r}</li>`).join('')}</ul>
      </section>
      <section class="sec">
        <h2>時間不夠時的取捨順序</h2>
        <p class="hint">越前面越要保住，越後面越先縮短或取消。</p>
        <ol class="priority-list">
          ${PRIORITY.map(p => `<li><b>${p.name}</b>：${p.note}</li>`).join('')}
        </ol>
        <p class="hint hint-after">${PRIORITY_NOTE}</p>
      </section>
      <section class="sec">
        <h2>名詞解釋</h2>
        ${groups}
      </section>
    </div>`;
}
