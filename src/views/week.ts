import { DAY_NAMES, SCHEDULE } from '../config/schedule';
import { HABITS } from '../config/habits';
import { data } from '../lib/store';
import { dkey, isToday, weekDates } from '../lib/time';

export function renderWeek(): string {
  const wk = weekDates(new Date());

  const cols = wk
    .map(d => {
      const blocks = SCHEDULE[d.getDay()].map(b => `<div class="b c-${b[3]}">${b[0]} ${b[2]}</div>`).join('');
      return `<div class="col"><h4 class="${isToday(d) ? 'today' : ''}">週${DAY_NAMES[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}</h4>${blocks}</div>`;
    })
    .join('');

  const rows = HABITS
    .map(h => {
      let n = 0;
      const cells = wk
        .map(d => {
          const c = data.checks[dkey(d)]?.[h.id];
          if (c) n++;
          return `<td>${c ? '✓' : '·'}</td>`;
        })
        .join('');
      return `<tr><td>${h.name}</td>${cells}<td class="prog ${n >= h.target ? 'ok' : ''}">${n}/${h.target}</td></tr>`;
    })
    .join('');
  const head = wk.map(d => `<th>${DAY_NAMES[d.getDay()]}</th>`).join('');

  return `<div class="card"><h3>本週習慣進度</h3><table><tr><th></th>${head}<th>完成/目標</th></tr>${rows}</table>
    <div class="small" style="margin-top:8px">不必每天全部完成，以每週目標次數為準。</div></div>
    <div class="card"><h3>本週時間表總覽</h3><div class="grid7">${cols}</div></div>`;
}
