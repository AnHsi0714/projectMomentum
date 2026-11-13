import { html } from 'lit-html';
import { ADJUST_NOTE } from '../config/habits';
import { SLEEP_TIME } from '../config/schedule';

// 調整時間表的入口、操作說明與底部按鈕。按鈕的動作由 main.ts 依 data-act 處理。
// 訊息區（.form-msg）不綁定內容，由 main.ts 直接寫入文字，每次重畫前清空。

/**
 * 還沒開始調整時，時間表上方的入口。過去的日子與已經按過確認的日子不能調整，按鈕停用，
 * 說明改成不能調整的原因。lockedNote 為 null 表示可以調整。
 */
export const adjustEntry = (lockedNote: string | null) => html`<div class="adjust-entry">
    <button type="button" class="btn" id="btn-adjust" aria-describedby="adjust-note" ?disabled=${!!lockedNote}>調整時間表</button>
    <p class="hint" id="adjust-note">${lockedNote ?? ADJUST_NOTE}</p>
  </div>
  <p class="form-msg" id="adjust-msg" role="status"></p>`;

/** 調整中，時間表上方的操作說明 */
export const adjustHint = () => html`<p class="hint" id="move-note">每列左邊的時間是<strong>開始時間</strong>，結束時間不用填：每個任務會延續到下一個任務開始，最後一個到 ${SLEEP_TIME} 就寢。新增的任務也只要填開始時間，會自動插進那個時間，前一個任務就在那時結束。按住左邊的上下箭頭拖曳可以調整先後，用鍵盤時把焦點移到箭頭上按上下鍵。儲存時會依開始時間自動排好。按「更新時間表」儲存後還能再調整，連已經結束的任務都能改；按「保存當天時間表」會儲存並<strong>定稿，這一天之後不能再調整</strong>。</p>
  <p class="form-msg" id="adjust-msg" role="status"></p>`;

/** 調整中，時間表下方的新增，以及貼在視窗底部的確認與取消 */
export const adjustBar = () => html`<div class="actions"><button type="button" class="btn" data-act="add">新增任務</button></div>
  <div class="adjust-bar" role="group" aria-label="儲存或取消調整">
    <p class="form-msg is-error" id="adjust-error" role="alert"></p>
    <div class="actions">
      <button type="button" class="btn btn-solid" data-act="confirm">更新時間表</button>
      <button type="button" class="btn" data-act="finalize">保存當天時間表</button>
      <button type="button" class="btn" data-act="cancel">取消</button>
      <button type="button" class="btn" data-act="reset">還原原定時間表</button>
    </div>
  </div>`;
