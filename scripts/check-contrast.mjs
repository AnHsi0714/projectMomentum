// WCAG 2.2 AA 檢查：編譯 SCSS，讀出淺色與深色 token，逐組驗證對比與字體大小。
// 用法：npm run check:contrast
// 有任何一項不合格就以非 0 結束。新增或更換顏色、字體時須先通過這支檢查。
import * as sass from 'sass';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = process.argv[2] ?? path.join(root, 'src/styles/main.scss');
const { css } = sass.compile(entry, { style: 'expanded' });

const TEXT = 4.5; // 一般文字
const UI = 3; // 元件邊界、焦點框、圖形物件
const MIN_FONT_PX = 14; // 本專案規定的最小字級

/** 要檢查的前景與背景配對：[前景, 背景, 最低對比, 說明] */
const PAIRS = [
  ['text', 'bg', TEXT, '內文在頁面底色'],
  ['text', 'surface', TEXT, '內文在內容面（現在的時段、輸入欄位、主視覺）'],
  ['text', 'surface-2', TEXT, '內文在較深的底色'],
  ['text-muted', 'bg', TEXT, '次要文字在頁面底色'],
  ['text-muted', 'surface', TEXT, '次要文字在內容面'],
  ['text-muted', 'surface-2', TEXT, '次要文字在已過的時段'],
  ['accent', 'bg', TEXT, '亮青色文字在頁面底色（連結、編號）'],
  ['accent', 'surface', TEXT, '亮青色文字在內容面（現在、今天標記）'],
  ['accent', 'surface-2', UI, '亮青色在較深的底色（進度指針、今天框，只當圖形用）'],
  ['accent-hover', 'bg', TEXT, '亮青色連結（懸停）在頁面底色'],
  ['on-accent', 'accent', TEXT, '亮青色方印上的字'],
  ['on-ink', 'ink', TEXT, '選中與完成的實心狀態上的字'],
  ['ok', 'bg', TEXT, '達標與已儲存文字在頁面底色'],
  ['ok', 'surface', TEXT, '達標文字在內容面'],
  ['warn', 'bg', TEXT, '警告文字在頁面底色'],
  ['danger', 'bg', TEXT, '錯誤文字在頁面底色'],
  ['danger', 'surface', TEXT, '錯誤文字在內容面（編輯任務的表單裡）'],
  ['text', 'mark-focus', TEXT, '螢光筆底色上的字：專注'],
  ['text', 'mark-class', TEXT, '螢光筆底色上的字：上課'],
  ['text', 'mark-move', TEXT, '螢光筆底色上的字：運動'],
  ['text', 'mark-learn', TEXT, '螢光筆底色上的字：英文與閱讀'],
  ['line-strong', 'bg', UI, '表單元件邊框在頁面底色'],
  ['line-strong', 'surface', UI, '表單元件邊框在內容面'],
  ['line-strong', 'surface-2', UI, '表單元件邊框在較深的底色'],
  ['focus', 'bg', UI, '焦點框在頁面底色'],
  ['focus', 'surface', UI, '焦點框在內容面'],
  ['focus', 'surface-2', UI, '焦點框在較深的底色'],
  ['ink', 'bg', UI, '選中與完成的實心格對頁面底色'],
  ['ink', 'surface', UI, '選中的實心格對內容面（進度條填色對主視覺）'],
  ['ink', 'surface-2', UI, '進度條填色對軌道'],
  ['ink', 'mark-focus', UI, '時間條把手與改長度的線對螢光筆底色：專注'],
  ['ink', 'mark-class', UI, '時間條把手與改長度的線對螢光筆底色：上課'],
  ['ink', 'mark-move', UI, '時間條把手與改長度的線對螢光筆底色：運動'],
  ['ink', 'mark-learn', UI, '時間條把手與改長度的線對螢光筆底色：英文與閱讀'],
  ['danger', 'surface-2', UI, '重疊的外框在已過的列'],
  ['danger', 'mark-focus', UI, '時間條上重疊任務的框對螢光筆底色：專注'],
  ['danger', 'mark-class', UI, '時間條上重疊任務的框對螢光筆底色：上課'],
  ['danger', 'mark-move', UI, '時間條上重疊任務的框對螢光筆底色：運動'],
  ['danger', 'mark-learn', UI, '時間條上重疊任務的框對螢光筆底色：英文與閱讀'],
  ['text-muted', 'line', TEXT, '空白的斜線底紋上的次要文字'],
  ['text', 'line', TEXT, '空白的斜線底紋上的內文'],
];

/** 取出 start 之後第一個大括號區塊的內容 */
function blockAt(text, start) {
  const open = text.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('大括號不成對');
}

const declarations = body =>
  Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));

const light = declarations(blockAt(css, css.indexOf(':root')));
const darkMedia = blockAt(css, css.indexOf('@media (prefers-color-scheme: dark)'));
const dark = { ...light, ...declarations(blockAt(darkMedia, darkMedia.indexOf(':root'))) };

function resolve(vars, name) {
  const value = vars[name];
  if (value === undefined) throw new Error(`找不到 token：--${name}`);
  const ref = value.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolve(vars, ref[1]) : value;
}

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`只支援 6 位或 3 位十六進位色碼：${hex}`);
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function luminance(hex) {
  const [r, g, b] = rgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

let failures = 0;
for (const [label, vars] of [['淺色', light], ['深色', dark]]) {
  console.log(`\n${label}模式`);
  for (const [fg, bg, min, note] of PAIRS) {
    const r = ratio(resolve(vars, fg), resolve(vars, bg));
    const ok = r >= min;
    if (!ok) failures++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${r.toFixed(2).padStart(5)} (需 ${min})  ${fg} / ${bg}  ${note}`);
  }
}

// 字體大小：所有可解析的 font-size 都不得小於最小字級
console.log(`\n字體大小（最小 ${MIN_FONT_PX}px）`);
const sizeDecls = [...css.matchAll(/font(?:-size)?:\s*([^;]+);/g)].map(m => m[1].trim());
let checked = 0;
for (const decl of sizeDecls) {
  const m = decl.match(/^(?:[\w-]+\s+)*?(\d*\.?\d+)(rem|px)\b/) ?? decl.match(/clamp\(\s*(\d*\.?\d+)(rem|px)/);
  if (!m) continue;
  checked++;
  const px = m[2] === 'rem' ? parseFloat(m[1]) * 16 : parseFloat(m[1]);
  if (px < MIN_FONT_PX) {
    failures++;
    console.log(`  FAIL ${px}px  (${decl})`);
  }
}
console.log(`  已檢查 ${checked} 個字級宣告`);

console.log(failures ? `\n${failures} 項不合格` : '\n全部合格');
process.exit(failures ? 1 : 0);
