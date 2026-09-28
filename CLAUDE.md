# Brick Talk

- 原始規格：SUPERPROMPT.md（2026-09-27 過夜那一輪寫的）。之後追加的功能以程式碼和 docs/HANDOFF.md 為準，跟 SUPERPROMPT.md 衝突時以程式碼為準。外部事實：docs/research.md。參考實作：docs/reference/。
- 交接檔：docs/HANDOFF.md。每輪更新最上面的「目前狀態」，並在輪次紀錄追加 2 到 3 行：做完什麼、下一步、卡在哪。
- 里程碑清單：docs/PLAN.md。
- 指令：pnpm dev / pnpm build / pnpm lint / pnpm test / pnpm e2e / pnpm palette
- data/raw/ 唯讀。app 執行期只讀 src/core/palette.data.json。
- src/core/ 不 import React、three、DOM、Node API。
- 只准用 SUPERPROMPT.md 第 5 節列的套件。
- 不 push、不部署、不把 API key 寫進任何檔案或輸出。

@AGENTS.md
