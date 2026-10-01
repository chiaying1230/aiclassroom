# Apps Script 後端備份

這個資料夾是 AI 課堂後端程式的**備份**。真正執行的程式在 Google Apps Script 專案裡，改這裡不會影響網站。

| 檔案 | 內容 | 負責 |
|---|---|---|
| `Code.gs` | 網頁 API 入口、教師登入、試算表讀寫、作答與批改流程、課堂討論 | 擁有者 |
| `ai.gs` | 所有呼叫 Gemini 的程式：批改、建議類別、分類、摘要 | AI 夥伴 |

教材庫與 AI 助理的 `RAG_Admin.gs`、`RAG_Chat.gs` 尚未備份。

## 更新備份

在 Apps Script 改好並部署新版本後，把該檔案的內容更新到這裡，commit 訊息寫清楚改了什麼。

## 不放進這裡的東西

API 金鑰（`GEMINI_API_KEY`）、教師密碼（`TEACHER_PASSWORD`）都只存在 Apps Script 的「專案設定 → 指令碼屬性」，不要寫進程式或這個資料夾。
