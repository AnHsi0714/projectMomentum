import { html } from 'lit-html';
import { ADJUST_NOTE, FIX_NOTE } from '../config/habits';
import { TYPE_LABEL } from '../config/kinds';
import { SLEEP_TIME } from '../config/schedule';
import { LIFE_TYPES } from '../lib/blocks';
import type { BlockType, Float } from '../types';

// 調整時間表的入口、操作說明與底部按鈕。按鈕的動作由 main.ts 依 data-act 處理。
// 訊息區（.form-msg）不綁定內容，由 main.ts 直接寫入文字，每次重畫前清空。

/**
 * 還沒開始調整時，時間表上方的入口。舊版定稿的日子不能調整，按鈕停用，說明改成不能調整的原因；
 * lockedNote 為 null 表示可以調整。past 為 true 是過去的日子，說明改成修正實際紀錄。
 */
export const adjustEntry = (lockedNote: string | null, past = false) => html`<div class="adjust-entry">
    <button type="button" class="btn" id="btn-adjust" aria-describedby="adjust-note" ?disabled=${!!lockedNote}>調整時間表</button>
    <p class="hint" id="adjust-note">${lockedNote ?? (past ? FIX_NOTE : ADJUST_NOTE)}</p>
  </div>
  <p class="form-msg" id="adjust-msg" role="status"></p>`;

/** 調整中，時間表上方的操作說明 */
export const adjustHint = () => html`<ul class="hint hint-list" id="move-note">
    <li>做過的照<strong>實際</strong>的時間列出，被打斷的任務分成兩段。拖動、改長度、刪除改的就是實際紀錄。</li>
    <li>忘了按開始或結束：把任務拖到實際的時間，按「<strong>有做</strong>」。結束在現在之後的就是還在進行。</li>
    <li>忘了記吃飯、洗澡：用下面的插入，項目選那個浮動事項。</li>
    <li>在下面的時間條拖動任務，改時間也改先後。</li>
    <li>任務可以拖過或蓋過別的任務。兩個任務要對調時，先把一個拖到另一個上面，再把另一個拖回原位，中間的任務都不會動。</li>
    <li>重疊的地方會列成<strong>衝突</strong>，全部解開才能確認。做過的事和現在之前的計畫或固定時段疊在一起不算衝突。</li>
    <li>任務之間沒排東西的地方是<strong>空白</strong>，寫成休息。</li>
    <li><strong>固定</strong>的時段（上課、通勤、臨時行程、睡前準備）不能拖動。</li>
    <li>一天最晚到 ${SLEEP_TIME} 就寢。相鄰而且名稱、類型都相同的任務，儲存時會合併成一個。</li>
  </ul>
  <p class="form-msg" id="adjust-msg" role="status"></p>`;

/** 插入時可以選的類型：起床、吃飯、休息是浮動事項或空白，不能插入成任務 */
const INSERT_TYPES = (Object.keys(TYPE_LABEL) as BlockType[]).filter(t => !LIFE_TYPES.has(t));

/**
 * 插入的表單。開始時間用文字欄位，24 小時制，打「1400」或「14:00」都可以，沒有上午、下午。
 * 「項目」預設是新任務；選浮動事項時是補記忘了按的吃飯、洗澡，名稱、類型與固定照那個浮動事項。
 * 欄位沒有綁定值（預設值除外），重畫不會清掉使用者填到一半的內容；按下插入後由 main.ts 讀取。
 */
export const insertForm = (defaultStart: string, floats: Float[]) => html`<fieldset class="insert-form">
    <legend>插入</legend>
    <p class="hint" id="insert-note">例如臨時開會：填開始時間與長度。原本在這段時間的任務不會被推動，重疊的話會列成衝突，再自己拖開。
      已經過了的任務記成有做。補記吃飯、洗澡時，項目選那個浮動事項，名稱與類型不用填。</p>
    <div class="insert-fields">
      <label class="field-label" for="new-item">項目<select id="new-item" aria-describedby="insert-note">
        <option value="">新任務</option>
        ${floats.length ? html`<optgroup label="浮動事項（補記）">${floats.map(f => html`<option value=${f.id}>${f.label}</option>`)}</optgroup>` : ''}
      </select></label>
      <label class="field-label" for="new-label">名稱<input type="text" id="new-label" maxlength="40" autocomplete="off" placeholder="例如：小組會議"></label>
      <label class="field-label" for="new-start">開始（24 小時制）<input type="text" id="new-start" inputmode="numeric" autocomplete="off" placeholder="例如 1400" value=${defaultStart} aria-describedby="insert-note"></label>
      <label class="field-label" for="new-len">長度（分鐘）<input type="number" id="new-len" min="5" max="600" step="5" value="60"></label>
      <label class="field-label" for="new-type">類型<select id="new-type">
        ${INSERT_TYPES.map(t => html`<option value=${t} ?selected=${t === 'event'}>${TYPE_LABEL[t]}</option>`)}
      </select></label>
    </div>
    <label class="check-label" for="new-lock"><input type="checkbox" id="new-lock" checked><span>固定時間（開會這類不能移動的行程）</span></label>
    <div class="actions"><button type="button" class="btn" data-act="insert">插入</button></div>
  </fieldset>`;

/** 調整中，貼在視窗底部的確認與取消。有衝突時確認照樣可以按，按下去會說明原因並帶到衝突清單 */
export const adjustBar = () => html`<div class="adjust-bar" role="group" aria-label="儲存或取消調整">
    <p class="form-msg is-error" id="adjust-error" role="alert"></p>
    <div class="actions">
      <button type="button" class="btn btn-solid" data-act="confirm">確認</button>
      <button type="button" class="btn" data-act="cancel">取消</button>
      <button type="button" class="btn" data-act="reset">還原原定時間表</button>
    </div>
  </div>`;
