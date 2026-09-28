# PLAN

照 SUPERPROMPT.md 第 11 節。勾選代表驗收通過並已 commit。

- [x] M0 git、scaffold、套件、測試設定、專案檔案
- [x] M1a palette 精簡、spec（schema、normalizeSpec、toApiSchema）（依賴 M0）
- [x] M1b voxelize、懸空島移除、layers 俯視圖（依賴 M1a）
- [x] M2 legolize 移植參考實作（依賴 M1b）
- [x] M3 support、steps、pipeline、隨機測試（依賴 M2）
- [x] M4 BOM、三種匯出、LDraw（依賴 M3）
- [x] M5 5 個示範模型、俯視圖（依賴 M4）
- [x] M6a 3D 預覽、結果頁框架、首頁範例卡片（依賴 M5）
- [x] M6b 步驟滑桿、截圖目視（依賴 M6a）
- [x] M7 snapshot：步驟圖、零件縮圖、說明書預覽（依賴 M6b）
- [x] M8 列印頁、?only=parts（依賴 M7）
- [x] M9 零件清單分頁（依賴 M4、M7）
- [x] M10a /api/design 與 llm（依賴 M5）
- [x] M10b 首頁輸入流程、錯誤狀態、localStorage（依賴 M10a、M6a）
- [x] M11 LLM 目視驗收：改做 subagent 代理評估（10 份，最多 2 次呼叫全部通過），真實 API 見下一行
- [ ] M11 真實 API 驗收（需要 key）BLOCKED-ON-HUMAN：沒有 ANTHROPIC_API_KEY
- [x] M12 P1：點子模式、最近做過、兩步一頁（依賴 M10b、M8）
- [x] M13 最終驗證
- [ ] M14 跳過（本次範圍外）
