# CLAUDE.md

專案說明見 [README.md](README.md)，開發細節（資料格式、檔案結構、設計與無障礙）見 [docs/development.md](docs/development.md)

## Commit 規則

- Commit message **不要**加上 `Co-Authored-By` 或任何 AI 協作者署名。
- **只有在使用者明確允許後，才執行一次 commit。**  
  未經允許不要主動執行 `git commit`。  
  每次只 commit 一次；下一次 commit 需要重新取得允許，先前的允許不代表持續有效。
- Commit message 使用一般慣例（動詞開頭、精簡說明變更原因），不需要額外的 AI 署名區塊。

## 顏色與字體

- 每次有新 UI、更換顏色或字體，須檢查符合 a11y 的 AA 規則，字體大小也有相關要求

## 文案與註解

- 中文文案、註解裡不要用 `--`／`——` 當作破折號使用，改用逗號、冒號或分成兩句。
