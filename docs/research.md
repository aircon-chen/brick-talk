# Brick Talk 研究筆記（2026-09-27）

這份筆記整理做 Brick Talk 需要的外部事實。每一條都標了查證方式。標 `[未驗證]` 的只能當參考，寫進程式或 UI 文案前要再確認。

實作時以這份為準，不要憑印象重查。真的需要新事實，查完補在對應段落，附上來源。

## 1. 零件資料來源

| 事實 | 查證方式 |
|---|---|
| Rebrickable 每天更新 CSV dump，網址格式 `https://cdn.rebrickable.com/media/downloads/<name>.csv.gz` | 2026-09-27 實際下載 9 個檔案成功 |
| 欄位：colors `id,name,rgb,is_trans,num_parts,num_sets,y1,y2`；parts `part_num,name,part_cat_id,part_material`；elements `element_id,part_num,color_id,design_id`；inventory_parts `inventory_id,part_num,color_id,quantity,is_spare,img_url` | 讀本機檔案 |
| 規模：64,664 個零件、275 種顏色、114,315 筆 element ID、76 個零件分類 | `scripts/build_catalog.py` 統計 |
| Rebrickable CSV 沒有任何尺寸或幾何資料，尺寸要從零件名稱解析或從 LDraw 算 | 讀本機檔案 |
| Rebrickable 下載頁原文：「You can use these files for any purpose. If you publish any articles please let us know」。沒有寫要標註來源或限制商用。直接抓頁面會被 Cloudflare 擋，這段來自 2025-03-22 的 Wayback 存檔，2026 年現行條款沒有直接看到 | https://web.archive.org/web/20250323005627/https://rebrickable.com/downloads/ |
| LDraw 零件檔授權是 CC BY 4.0（檔頭 `0 !LICENSE Licensed under CC BY 4.0`） | 直接讀 `3001.dat` |

## 2. 顏色編號：四套系統不相通

同一個顏色在四套系統的編號不一樣。例如黑色：Rebrickable 0、LDraw 0、BrickLink 11、LEGO 26。把 Rebrickable 色號直接塞進 BrickLink XML，整份清單會買錯顏色，而且不會報錯。

- Rebrickable 色號和 LDraw 色碼**大部分**相同，但不是全部。Rebrickable 326 是 Olive Green，LDraw 326 是 Yellowish_Green；Rebrickable 158 在 LDraw 是 Trans_Neon_Red。查證方式：比對 `data/raw/ldraw/LDConfig.ldr`。
- LEGO 官方色號來自 LDConfig.ldr 的 `// LEGOID` 註解，有些顏色有兩個號碼（White 是 `1 / 426`）。
- BrickLink 色號用 Rebrickable API 的 external_ids 對照。BrickLink 的條款不允許散布它網站上的資料，所以不直接取自 BrickLink。
- `palette.json` 的對照只用「名稱完全相同」配對，對不上就留 `null`。22 個 core 色四套編號全部都有。
- 交叉驗證：另一個來源是 Rebrickable 各顏色頁的「External IDs」表（Wayback 存檔，例如 https://web.archive.org/web/20250426155007/https://rebrickable.com/colors/72/dark-bluish-gray/ ）。兩個來源比對 35 個顏色，Rebrickable、BrickLink、LEGO 色號全部一致。
- Rebrickable 的色號會棄用：舊資料裡 Coral 是 353，現在是 1050。每次重建目錄都從最新 colors.csv 重新對照，不要寫死。
- LEGO 官方色名常跟俗稱不同：Green 官方叫 Dark Green，Dark Green 官方叫 Earth Green，Bright Pink 官方叫 Light Purple。

core 色對照（全部查證過）：

| 顏色 | 中文 | Rebrickable | LDraw | BrickLink | LEGO |
|---|---|---|---|---|---|
| Black | 黑色 | 0 | 0 | 11 | 26 |
| Dark Bluish Gray | 深灰色 | 72 | 72 | 85 | 199 |
| Blue | 藍色 | 1 | 1 | 7 | 23 |
| Red | 紅色 | 4 | 4 | 5 | 21 |
| White | 白色 | 15 | 15 | 1 | 1 / 426 |
| Tan | 沙色 | 19 | 19 | 2 | 5 |
| Light Bluish Gray | 淺灰色 | 71 | 71 | 86 | 194 |
| Dark Blue | 深藍色 | 272 | 272 | 63 | 140 / 428 |
| Green | 綠色 | 2 | 2 | 6 | 28 |
| Reddish Brown | 紅棕色 | 70 | 70 | 88 | 192 |
| Yellow | 黃色 | 14 | 14 | 3 | 24 |
| Lime | 萊姆綠 | 27 | 27 | 34 | 119 |
| Medium Azure | 天藍色 | 322 | 322 | 156 | 322 |
| Bright Light Orange | 亮橘黃 | 191 | 191 | 110 | 191 |
| Dark Red | 深紅色 | 320 | 320 | 59 | 154 |
| Dark Orange | 深橘色 | 484 | 484 | 68 | 38 |
| Orange | 橘色 | 25 | 25 | 4 | 106 |
| Medium Nougat | 中牛軋糖色 | 84 | 84 | 150 | 312 |
| Dark Azure | 深天藍 | 321 | 321 | 153 | 321 |
| Dark Turquoise | 深藍綠 | 3 | 3 | 39 | 107 |
| Dark Tan | 深沙色 | 28 | 28 | 69 | 138 |
| Bright Pink | 亮粉紅 | 29 | 29 | 104 | 222 |

中文色名是自訂的，LEGO 沒有官方繁中色名。

## 3. 零件編號

- Rebrickable `part_num` 跟 LDraw 檔名在 palette 的 41 個零件上完全一致。查證方式：逐一請求 `https://library.ldraw.org/library/official/parts/<part>.dat`，41 個都回 200。
- BrickLink 零件編號跟 Rebrickable 不一定相同（例如 Rebrickable 的 `3070b`），一律用 Rebrickable API 的 external_ids 對照。
- Design ID 只代表形狀；Element ID 代表形狀加顏色，是 Pick a Brick 用的購買編號。同一個零件加顏色可能有好幾個 Element ID（改模具或停產後復刻）。例：白色 2x4 磚有 `300101` 和 `6552094`。
- LEGO 沒有公開「這個 Element ID 現在還有沒有在生產」的資料。`palette.json` 的 `recent` 是推估：這個零件加顏色有出現在 2024 年（含）之後發行的套組。

## 4. 幾何與 LDraw

| 事實 | 查證方式 |
|---|---|
| 1 stud 間距 = 8 mm = 20 LDU；1 plate 高 = 3.2 mm = 8 LDU；1 brick 高 = 3 plates = 9.6 mm = 24 LDU；1 LDU 約 0.4 mm | LDraw 規格 https://www.ldraw.org/article/218.html |
| 磚的實際長寬是 `studs × 8 mm − 0.2 mm`（每邊留 0.1 mm）；stud 直徑約 4.8 mm、高約 1.6 到 1.7 mm | 社群量測整理，不是 LEGO 官方文件 |
| LDraw 是右手座標系，**-Y 朝上** | LDraw 規格 |
| 放零件的語法：`1 <color> x y z a b c d e f g h i <file>.dat` | LDraw 規格 |
| `0 STEP` 是步驟分隔，各軟體怎麼解讀由它們自己決定 | LDraw 規格 |
| Brick、plate：原點在磚體頂面的中心（stud 的底部），stud 往 -Y 突出到 -4，brick 底面在 +24，plate 底面在 +8。長邊沿 X 軸，XZ 置中 | 本機遞迴解析 .dat 算 bounding box（`scripts/ldraw_bbox.py`，結果在 `data/catalog/ldraw_bbox.json`） |
| Tile：Y 從 0 到 8，沒有 stud，XZ 置中 | 同上 |
| 斜面磚（3040b、3039、3038、3037、3665、3660）**不置中**：Z 範圍是 −30 到 +10，原點在頂部那排 stud 的中心，斜面往 −Z 延伸 | 同上 |
| 繞 Y 軸轉 90 度的矩陣 `0 0 1 0 1 0 -1 0 0` 會把零件原生的 X 方向轉到世界的 Z 方向。對稱零件方向正負無所謂，斜面磚要實際開檢視器確認 | 數學推導，斜面方向 `[未驗證]` |
| BrickLink Studio 可以匯入 .ldr/.mpd，但社群說匯入後步驟不會保留，要在 Studio 裡重切 | `[未驗證]`，只有第三方文章 |
| three.js 有 `LDrawLoader`（`three/addons/loaders/LDrawLoader.js`），但需要另外準備 LDraw 零件庫檔案。一晚的專案用參數化方塊加圓柱自己畫比較快 | three.js 官方文件 |
| three.js npm 最新版 0.186.1 | npm registry，2026-09 |

## 5. 購買管道

- **BrickLink Wanted List XML**：外層 `<INVENTORY>`，每個零件一個 `<ITEM>`。必填 `ITEMTYPE`（零件是 `P`）與 `ITEMID`（BrickLink 零件編號）。常用選填：`COLOR`（BrickLink 色號）、`MINQTY`、`CONDITION`（`N` 全新、`U` 二手）。**檔案不能有 `<?xml ...?>` 宣告行，否則上傳失敗**。上傳頁：`https://www.bricklink.com/v2/wanted/upload.page`。來源：https://www.bricklink.com/help.asp?helpID=207
- **LEGO Pick a Brick 批次上傳**：CSV 或 JSON，欄位 `elementId`、`quantity`，一次最多 400 種、每種最多 999 個。2024-10 上線時只開放美國、加拿大。來源：https://www.newelementary.com/2024/10/pick-brick-new-upload-feature-now-live.html 。台灣能不能用 `[未驗證]`。CSV 標題列的確切大小寫 `[未驗證]`，要在 lego.com 實測。
- Pick a Brick 分 Bestseller 和 Standard 兩層。2025-08 起美加的 Standard 大量下架。來源：https://www.newelementary.com/2025/08/pick-brick-standard-bricks-service.html
- LEGO 官方客服建議：Pick a Brick 搜不到某個編號，代表編號換過了，去 BrickLink 查新編號。來源：https://www.lego.com/en-us/service/help-topics/article/how-to-find-special-elements
- 台灣實體 Pick a Brick 牆：台北信義的 LEGO Certified Store（2019-12-25 開幕）有。來源：https://candidbricks.com/2019/12/23/taiwans-first-lego-certified-store-opens-25-dec-2019/ 。2026 年現況、台中大遠百那間 `[未驗證]`。
- lego.com/en-tw 有 Pick a Brick 頁面，但能不能下單寄到台灣 `[未驗證]`（直接抓頁面被擋）。
- BrickOwl 可以匯入 BrickLink XML，不用另外做格式。`[未驗證]`，社群說法。
- Rebrickable 的零件清單匯入格式（Part、Color、Quantity）用哪一套色號 `[未驗證]`，兩個來源說法不一。這個專案先不做 Rebrickable 匯出。

## 6. 既有研究與作法

- **BrickGPT（原名 LegoGPT，CMU，ICCV 2025，arXiv 2505.05469）**：微調 LLaMA-3.2-1B，在 20×20×20 格子上逐塊生成。只用 8 種磚：1x1、1x2、1x4、1x6、1x8、2x2、2x4、2x6，全部一個 brick 高。穩定度用 Gurobi 解力平衡，不穩就 rollback。只涵蓋 21 類 ShapeNet 物件（椅子、車等），不是任意創作。程式 MIT，模型與資料集 CC BY 4.0。來源：https://arxiv.org/html/2505.05469v2 、https://github.com/AvaLovelace1/BrickGPT
- BrickGPT 不用 Gurobi 時的退路是連通性檢查：每塊磚要壓在下一層的磚上，整體是一個連通元件。一晚的專案就用這個。
- 傳統 legolization（Testuz 2013、Luo 2015）：體素化、合併成大磚、修補結構、產生步驟。Luo 2015 的目標是所有磚連在一起、磚數越少越好、上下層方向盡量交錯。原文 PDF 被擋，細節來自二手資料。
- BrickLink Studio 的自動分步（Divide into Steps）官方說只適合 stud 朝上的簡單造型。
- LPub3D（GPLv3）是桌面軟體，一晚不整合，只借它的概念：每步一張累積圖、一個零件 callout。
- **本專案實測（2026-09-27，scratchpad 原型）**：照最早的規格（面積優先、縫隙懲罰 4、要求每塊磚正下方有支撐）實作，4 層高的單色實心 box 有 93% 以上會散成好幾塊，因為每層的縫都切在同一條線上；鴨嘴、屋簷這類懸空部位會被補出通到地面的柱子。改成縫隙懲罰 25、錯縫（`z % 4` 是 1 或 2 的層，一排第一塊最長 4、第一排只放 1 格寬）、內部格子不限顏色、支撐改成「連通元件接地」之後，3 層以上的單色 box 2,025 個全部連成一塊，補支撐從 29 格降到 3 格（小鴨）。代價是磚數多 13% 到 33%。細節與參考實作見 `SUPERPROMPT.md` 附錄 B 與 `docs/reference/`。多色模型在不同顏色只從側面相接時仍會分開，要靠 LLM 設計規則避免。

## 7. LLM 產生 3D 造型

- 形狀表示法選 JSON 描述的基本形狀組合（box、ellipsoid、cylinder、cone，加 add／remove／paint、mirror）。不讓 LLM 直接吐 voxel 或磚塊座標，也不執行 LLM 產生的程式碼。理由：LLM 在方向追蹤和多步空間推理上很弱，把座標運算留給確定性程式碼比較可靠。多篇 benchmark 支持這個結論，但細節只看過摘要。
- System prompt 要明講原點、軸向、單位、上限，附 1 到 2 個完整範例。
- 視覺自我批評（渲染截圖丟回模型修正）有效但要多一輪呼叫，列為之後的功能。
- Anthropic API（來源：https://platform.claude.com/docs ，2026-09 查）：
  - Structured outputs 已 GA，參數是 `output_config.format`（`type: "json_schema"` 加 `schema`），不用 beta header。舊的 `output_format` 已棄用。
  - 另一條路是 tool use：工具定義加 `strict: true`，schema 要有 `additionalProperties: false` 和 `required`。
  - TypeScript SDK 是 `@anthropic-ai/sdk`，`client.messages.create({ model, max_tokens, messages })`。
  - 模型與價格（每百萬 token 輸入／輸出）：`claude-opus-5-5` $4／$20；`claude-sonnet-5` $2／$10；`claude-haiku-4-5-20251001` $1／$5。
  - 實作前以 `node_modules/@anthropic-ai/sdk` 的型別定義為準，這份筆記的參數名稱只是起點。
- Structured outputs 的 JSON Schema 限制（https://platform.claude.com/docs/en/build-with-claude/structured-outputs ，2026-09-27 查）：
  - 支援：基本型別、`enum`（只限字串、數字、布林、null）、`const`、`anyOf`、`allOf`（不能配 `$ref`）、`$ref` 與 `$defs`（不能是外部網址）、`required`、`additionalProperties: false`、`minItems` 只能是 0 或 1。
  - 不支援：`oneOf`、`prefixItems`、`minItems` 大於 1、`maxItems`、`minimum`、`maximum`、`multipleOf`、`minLength`、`maxLength`、遞迴 schema。用了會回 400。
  - 同一個 schema 第一次用要先編譯 grammar，會多一段延遲，編譯結果快取 24 小時。
  - 字串 enum 的大小寫不保證，比對時要不分大小寫。
- 實測（zod 4.6.5、`@anthropic-ai/sdk` 0.128.0，scratchpad 內）：
  - `z.tuple` 經 `z.toJSONSchema` 會產生 `prefixItems`、`minItems: 3`、`maxItems: 3`；`z.discriminatedUnion` 會產生 `oneOf`。兩個都不支援。
  - SDK 的 `zodOutputFormat` 遇到 tuple 會直接丟錯 `JSON schema must have a type defined if anyOf/oneOf/allOf are not used`。
  - 改成 `{x, y, z}` 物件後 `zodOutputFormat` 能跑，但它把 `enum`、`const` 搬進 description，顏色就不受 grammar 約束。所以自己寫轉換函式比較好。
- Claude Opus 5.5 的限制（https://platform.claude.com/docs/en/models/opus-5-5/migration-guide ，2026-09-27 查）：
  - thinking 一定會跑，關不掉。`max_tokens` 是 thinking 加回應文字的總上限。
  - 回應開頭可能有一個以上的 `thinking` block，要用 `type === "text"` 找文字，不能用 `content[0].text`。
  - `tool_choice` 只能用 `auto` 或 `none`，強制 `any` 或指定 `tool` 會被拒絕。
  - `temperature`、`top_p`、`top_k` 設成非預設值會被拒絕。結尾放 assistant prefill 會被拒絕。
  - effort 用 `output_config.effort` 設定，預設 `medium`。
- Claude Sonnet 5 的 thinking 是 adaptive（不是一定會跑），預設 effort 是 `high`（models overview 頁）。

## 8. 說明書

- LEGO 說明書從下往上組，每步有零件 callout（縮圖加「2x」），新版用紅色標出新加的零件。版面是客製尺寸，網頁版直接用 A4。
- LDraw 工具常用的預設視角是緯度 30 度、經度 45 度。
- 截圖：整頁只用一個 `WebGLRenderer`，每次 `render()` 之後立刻同步 `toDataURL()`。瀏覽器同時能開的 WebGL context 大約 8 到 16 個，每張縮圖開一個 canvas 會撞到上限。
- 輸出 PDF：HTML 加 `@page { size: A4 }` 加 `break-after: page`，再用 `window.print()`。jsPDF 的 HTML 模式不吃 CSS 分頁，不要用。
