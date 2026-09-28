# HANDOFF

## 目前狀態

- 開始時間：2026-09-27 01:15（使用者睡前指示開工）。5 小時檢查點 06:15（M8 要勾），6.5 小時 07:45（跳過 M11、M12），7.5 小時 08:45（直接 M13 並停止）。
- 執行模式：使用者 2026-09-27 01:15 睡前指示「superprompt 寫完直接開工，可以透過 Herdr 跟 Codex、agy 討論與驗收」。沒有 `/loop`，在同一個 session 連續做里程碑，每個里程碑 commit 加交接。
- API key：還是沒有。2026-09-27 上午加了 `LLM_BACKEND=claude-cli`（`.env.local`，不進 git），沒有 key 時改用本機 `claude -p` 與使用者的 Claude Code 登入。實測設計、點子都能用，`modelUsage` 確認是 claude-opus-5-5 與 claude-sonnet-5。SDK 那條路搭配新 schema 還沒實測。
- 進度：P0、P1、M13 完成。上午（互動 session）依使用者要求追加：claude-cli 後端、尺寸 L 與「不限」並拿掉磚數上限、特殊零件（輪子組、斜面、tile、plate、圓磚、錐體）、零件總覽頁 /parts、組裝動畫與動畫說明書。M14 的斜面、tile、plate 算是做掉了；挖空、視覺自我批評還沒做。中午再加：高度改用 plate 為單位、曲面自動斜面與倒斜面、15 種大片 plate、底板 base、估計價格（新台幣）。
- 最近一次驗證（2026-09-27 13:07）：lint 0 problems；tsc 0 錯誤；test 183 passed、1 skipped；e2e 28 passed（e2e 會先跑 build，build 通過）。
- 環境：Next.js 16.3.6、React 19.2.8、three 0.186.1、zod 4.6.5、@anthropic-ai/sdk 0.128.0、vitest 5.0.2、@playwright/test 1.63.0、pnpm 10.33.0、Node 26.9.0。

## 晨間報告（2026-09-27 02:10）

### 結論
P0 全部完成，P1 也做完了，可以 demo。不用 API key，首頁 5 個範例模型都能看 3D、零件清單、列印說明書；有 key 就能輸入描述讓 Claude 設計。最大的缺口是**沒有用真實 API 驗證過**（環境沒有 ANTHROPIC_API_KEY），所以 LLM 產出品質只做了代理評估：用 10 個 Opus subagent 拿一字不差的 system prompt 設計 5 個題目，10 份在最多 2 次呼叫內都通過品質檢查，截圖都認得出是什麼。真實 API 的延遲、structured outputs 的實際行為還沒驗。

### 怎麼跑
```
pnpm install
pnpm dev            # http://localhost:3000，點「看看範例」的任一張卡片
```
要讓 Claude 設計：在專案根目錄建 `.env.local`，寫一行 `ANTHROPIC_API_KEY=...`，重開 `pnpm dev`。

### 驗證結果
| 指令 | 結果 | 摘要 |
|---|---|---|
| `pnpm lint` | 通過 | 0 problems |
| `pnpm test` | 通過 | 12 個檔案、104 passed、1 skipped（評估工具，要設 EVAL_SPECS 才跑） |
| `pnpm build` | 通過 | 路由：/、/api/design、/api/ideas、/build/[id]、/build/[id]/print |
| `pnpm e2e` | 通過 | 20 passed（mock LLM、port 3100、headless Chromium 的 SwiftShader） |
| UI 字串檢查 | 通過 | src 裡 0 個簡體字（檢查本身用已知簡體字自我測試過）；英文只剩白名單內的 BrickLink「Wanted List」與網址 |

### 里程碑
- M0 到 M10b：完成。
- M11 真實 API 目視驗收：BLOCKED-ON-HUMAN（沒有 API key）。改做 subagent 代理評估，結果見下方。
- M12（P1）：完成（點子模式、最近做過、兩步一頁、內部磚數）。
- M13 最終驗證：完成（兩輪 Codex 唯讀審查，共 11 條都修掉；最終截圖 artifacts/screenshots/final-*.png）。
- M14（P2）：跳過（本次範圍外）。

### 示範模型
| 模型 | 磚數 | 零件種類 | 層數 | 步驟 | 元件數 | 補支撐 | 截圖 |
|---|---|---|---|---|---|---|---|
| 房子 | 144 | 28 | 12 | 27 | 1 | 0 | artifacts/screenshots/final-house-*.png |
| 小鴨 | 127 | 14 | 11 | 29 | 1 | 0 | artifacts/screenshots/final-duck-*.png |
| 跑車 | 76 | 25 | 7 | 20 | 1 | 0 | artifacts/screenshots/final-car-*.png |
| 聖誕樹 | 83 | 18 | 14 | 29 | 1 | 0 | artifacts/screenshots/final-tree-*.png |
| 機器人 | 106 | 30 | 14 | 30 | 1 | 0 | artifacts/screenshots/final-robot-*.png |

說明書 PDF：artifacts/booklet-house.pdf、artifacts/booklet-house-parts.pdf。

### LLM 目視驗收（代理評估，不是真實 API）
| 題目 | 份數 | 第一次就過 | 第二次（帶回饋）後 | 看得出是什麼 |
|---|---|---|---|---|
| 一隻紅色的小恐龍（中） | 2 | 2 | | 2（#1 底下有細支撐柱，已把回饋門檻調嚴） |
| 一隻坐著的橘色貓咪（小） | 2 | 1 | 1（尾巴接上） | 2 |
| 一座有兩個塔的城堡（中） | 2 | 2 | | 2 |
| 一架藍白色的小飛機（中） | 2 | 1 | 1（改成上單翼） | 2 |
| 一朵插在花盆裡的紅色花（小） | 2 | 2 | | 2 |

產物在 artifacts/llm-proxy/（system prompt、每份 JSON、俯視圖、截圖、summary.json）。

### 零件目錄
data/catalog/：64,664 個零件、275 種顏色、114,315 筆 Element ID 的 SQLite 與 CSV，加上 builder 用的 41 種零件 palette（四套色號對照）。詳見 README 與 data/catalog/README.md。

### 需要人處理
- [ ] 建 `.env.local` 放 ANTHROPIC_API_KEY，輸入「一隻紅色的小恐龍」跑一次，看秒數與結果（DoD 第 4 條）。機器沒有 key。
- [ ] 實際列印一份說明書 PDF，確認 A4 版面與紅框在紙上看得清楚。
- [ ] 下載 BrickLink XML，到 https://www.bricklink.com/v2/wanted/upload.page 上傳一次，確認能匯入。
- [ ] 在 lego.com Pick a Brick 試上傳 pick-a-brick.csv（標題列大小寫還沒實測；台灣能不能用也還沒確認）。
- [ ] 用 BrickLink Studio 或 LeoCAD 打開下載的 model.ldr，確認方向與顏色正確。
- [ ] 決定要不要保留 SUPERPROMPT.md 第 0 節對全域規則的三點覆蓋（ScheduleWakeup 接輪、缺 key 只擋單項、委派改用 Herdr 找 Codex）。

### 已知問題與下一步
- 模型是實心的，有些磚藏在內部看不到（結果頁有提示）。5 個示範模型：房子 22/144、機器人 10/106、跑車 7/76、小鴨 8/127、聖誕樹 1/83。下一步可做挖空內部（M14）。
- 異色部位只從側面相接時會分成多塊，演算法救不了，靠設計規則與品質回饋重試。隨機多色模型約六成會分開（刁鑽的測試資料），代理評估的真實題目 10 份裡 2 份，回饋後都修好。
- 只有 brick，沒有 plate、tile、斜面磚（屋頂是階梯狀）。palette 已經備好這些零件的資料與 LDraw 幾何（M14）。
- 真實 API 的延遲沒量過。設計用 claude-opus-5-5、effort medium、max_tokens 32000、整體 170 秒 deadline、單次 120 秒。

## 待決事項
（需要人決定、但不影響繼續做的事）

- 元件橋接後處理（M14 項目）：LLM 產生的模型常在「單排懸空邊緣」「橢球赤道外圈」「異色部位只側面相接」散成多塊。可以加一個 legolize 之後的後處理：小元件跟相鄰同色的主體磚合併成一塊更長的磚。單色 box 的附錄 B 數字不受影響（它們本來就是 1 塊）。P0 做完如果還有時間就做。

## 輪次紀錄

- 2026-09-27 01:20 M0 計畫：git init、scaffold（暫存目錄）、裝套件、vitest 與 Playwright 設定、smoke test。驗收：`pnpm build && pnpm test && pnpm e2e`。
- 2026-09-27 01:20 M0 完成：scaffold 在 $TMPDIR/lb-scaffold-0127（hook 擋 rm -rf，所以沒刪舊目錄，改用新名字）；@types/node 升到 24（vitest 5 的 peer 要求）。下一步 M1a。
- 2026-09-27 01:25 M1a 完成：palette.data.json 88,004 bytes（46 色、41 零件）；spec.ts（zod schema、normalizeSpec、shapeBounds、toApiSchema）。vitest 設定改成 .mts 消掉 CJS 警告。下一步 M1b。
- 2026-09-27 01:26 M1b 完成：voxelize（labelIndex、格子層級 mirror、bounding box 交集）、removeFloatingIslands、layers 俯視圖（固定字元對照）。下一步 M2 移植 legolize。
- 2026-09-27 01:29 M2 完成：legolize.ts 移植參考實作，數字跟附錄 B 完全一致；support.ts 先放 adjacency、groundedComponents；invariants.ts 放不變條件 1、2。第二輪審查：修了 normalizeSpec 的 cylinder 對調沒換半徑的 bug，規格補了 testDir、M0 先建 PLAN/HANDOFF 等。下一步 M3。
- 2026-09-27 01:31 M3 完成：buildWithSupport（補支撐加移除保險，記錄需要支撐與被移除的部位）、makeSteps（吊掛磚）、runPipeline（BOM 先空）。隨機 200 個（mulberry32 種子 20260927）不變條件 1、2、3、4、6 全過；元件數大於 1 有 138 個（69%，只當紀錄），補過支撐 82 個，移除 0 個。下一步 M4。
- 2026-09-27 01:32 M4 完成：bom.ts（分組、排序、數值比 element ID、BOM CSV、Pick a Brick CSV、BrickLink XML）、ldraw.ts（7.6 兩行範例都過）、pipeline 接上 BOM。下一步 M5 示範模型。
- 2026-09-27 01:36 M5 完成：5 個示範模型（src/fixtures/models），全部元件數 1、補支撐 0。
  - house 144 磚、28 種、12 層、27 步；duck 127 磚、14 種、11 層、29 步；car 76 磚、25 種、7 層、20 步；tree 83 磚、18 種、14 層、29 步（M6b 重放裝飾球後）；robot 106 磚、30 種、14 層、30 步。
  - 第一版踩到的坑：單排懸空的屋簷、圓錐最外緣、橢球赤道那一圈，都會變成孤立的磚（上下沒東西、錯縫層第一排又是 1 格寬）。改模型避開。演算法面的解法是「元件橋接後處理」，列進待決事項。
- 2026-09-27 01:40 Codex（codex exec 唯讀）審查 src/core：5 條都成立並修掉（不變條件檢查漏了負座標、BOM 同面積排序、曲面超出警告、半徑與尺寸修正沒警告、LDraw 標題換行）。它也確認 legolize、補支撐、分步跟參考實作在 2,700 個 box 加 200 個隨機模型上逐塊一致。輪次紀錄的時間改用 git commit 的實際時間（之前幾筆是估的，寫早了）。
- 2026-09-27 01:41 M6a 完成：brickGeometry（參數化方盒加 stud，自己畫描邊）、scene（InstancedMesh 依步驟排序、描邊 drawRange）、Viewer（OrbitControls、render on demand、__legoStats）、結果頁（統計、警告、分頁、找不到頁）、首頁範例卡片；layout 改 zh-Hant-TW、拿掉 Google 字型改系統中文字型（build 不用連外網）。localStorage 讀取改用 useSyncExternalStore（React lint 不准在 effect 裡 setState）。
- 2026-09-27 01:42 M6b 完成：步驟滑桿 e2e、5 張截圖（artifacts/screenshots/m6-*.png）逐張看過，房子、小鴨、跑車、聖誕樹、機器人都認得出來。聖誕樹的裝飾球原本塗在圓錐外面的空格（paint 不會生效），照每層半徑重算位置後 6 顆都看得到。
- 2026-09-27 01:44 M7 完成：snapshot.ts（單一 renderer、正交相機用完整模型定比例、新磚 1.5 mm 固定外擴紅框、縮圖共用 2x8 比例）、useBookletImages（快取、進度）、StepPage（預覽與列印共用）、說明書分頁。截圖 artifacts/screenshots/m7-step1.png、m7-step5.png 看過，紅框清楚。
- 2026-09-27 01:46 M8 完成：列印頁（封面、零件總表每頁 24 格、每步一頁、完成頁、?only=parts）、A4 列印 CSS、useBuildResult 抽成共用 hook。PDF 在 artifacts/booklet-house.pdf。美化待辦：步驟圖是 4:3，放在直式 A4 上方會留白。
- 2026-09-27 01:47 M9 完成：零件清單分頁（表格、窄螢幕卡片、縮圖、LEGO 與 BrickLink 色名、其他 Element ID、四種下載、怎麼買）、useThumbs（只產縮圖，說明書產過就共用）。手機寬度原本溢出 29 px，是 BrickLink 網址不能斷行，加 break-all 修掉。
- 2026-09-27 01:49 M10a 完成：/api/design（422、LLM_MOCK、503、502、200）、llm/prompt（座標、單位、22 色、設計規則、兩個範例）、llm/design（兩次呼叫、170 秒 deadline、品質回饋點名部位、只剩品質問題回 200）、llm/sdk（messages.stream、output_config.format、effort medium、maxRetries 0、max_tokens 32000）、llm/mock。SDK 參數照 node_modules 的型別確認過。沒有 API key，真實呼叫沒測（M11）。
- 2026-09-27 01:51 M10b 完成：DesignForm（尺寸上限、經過秒數、60 秒後換提示、取消、錯誤與再試一次）、requestDesign（FNV-1a hash 當 id、存 localStorage 含 specWarnings）、RedesignButtons（再設計一次、修改描述）、首頁讀 ?prompt=&size= 預填。
- 2026-09-27 01:54 M12 前半：stats.hiddenBricks 與結果頁提示、最近做過的模型（localStorage 索引最多 20 筆）、說明書兩步一頁（layoutStepPages，頁數公式改用排版結果，M8 頁數測試照規格允許的例外一起更新）。另加評估工具 src/llm/eval-specs.test.ts 與 e2e/eval-shots.spec.ts（平常跳過）。
- 2026-09-27 01:55 M12 完成：點子模式（/api/ideas、Sonnet 5 effort low、structured outputs、mock 回固定 3 個；首頁「給我靈感」卡片，點了帶進輸入框）。spec.ts 的 schema 清理開放成 toStructuredSchema，設計和點子共用。
- 2026-09-27 02:00 LLM 代理評估（M11 的替代，不是真實 API）：用 10 個 Opus subagent 拿一字不差的 system prompt 設計 5 個題目各 2 份（恐龍 M、貓 S、城堡 M、飛機 M、花 S）。8/10 一次過品質檢查；2 份分開（貓尾巴、飛機主翼），回饋正確點名部位。10 張截圖全部看過，都認得出是什麼。依結果做了兩件事：(1) 元件橋接（重切相鄰同色磚跨過接縫），隨機 200 個分開數 138→128；(2) 補支撐回饋門檻從 10% 改成超過 4 格或 2%（恐龍 #1 補了 35 格細柱子沒被擋）。產物在 artifacts/llm-proxy/（不進 git）。
- 2026-09-27 02:01 首頁範例卡片加上模型縮圖（DemoGallery，共用一個 Snapshotter 依序產圖）。`pnpm e2e` 18 passed。
- 2026-09-27 02:08 Codex（codex exec 唯讀）審查網頁層與 LLM 串接：6 條都成立並修掉。(1) localStorage 存不進去還是跳結果頁 → 改存記憶體備援並提示；(2) 零件總表 24 格實測超出頁面 213 px 被裁 → 改橫式卡片、每頁 30 格，e2e 改成實際檢查卡片落在頁內；(3) API 的品質警告被丟掉 → 存 apiWarnings 並顯示；(4) SDK timeout 只管到 response header → 每次呼叫自己計時涵蓋整個串流；(5) 窄螢幕取景裁左右 → 取水平與垂直視角較窄者；(6) /api/ideas 收到 null 會丟例外 → 回 422。驗證：`pnpm test` 104 passed、`pnpm e2e` 20 passed、tsc、lint 乾淨。
- 2026-09-27 02:09 說明書步驟圖：縮圖比例照完整模型（每步一致），但相機中心對準已放上去的磚，前幾步不會擠在圖的下方。代理評估的貓 #1 帶回饋重試後修好（1 個元件、0 補支撐）。
- 2026-09-27 02:10 M13 完成：UI 字串檢查、最終截圖、Codex 網頁層審查（6 條修掉）、README、晨間報告。代理評估第二輪：貓 #1、飛機 #2 帶回饋重試後都通過。
- 2026-09-27 10:20 沒有 API key 的替代方案：`src/llm/claude-cli.ts` 用本機 `claude -p`（`--tools ""`、`--setting-sources ""`、`--json-schema`，不能加 `--bare`，它會關掉 OAuth），`.env.local` 設 `LLM_BACKEND=claude-cli` 才啟用。實測小貓 60 秒（2 次呼叫）、點子 7 秒。
- 2026-09-27 11:10 使用者要求「不限數量、要有輪子等非方塊零件、要能看全部零件、說明書要有動畫」。做了：尺寸 L 32×32×24、XL「不限」48×48×40（技術上限，說明書每步一張圖），拿掉 BRICK_LIMITS；ModelSpec 加 `top` 與 `parts`；目錄加 7 個特殊零件（BrickLink 編號之後改由 Rebrickable 對照，67687 的 LDraw 用 4600）；範例跑車換真輪子、房子斜屋頂。零件總覽頁與動畫由 Codex 在 worktree 實作，主線程讀 diff、補跑 e2e 後併回。Codex 唯讀審查找到 3 個 bug（鏡射重複輪子、錐體頂端檢查太早、錐體改圓磚沒查顏色），都先寫測試重現再修。真實 Claude 設計「藍色小卡車」15 秒一次過，自己用了兩組輪子。
- 下一步與卡點：SDK 路徑搭配新 schema 要有 key 才能驗；輪子的 LDraw 位置是從 bbox 推的，還沒在 LDraw 軟體開過；頂面 plate 的區域中間再疊東西容易斷開；輪子只有一種尺寸。
- 2026-09-27 12:16 使用者覺得模型像素感太重，選了 A（用滿尺寸、放寬形狀數）、B（曲面自動斜面）、C（高度改 plate）。另外要大平面用大片 plate、要估價格。做了：格子高度改 plate（整數層的模型結果完全不變，附錄 B 精確磚數照過）；曲面下緣對齊整層、不到一層的補成一層（不然會懸空或散掉）；15 種大 plate；base 底板兩層錯開（全尺寸組合 99% 以上連成一片）；自動斜面放完會驗證，讓模型斷開就換回一般磚；加了價格估算（開源時改成內建的自訂粗估，見 2026-09-28 的紀錄）、匯率 31.76。
- 真實 Claude 同一題（坐著的橘色小貓，大）：改之前 24×20×20、16 形狀、274 塊；A 之後頭沒接上被移除（品質回饋漏報，已修）；A+C 之後 24×24×23、29 形狀、有底板與項圈，920 塊、約 NT$ 3,325。
- 下一步與卡點：弧形斜面零件還沒加（要新零件與新的擺放規則）；plate 細階梯讓零件數大約多三成到一倍；價格只抽黑色、不含運費；底板在很少數尺寸與顏色（橘色系）連不起來。
- 2026-09-27 12:37 使用者要同一個模型分丐版、平民版、旗艦版，並支援先給預算。選了「同一份設計縮放加改做法」（只呼叫 Claude 一次）。做了 src/core/tiers.ts：放大用縮放設計（整數座標保持整數，輪子才對得上），縮小改成縮格子（downsampleGrid，相鄰格子縮完還相鄰）；每版在目標倍數附近找結構乾淨的倍數；fitBudget 從旗艦往下、以 0.05 倍為單位二分搜尋。挖空試過不划算（大塊內部磚換成小磚外殼加支撐，價格幾乎一樣或更貴），沒採用。結果頁有版本卡片、首頁有預算欄位、列印頁吃 ?tier=。
- 價格區間（9 個模型實算）：中型 丐 150–450、平民 300–1,100、旗艦 650–2,400；大型 丐 700–1,700、平民 1,300–3,300、旗艦 3,300–7,000。丐版約平民的三成半到六成，旗艦約兩到三倍。旗艦版 9 個都結構乾淨；丐版 5 個要補幾格支撐或分成幾塊（聖誕樹、小貓）。
- 卡點：丐版在複雜的曲面設計（小貓、聖誕樹）還是可能要補幾格支撐或分成 2 塊；有輪子的模型不能縮小，丐版只便宜一成左右。
- 2026-09-27 13:07 使用者回報馬力歐三個問題：一隻手補了支撐柱、另一隻沒有，左右不對稱；旗艦版只畫出一半；旗艦版不像。原因與修正：(1) 手臂是異色、只從側面貼著上衣，磚扣不到主體，舊流程在底下補支撐柱，而錯縫讓左右剛好一邊扣到一邊沒扣到。新增 attachSideways：把上衣內部相鄰的格子改成手臂顏色並鎖住，磚就會跨進上衣扣住，鏡射的部位兩邊一起改，看得到的格子被改才警告。(2) 切換版本時動畫播放器沒重設，停在上一版的步數，key 加上版本。(3) 縮小用的格子取樣偏一邊，改成 resampleGrid 對稱取樣；最寬不到 16 格的小模型丐版不縮。使用者兩份馬力歐設計（從瀏覽器 localStorage 讀出）三版都是一整塊、0 支撐、截圖左右對稱。
- 重算 11 個模型的三版價格，README 已更新。小模型丐版只便宜 0 到 17%，機器人跟平民版一樣，卡片文字改成直接講一樣。e2e 的預算測試原本用 NT$ 300，聖誕樹丐版不縮以後最低 NT$ 303，改成 400。
- 下一步與卡點：cat-1-A（頭懸空的舊設計）丐版比平民版貴，因為平民版把懸空的頭移除了，設計本身有問題，沒加特例。大型小貓的平民版還是要補 4 到 10 格支撐（平民版不找乾淨倍數，這個跟側面貼附無關，還沒查）。這一輪的改動已 commit。
- 2026-09-27 13:48 使用者問上線是不是只能用 API key。查證 Anthropic 官方文件：未經核准不能讓第三方產品用 claude.ai 登入或訂閱額度，claude-cli 後端只能自己電腦用，上線要用 API key（Console 或 Bedrock、Vertex）。量成本時發現 claude-cli 每次多送約 6.4 萬個 MCP 工具定義 token（馬力歐一次 US$0.65），加 `--strict-mcp-config` 後降到 US$0.074、33 秒（先寫測試再修）。lint、tsc、test 183 passed。
- 下一步與卡點：SDK 路徑仍沒用真的 key 驗收；這次修正還沒 commit。
- 2026-09-28 12:19 準備開源（使用者決定：repo 名 brick-talk、MIT、BrickLink 資料不進 repo、用過濾過的 clone 保留時間線）。BrickLink 條款禁止散布它的資料，所以 data/raw/bricklink/colors.tsv 與 src/core/price.data.json 移出版控（本機檔案保留）。價格改成內建自訂粗估 price.default.json，postinstall 沒有 price.data.json 時複製一份，單元測試用 vitest alias 固定用內建值。build_catalog.py 改用 Rebrickable API 的 external_ids。網站名稱改 Brick Talk，頁尾加 LEGO 商標聲明與 Rebrickable、LDraw 出處。乾淨環境模擬抓到零件總覽頁依賴本機 sqlite，改成沒有資料庫時測試略過。
- 下一步與卡點：commit、建立過濾歷史的 clone、建 GitHub repo 與 push 都要使用者確認。LinkedIn 草稿在當次 scratchpad。
- 2026-09-28 12:29 已公開：https://github.com/aircon-chen/brick-talk（29 個 commit，歷史裡已移除 BrickLink 色表與價格檔）。這個本機 repo 的歷史沒有過濾、commit hash 跟 GitHub 不同，不要從這裡 push；之後改在 GitHub 的 clone 上工作。
- 2026-09-28 13:29 公開前的合規與體驗整理：BrickLink 零件編號與色號改由 Rebrickable API 產生（原本 61 個色號與 63 個零件編號完全相同，另外補上 7 個舊方法對不上名稱的顏色）；README 改成圖文功能介紹（docs/images，截圖用內建估價與原創範例）、加 AI 啟動提示詞（Claude Code agent 在乾淨資料夾實測通過）；新增 Docker 版（預設裝 Claude Code 2.1.283，API key 或 CLAUDE_CODE_OAUTH_TOKEN 自動判斷，只綁 127.0.0.1，第一次啟動自動建零件資料庫；三種模式都實測過）。
- 下一步與卡點：公開 repo 改成單一乾淨 commit 並 force push（等使用者最後確認）；之後在 GitHub clone 上做 LLM 比較頁與 OpenAI 支援。
