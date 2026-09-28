# Brick Talk Superprompt（v2）

這份檔案分兩部分。第一部分給人看，說明怎麼啟動。第二部分給 Claude Code 看，是一整晚無人值守開發的完整規格。

v2 經過 5 個角度的對抗性審查、一份 Codex 獨立審查，關鍵演算法都在原型上實測過。實測數字寫在附錄 B。

---

## 第一部分：給人看

### 這份 prompt 會做出什麼

一個網頁。使用者輸入想做的東西（例如「一隻紅色的小恐龍」），網頁會：

1. 請 Claude 設計造型，轉成真實存在、近期有生產的 LEGO 零件。
2. 顯示可以轉動的 3D 預覽，有步驟滑桿。
3. 列出零件清單（BOM）：零件尺寸、顏色（中文、BrickLink 名、LEGO 官方名）、Element ID、數量，並匯出 Pick a Brick CSV、BrickLink Wanted List XML、LDraw 檔。
4. 產生一本可以列印成 A4 PDF 的組裝說明書：封面、零件總表、每一步的零件 callout 和組裝圖。也可以只印零件總表，帶去店裡對照。

### 啟動前（10 分鐘）

1. 確認專案目錄已經有這些檔案（今晚之前已經準備好）：
   - `data/catalog/palette.json`：builder 用的 41 種零件乘上顏色，含 element ID 與四套色號對照
   - `data/catalog/lego_catalog.sqlite`：全部 64,664 個零件、275 種顏色、114,315 筆 element ID
   - `docs/research.md`：查證過的外部事實與來源
   - `docs/reference/*.mjs`：實測過的核心演算法參考實作
2. **強烈建議**建立 `.env.local`，內容一行 `ANTHROPIC_API_KEY=...`。沒有 key 也能跑完大部分工作，但 LLM 設計出來的東西像不像，整晚都不會被驗證，早上第一次輸入才知道。
3. **防止睡眠**：接上電源、不要闔上螢幕，另開一個 terminal 跑 `caffeinate -dims`。這台 Mac 用電池時閒置 1 分鐘就會睡，輪與輪之間的 60 秒空檔可能讓整晚停掉。
4. 在專案根目錄開 Claude Code，輸入：

```text
/loop 讀 SUPERPROMPT.md，照「每一輪的流程」做下一個里程碑。
```

不帶時間間隔的 `/loop` 是動態模式，每一輪做完會自己排下一輪，全部完成或全部卡住就停。

### 早上起來看什麼

- `docs/HANDOFF.md` 最上面的「目前狀態」與「晨間報告」：完成了哪些、怎麼跑、測試輸出摘要、卡住的項目。
- `artifacts/screenshots/`：e2e 留下的截圖。`artifacts/booklet-*.pdf`：說明書 PDF。
- `pnpm dev` 之後打開 http://localhost:3000 自己玩。
- 晨間報告的「需要人處理」清單：API key、實際列印、BrickLink 上傳測試等機器做不到的驗收。
- 如果發現停在半夜，看 HANDOFF 的目前狀態，再輸入同一句 `/loop` 就會接著做。

### 已知限制（不是 bug）

- 模型是實心的，BOM 裡有一部分是從外面看不到的磚。
- 不同顏色的部位如果只在側面相接，會變成分開的兩塊。LLM 的設計規則會盡量避免，避免不了會在結果頁警告。
- Pick a Brick CSV 的格式照公開資料做，還沒有在 lego.com 實際上傳過。台灣能不能在 LEGO 官網下單也還沒確認。

---

## 第二部分：給 Claude Code 的規格

以下用「你」稱呼執行這份規格的 agent。

### 0. 這份規格跟你平常的規則怎麼配合

這份規格是使用者對這次 `/loop` 的明確指示。全域 CLAUDE.md 和 autonomous-loop skill 的規則照常適用（繁體中文、commit 不加 trailer、不印 secret、還原工作樹用 `git stash`、兩次失敗就熔斷），以下三點由這份規格明確覆蓋：

1. **接下一輪**：`/loop` 模式下，第 12 節第 8 步用 `ScheduleWakeup` 排下一輪，是使用者授權的排程，不算「自動開下一輪」。每一輪本身仍然只做一個里程碑。如果使用者是直接叫你在目前的 session 開工（沒有 `/loop`），就照同樣的里程碑順序連續做，每個里程碑做完一定先完成第 7 步（commit 加交接）才開下一個，不用 `ScheduleWakeup`。
2. **缺 credential**：今晚可能沒有 API key。缺 key 只讓「需要真實 API 的那一項驗收」標 `BLOCKED-ON-HUMAN`，里程碑其他部分照做、照常勾選，繼續做下去。只有第 15 節列的對外寫入類事情才整個停下。
3. **委派**：使用者授權透過 Herdr 找 Codex、agy 討論設計、review 程式、做驗收。規則：
   - 外部 agent 一律唯讀，工作樹同一時間只有你一個寫入者。
   - 使用者的 `codex` 是 `codex --yolo` 的 alias，不要用它。用 `\codex exec -s read-only --skip-git-repo-check -o <scratch 結果檔> "<讀派工檔>"`，派工內容寫成 markdown 放在 scratch 目錄。
   - 不替使用者回答信任目錄、授權、登入這類詢問。外部 agent 卡住或 20 分鐘沒結果，就記進 HANDOFF 然後繼續，不要等。
   - 外部 agent 的結論要自己查證（讀 diff、跑測試）才採用。
   - Herdr 不能用時，退回 Claude Code 原生 Agent tool 開唯讀 subagent。

### 1. 任務

在 `/Users/aircon/Projects/lego-builder` 做出 Brick Talk 網頁，一個晚上完成 P0 範圍。沒有人可以回答問題。碰到模糊的地方，選最保守、可以回復的做法，把假設寫進 `docs/HANDOFF.md`。

### 2. 完成的定義（早上驗收用）

全部成立才算 P0 完成：

1. `pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e` 全部通過。每一個的實際指令、測試數量、輸出摘要寫進晨間報告。
2. 不用 API key，首頁點 5 個示範模型（房子、小鴨、跑車、聖誕樹、機器人）都能打開結果頁，看得到 3D、BOM、說明書。
3. 5 個示範模型都滿足第 7.8 節全部不變條件。元件數 = 1、補支撐格數 = 0 是目標值（第 10 節），實際數字寫進晨間報告。
4. 有 API key 時：輸入「一隻紅色的小恐龍」、選中尺寸，整個請求 180 秒內回來；截圖用 Read 看得出是恐龍、主色是紅色；實際秒數和 `usage.output_tokens` 寫進晨間報告。沒有 key：這條列進「需要人處理」，晨間報告結論段寫「LLM 產出品質未驗證」。
5. 說明書列印成 A4 PDF：封面、零件總表、每一步一頁。每一步有 callout（縮圖、「磚 2x4・紅色」、數量）和組裝圖，新加的磚有紅框。`?only=parts` 只印零件總表。
6. BrickLink XML 沒有 `<?xml` 宣告行，零件編號和色號都是 BrickLink 的；Pick a Brick CSV 第一行是 `elementId,quantity`。
7. 介面文字全部是台灣繁體中文（白名單見第 14 節）。

### 3. 你手上已經有的東西

- `data/catalog/palette.json`：唯一的零件事實來源，app 只准用這裡面的零件和顏色。欄位見附錄 A。
- `data/catalog/lego_catalog.sqlite`、`parts_all.csv`、`colors_all.csv`：完整零件目錄（使用者要的「把所有零件記錄下來」）。尺寸只從名稱解析出 21,090 / 64,664 個零件，沒有幾何資料，形狀靠名稱、分類與 Rebrickable 圖片網址。app 執行期不讀它們。
- `scripts/build_catalog.py`、`scripts/ldraw_bbox.py`：重建目錄的腳本。`data/raw/` 是原始資料，**唯讀，不准改**。
- `docs/research.md`：色號對照、零件編號差異、LDraw 座標、購買管道格式、Anthropic API 限制。**遇到這些問題先查它，不要憑記憶**。真的要查新東西，查完補進 research.md 並附來源。
- `docs/reference/legolize.mjs`、`docs/reference/support_steps.mjs`：實測過的參考實作。M2、M3 把它們移植成 TypeScript，行為要一致，實測數字在附錄 B。app 不准直接 import 這兩個檔案。`support_steps.mjs` 已經加上「補不到就移除」與「分步漏磚就丟例外」兩道保險（第二輪審查後補的），附錄 B 的數字不受影響。

### 4. 產品規格

#### 4.1 頁面

**首頁 `/`**

- 大輸入框，placeholder「你想用樂高做什麼？例如：一隻紅色的小恐龍」，最多 300 字。
- 尺寸二選一：小（最多約 250 塊）、中（最多約 700 塊），預設中。選項旁邊寫出這個上限。
- 按鈕「開始設計」。生成中顯示經過秒數；超過 60 秒改顯示「還在設計中，大概要 1 到 3 分鐘」；有「取消」按鈕（client 端 `AbortController`）。
- 「看看範例」：5 個示範模型的卡片，點了直接開結果頁，不呼叫 LLM。
- P1：「給我靈感」按鈕、最近做過的模型清單。

**結果頁 `/build/[id]`**

- 標題、一兩句說明、統計：零件總數、零件種類數、成品尺寸（公分，寬 × 深 × 高）、層數、步驟數。
- 警告區：例如「模型會分成 2 塊」「為了支撐懸空的部分，加了 6 格支撐」。沒有警告就不顯示，第一條警告用醒目樣式。
- 兩顆按鈕：「用同一句話再設計一次」、「修改描述」（回首頁並預先填好原本的描述與尺寸）。示範模型不顯示這兩顆。
- 三個分頁：
  - 「3D 預覽」：可以旋轉縮放；下面有步驟滑桿，拉到 N 只顯示第 1 到 N 步的磚。
  - 「零件清單」：BOM 加匯出按鈕和「怎麼買」說明（見 4.3）。
  - 「組裝說明書」：預覽說明書頁面，按鈕「列印／存成 PDF」開 `/build/[id]/print`，按鈕「只印零件清單」開 `/build/[id]/print?only=parts`。
- `id`：示範模型是 `demo-house` 這種固定字串；LLM 生成的是 `b-` 加正規化後 spec JSON 的 8 碼 hash。localStorage 存 `lego-builder:build:<id>`，內容是 `{ spec, prompt, size, specWarnings, createdAt }`。`specWarnings` 是正規化時產生的警告（例如截斷了形狀），重新整理後跟 pipeline 的警告合併去重再顯示。找不到就顯示「找不到這個模型」加回首頁連結。

**列印頁 `/build/[id]/print`**

A4 直式，只有說明書內容，沒有網站外框。所有圖片產生好之後才顯示「列印」按鈕。細節見第 8.4 節。

**API**：`POST /api/design`（第 9 節）、`POST /api/ideas`（P1）。

#### 4.2 明確不做

使用者帳號與資料庫、即時價格與庫存、Technic、人偶、曲面零件、照片轉模型、行動版 AR、部署上線、`git push`、大尺寸（P2）。LDraw 完整零件庫與 `LDrawLoader` 也不做，3D 用參數化幾何自己畫。

#### 4.3 「怎麼買」說明內容

零件清單分頁放一段固定說明，照實講，不要保證一定買得到：

- **樂高授權店的 Pick a Brick 牆**：按「只印零件清單」帶去，照尺寸和顏色挑。牆上的零件種類有限。
- **LEGO.com Pick a Brick**：用 Element ID 搜尋，搜不到代表編號換過，可以去 BrickLink 查新編號。美國、加拿大的 Pick a Brick 有批次上傳功能，匯出的 CSV 照公開資料的格式製作，還沒實測。台灣能不能線上下單還沒確認。
- **BrickLink**：到 Wanted List 上傳頁（`https://www.bricklink.com/v2/wanted/upload.page`）上傳匯出的 XML，再向賣家下單。
- 最後一句：「近期有生產」是根據 2024 年以後的套組推估，實際能不能買以各通路當下頁面為準。

### 5. 技術決策（已定案，不要重新討論）

- Next.js（`create-next-app` 最新穩定版，App Router，`src/`）、TypeScript strict、pnpm、Tailwind CSS。
- 3D：`three`，控制器用 `three/addons/controls/OrbitControls.js`，合併幾何用 `three/addons/utils/BufferGeometryUtils.js`。
- 驗證：`zod`（v4）。LLM：`@anthropic-ai/sdk`，只在 server 端呼叫。
- 測試：`vitest`（單元）、`@playwright/test`（e2e，只裝 chromium）。
- **只准用上面列的套件**，加上 `create-next-app` 自帶的和 `@types/three`。需要別的套件先不要裝，寫進 HANDOFF 的「待決事項」，用標準庫或自己寫繞過去。
- `src/core/` 是純 TypeScript：不 import React、three、DOM、Node API。server 和 client 都能跑，也能直接寫單元測試。
- 所有演算法都是確定性的：同一個 ModelSpec 永遠產生同一組磚、同一組步驟。
- 用到 three.js 的元件放在 `"use client"` 檔案，從頁面用 `next/dynamic(..., { ssr: false })` 載入。
- `package.json` 的 dev、build、start 前面加 `NEXT_TELEMETRY_DISABLED=1`，不要送遙測資料。

目錄結構：

```text
src/
  core/
    palette.ts        載入精簡 palette、查零件與顏色
    palette.data.json 從 data/catalog/palette.json 產生的精簡版（M1a）
    spec.ts           ModelSpec 的 zod schema、normalizeSpec、toApiSchema
    voxelize.ts       ModelSpec → VoxelGrid（含每格來源形狀的 label）
    legolize.ts       VoxelGrid → Brick[]（移植 docs/reference/legolize.mjs）
    support.ts        接地、補支撐、連通元件（移植 docs/reference/support_steps.mjs）
    steps.ts          Brick[] → Step[]（同上）
    bom.ts            Brick[] → BomRow[]，加三種匯出
    ldraw.ts          Brick[] + Step[] → .ldr 文字
    layers.ts         VoxelGrid → 逐層文字俯視圖（除錯與 M5 目視用）
    pipeline.ts       ModelSpec → BuildResult
  fixtures/models/    5 個示範 ModelSpec（JSON）
  llm/
    models.ts         模型 ID 常數
    prompt.ts         system prompt 與範例
    design.ts         designModel(input, { callModel })，含驗證、重試、deadline
  render/
    brickGeometry.ts  依零件產生 BufferGeometry（快取）
    scene.ts          Brick[] → three.js 場景，依步驟排序
    snapshot.ts       共用一個 renderer 產生步驟圖與零件縮圖
  app/                Next.js 頁面與 API route
scripts/              既有的 Python 腳本，加 build_palette_data.mjs
e2e/                  Playwright 測試
```

### 6. 資料格式

#### 6.1 座標系統（全專案共用）

- 格子座標 `(x, y, z)`，都是非負整數。
- `x`：左到右，單位 stud（8 mm）。`y`：前到後，單位 stud，`y = 0` 是正面，面對觀看者。`z`：下到上，單位 brick 層（9.6 mm），`z = 0` 貼著地面。
- 格子 `(x, y, z)` 占的空間是 `[x, x+1) × [y, y+1) × [z, z+1)`。一格寬深 8 mm、高 9.6 mm，高是寬的 1.2 倍。
- three.js（Y 朝上、+Z 朝向觀看者，單位 mm）：磚的中心是 `((x + w/2)·8, z·9.6 + 4.8, −(y + d/2)·8)`。`BufferGeometry` 以磚體中心為原點、長邊沿 X；磚的 `w`（x 方向長度）不等於零件的 `ldraw.studs_x` 時，instance 繞 Y 轉 90 度。stud 在磚體上方 `+4.8` 到 `+6.5`。
- LDraw（-Y 朝上，單位 LDU）：見 7.6。
- 兩個轉換的矩陣行列式都是 +1，是正常旋轉，不是鏡像。

#### 6.2 ModelSpec（LLM 的輸出格式，也是示範模型的格式）

```ts
type Vec3 = { x: number; y: number; z: number };
type ColorName = /* palette 裡 tier === "core" 的 22 個英文色名，例如 "Red"、"Dark Bluish Gray" */;
type Common = {
  op: "add" | "remove" | "paint";
  color: ColorName;              // 一律必填；remove 會忽略它
  label: string;                 // 繁中部位名稱，例如「左耳」，品質回饋會用到
  mirror: "none" | "x" | "y";    // 一律必填，不鏡射就填 "none"
};
type Shape = Common & (
  | { shape: "box"; min: Vec3; max: Vec3 }                 // 格子座標，max 不含：{0,0,0}→{4,2,1} 剛好 4×2×1 格
  | { shape: "ellipsoid"; center: Vec3; radius: Vec3 }     // center 是格子座標，radius 三軸都用 stud
  | { shape: "cylinder"; axis: "x" | "y" | "z"; center: Vec3; from: number; to: number;
      radius: number; radiusEnd: number }                  // center 的 axis 分量不看；from/to 是 axis 方向的格子座標，to 不含；
                                                           // radius、radiusEnd 用 stud，直圓柱兩個填一樣
  | { shape: "cells"; cells: Vec3[] }                      // 整數格子索引，單格細節（眼睛、鈕扣），最多 64 格
);
type ModelSpec = {
  version: 1;
  title: string;      // 繁中，20 字內
  summary: string;    // 繁中，一兩句
  size: Vec3;         // x = W（stud）、y = D（stud）、z = H（層）
  shapes: Shape[];    // 1 到 80 個，依序套用
};
```

**單位規則，一句話講完**：位置（`min`、`max`、`center`、`from`、`to`、`cells`、`size`）用格子座標，z 是層；長度（`radius`、`radiusEnd`）一律用 stud，程式自己把 z 方向換算成層。所以正球體就是 `radius: {x: r, y: r, z: r}`，LLM 不用自己除 1.2。

語意：

- 依陣列順序套用。`add` 把形狀內的格子填成 `color`（覆蓋原本的顏色）；`remove` 清空；`paint` 只改已經有東西的格子。
- 格子 `(i, j, k)` 在形狀內的條件看格子中心 `p = (i+0.5, j+0.5, k+0.5)`：
  - box：每一軸 `min ≤ p < max`。
  - ellipsoid：`((px−cx)/rx)² + ((py−cy)/ry)² + ((pz−cz)·1.2/rz)² ≤ 1`。
  - cylinder：沿 axis 的座標 `t` 要在 `[from, to)`；半徑 `r = radius + (radiusEnd − radius)·(t − from)/(to − from)`；另外兩軸的距離平方和 `≤ r²`，其中 z 方向的差要先乘 1.2。
  - cells：整數座標完全相等。
- `mirror` 在格子層級做：原形狀蓋到 `(i, j, k)`，`"x"` 就再蓋 `(W−1−i, j, k)`，`"y"` 就再蓋 `(i, D−1−j, k)`。對所有形狀都正確，不要去改形狀參數。
- 每個形狀先算 bounding box（z 方向的半徑要除以 1.2 換成層），**跟格子範圍取交集之後**才掃描。超出 `size` 的部分直接不掃，產生警告。曲面（ellipsoid、cylinder）的邊緣本來就會稍微超出，側面或頂部超出 1 格以上才警告；底部被地面切掉不警告，這是做平底的常用方式。
- 體素化同時記錄每一格最後是被哪個形狀設定的（`labelIndex`），品質回饋要用。
- 尺寸上限：小 `12 × 12 × 10`、中 `20 × 20 × 14`。
- 驗證分兩層：
  - **結構錯誤**（缺欄位、型別錯、enum 不合）：這份 spec 不能用，LLM 流程會重試。
  - **修得回來的**：修正後加一條警告，不重試。色名 trim 後不分大小寫比對（用 `z.preprocess`）；`title` 超過 20 字截斷；`shapes` 超過 80、`cells` 超過 64 截斷；`cells` 與 `size` 取整數（`center` 等其他座標可以是小數，不取整）；box 某軸 `min > max` 就對調、體積 0 就丟掉；cylinder `from > to` 時 from／to 和 radius／radiusEnd 一起對調（不然圓錐會上下顛倒），負的半徑 clamp 成 0，`max(radius, radiusEnd) ≤ 0` 才丟掉（`radiusEnd = 0` 是圓錐，要保留）；ellipsoid 任一軸半徑 ≤ 0 就丟掉；完全落在格子外的形狀丟掉。
- `normalizeSpec(spec, sizeTier)` 放在 `src/core/spec.ts`，做上面「修得回來的」全部修正，並把 `size` clamp 到尺寸上限。server 回傳的是正規化後的 spec，client 與 localStorage 都只存這份。

#### 6.3 給 API 的 JSON Schema

Structured outputs 不支援 `oneOf`、`prefixItems`、`minItems` 大於 1、`maxItems`、`minimum`、`maximum`、`minLength`、`maxLength`、`multipleOf`，用了會 400（research.md 第 7 節）。SDK 的 `zodOutputFormat` 遇到 tuple 會直接丟錯，而且會把 `enum` 搬進 description，所以**不要用它**。

`src/core/spec.ts` 寫 `toApiSchema()`：拿 `z.toJSONSchema(ModelSpecSchema)` 的結果做轉換：刪 `$schema`；`oneOf` 改 `anyOf`；刪上面列的不支援關鍵字（`minItems` 只留 0 和 1）；保留 `enum`、`const`、`$ref`、`$defs`；每個 object 都要有 `additionalProperties: false`。這支函式一定要有離線單元測試：序列化後不能出現任何不支援關鍵字；所有 property 都在 `required` 裡（這份 schema 沒有 optional 欄位）。

#### 6.4 中間與輸出型別

```ts
type VoxelGrid = { size: [number, number, number]; cells: Int16Array; labelIndex: Int16Array };
// index = x + W*(y + D*z)；cells 的值是 Rebrickable 色號，-1 是空；labelIndex 指向 spec.shapes 的索引

type Brick = {
  id: number;          // 依 (z, y, x) 排序後編號，從 0 開始
  partNum: string;     // palette 的 part_num，例如 "3001"
  colorId: number;     // Rebrickable 色號
  x: number; y: number; z: number;  // 占用範圍的最小角
  w: number;           // x 方向 stud 數
  d: number;           // y 方向 stud 數
};

type Step = {
  index: number;       // 從 1 開始；滑桿拉到 N 就顯示 index ≤ N 的步驟
  hanging: boolean;    // 這一步的磚是從下方扣到上面的磚
  brickIds: number[];
  parts: { partNum: string; colorId: number; qty: number }[];
};

type BomRow = {
  partNum: string; bricklinkPartId: string; partName: string; partNameZh: string;
  colorId: number; colorName: string; colorNameZh: string; legoColorName: string; rgb: string;
  bricklinkColorId: number; ldrawColor: number;   // core 色一定有值；palette 型別本身要允許 null
  elementIds: string[]; primaryElementId: string; qty: number;
};

type BuildResult = {
  spec: ModelSpec; grid: VoxelGrid; bricks: Brick[]; steps: Step[]; bom: BomRow[]; warnings: string[];
  stats: { bricks: number; partTypes: number; layers: number; steps: number; sizeCm: [number, number, number];
           components: number; supportCellsAdded: number; floatingCellsRemoved: number; ungroundedCellsRemoved: number };
};
```

- `grid` 是修補後（移除懸空島、補支撐之後）的版本，不變條件 1 要用。
- `partNameZh`：brick「磚」、plate「薄板」、tile「平滑板」、slope45「45 度斜面磚」、slope45_inv「45 度倒斜面磚」，加上 `studs_w x studs_l`（跟英文名稱順序一致），例如「磚 2x4」。
- 顏色顯示成「綠色（LEGO：Dark Green）」這種格式。LEGO 官方色名常跟俗稱不同，Green 官方叫 Dark Green，不寫清楚使用者會在官網挑錯。

### 7. 演算法規格

#### 7.1 palette 精簡（M1a）

`scripts/build_palette_data.mjs`（Node 標準庫）從 `data/catalog/palette.json` 產生 `src/core/palette.data.json`，`pnpm palette` 跑它：

- 顏色只留 `core` 與 `extended`，欄位：`rebrickable_id, name, name_zh, rgb, is_trans, tier, bricklink_id, ldraw_code, lego_color_name`。P0 生成只用 core。
- 零件欄位：`part_num, bricklink_part_id, name, kind, studs_w, studs_l, height_plates, has_studs, ldraw`。
- 零件底下的顏色組合只留 `recent === true`、而且顏色在上面清單裡的，欄位：`color_id, element_ids`。所以「組合存在」就代表「近期有生產」。
- `JSON.stringify` 不縮排。實測約 87 KB，上限 100 KB。**不准為了檔案大小刪 `element_ids`**。
- `studs_w × studs_l` 是名稱上的尺寸順序，只拿來顯示。擺放方向一律看 `ldraw.studs_x`、`ldraw.studs_z`。

#### 7.2 體素化 `voxelize.ts`

照 6.2 實作。只掃「bounding box 跟格子範圍的交集」，不要先掃再丟。

#### 7.3 移除懸空島

以面相鄰（6 個方向）找連通元件，沒有任何格子在 `z = 0` 的整塊移除，警告「移除了 N 格懸空的部分」，數量記進 `stats.floatingCellsRemoved`。

#### 7.4 合併成磚 `legolize.ts`（P0 只用 brick）

移植 `docs/reference/legolize.mjs`，行為要跟它完全一致。重點：

- 可用尺寸：kind 為 brick、這個顏色在 palette.data.json 有組合的零件。依面積由大到小，同面積照 palette 零件順序；每個零件先放長邊沿 x 的方向，再放轉 90 度的（正方形只放一次）。
- 偶數層長邊偏好沿 x，奇數層偏好沿 y，掃描順序跟著偏好方向。
- 每格以自己為最小角挑候選，分數 = `10·面積 + 6·(壓到的下層磚數) − 25·(跟下層磚縫對齊的邊數) + 2·(方向符合偏好) − 1000·(z > 0 且底下全空)`。
- **錯縫**：`z % 4` 是 1 或 2 的層，一排的第一塊磚長邊最長 4，第一排只放 1 格寬的磚。這條讓上下層的縫錯開，實測是模型不會散開的關鍵。
- **內部格子**：6 個鄰居都有東西的格子外面看不到，任何顏色的磚都可以蓋它，磚的顏色以錨點格為準。這讓不同顏色的區域可以從內部連起來。
- 22 個 core 色都有近期生產的 1x1 磚，一定能完全覆蓋。但不是每個顏色都有全部尺寸，這是資料本來就這樣：

| 缺少的近期 brick 尺寸 | 顏色 |
|---|---|
| 2x8 | Green、Lime、Medium Azure、Bright Light Orange、Dark Red、Dark Orange、Orange、Medium Nougat、Dark Azure、Dark Turquoise、Dark Tan |
| 1x8 | Lime、Medium Azure、Bright Light Orange、Dark Red、Orange、Dark Azure、Dark Tan、Bright Pink |
| 2x3 | Medium Azure、Bright Light Orange、Dark Red、Medium Nougat、Dark Azure、Dark Turquoise、Dark Tan |
| 1x3 | Dark Tan |
| 1x6 | Bright Pink |

Black、Dark Bluish Gray、Blue、Red、White、Tan、Light Bluish Gray、Dark Blue、Reddish Brown、Yellow 這 10 色 11 種尺寸都有。**測試要驗特定尺寸時用 Red 或 Black**。

#### 7.5 接地與補支撐 `support.ts`

移植 `docs/reference/support_steps.mjs` 的 `adjacency`、`groundedComponents`、`buildWithSupport`。

- 磚與磚相連：相鄰兩層、平面投影有重疊。上下兩個方向都算，所以從上方扣住的磚也算連著。
- **接地**：磚所在的連通元件裡有 `z = 0` 的磚。不要求每塊磚正下方都有東西。
- 補支撐只處理沒接地的元件：在它最低那層、往下離既有結構最近的格子底下，補同色格子到碰到東西或 `z = 0`（含），然後整個模型重新合併。一直補到全部接地，或某一輪完全沒補到新格子，上限 8 輪。補的格數記進 `stats.supportCellsAdded`，警告「為了支撐懸空的部分，加了 N 格支撐」。
- 補完還有沒接地的元件（柱子往下撞到另一個也沒接地的部位時會發生），就把它的格子整塊移除再重新合併，最多重複 3 次。移除的格數記進 `stats.ungroundedCellsRemoved`，警告「有 N 格無法接到地面，已移除」。這樣「每塊磚都接地」由結構保證。
- `makeSteps` 結束時如果還有磚沒排進步驟，直接丟例外，不要默默漏掉。
- 元件橋接（實作時加的，參考實作沒有）：補支撐之後如果還分成多塊，找同一層、同顏色、相鄰、屬於不同元件的兩塊磚，把它們當成一條長條重新切成幾塊，其中一塊盡量長、跨過原本的接縫；元件數有下降才保留。只在元件數大於 1 時動作，所以附錄 B 的單色 box 數字不受影響。200 個隨機模型的分開數從 138 降到 128；異色部位只從側面相接的情況救不了，還是要靠設計規則與品質回饋。
- 元件數大於 1，警告「模型會分成 N 塊」。
- 不做力學模擬。

#### 7.6 LDraw 匯出 `ldraw.ts`

```text
0 <title>
0 Name: model.ldr
0 Author: Brick Talk
1 <ldraw_code> <X> <Y> <Z> <a b c d e f g h i> <part_num>.dat
...
0 STEP
```

- 每一步的磚寫完接一行 `0 STEP`。
- brick 的原點在磚體頂面中心、長邊沿 LDraw X、XZ 置中：`X = (x + w/2)·20`、`Z = (y + d/2)·20`、`Y = −(z + 1)·24`。
- 磚的 `w` 等於零件的 `ldraw.studs_x` 就用 `1 0 0 0 1 0 0 0 1`；不相等就用 `0 0 1 0 1 0 -1 0 0`（繞 Y 轉 90 度）。
- 色碼用 palette 的 `ldraw_code`，是 `null` 就跳過那塊並警告。
- 一塊紅色 3001 放在原點（w=4、d=2）：`1 4 40 -24 20 1 0 0 0 1 0 0 0 1 3001.dat`；同一塊沿 y 放（w=2、d=4）：`1 4 20 -24 40 0 0 1 0 1 0 -1 0 0 3001.dat`。兩行都要寫成測試。

#### 7.7 分步 `steps.ts`

移植 `docs/reference/support_steps.mjs` 的 `makeSteps`：

- 一層一層往上。先放「下面有已放的磚撐著」的磚。放完一層，再把「上面已經有磚、可以從下方扣上去」的吊掛磚放進去，重複到沒有新的可放。
- 一步最多 8 塊、最多 4 種「零件加顏色」。吊掛磚自成一步，`hanging: true`，說明書在這一步加一行「這一步的零件從下方扣上」。
- `index` 從 1 開始。

#### 7.8 不變條件

每個示範模型和隨機測試都要驗：

1. 磚之間不重疊；磚覆蓋的格子剛好等於 `grid` 裡有東西的格子；**表面格子**（至少一個鄰居是空的）的顏色等於磚的顏色。
2. 每塊磚的 `partNum + colorId` 存在於 `palette.data.json`。
3. 每塊磚都接地（7.5 的定義），補支撐之後沒有例外。
4. 每塊磚剛好出現在一個 step。依 step 順序放時，每塊磚放下去那一刻，至少碰到一塊更早放的磚（上或下），或是在 `z = 0`。
5. BOM 數量加總等於磚數；每列都有 `primaryElementId`、`bricklinkColorId`、`ldrawColor`。
6. 同一個 ModelSpec 跑兩次，輸出完全一樣。

連通性的驗收（數字來自附錄 B 的實測，移植正確就會一樣）：

- 單色實心 box，`W`、`D` 從 2 到 16、`H` 為 3、4、6，顏色 Red、Green、Dark Tan，共 2,025 個，元件數全部是 1。
- 16×1×6 Red 牆、12×12×4 Red、32×32×20 Red 與 Green、20×20×14 Dark Tan，元件數都是 1。
- 固定種子隨機產生 200 個 ModelSpec（地面一塊 box 加 4 個隨機顏色的 box 或 ellipsoid）：1、2、3、4、6 全部成立（5 在 M4 補驗）。元件數大於 1 的比例寫進 HANDOFF 當紀錄，不設門檻。這個比例跟產生器的寫法關係很大（原型約 34%，別種寫法可能 60% 以上），**不要拿它判斷移植對不對**，移植對不對只看單色 box 表和指定形狀這兩組。

#### 7.9 BOM 與匯出 `bom.ts`

- 依 `(partNum, colorId)` 分組。排序：kind（brick、plate、tile、slope45、slope45_inv）→ 面積由大到小 → 色名。
- `primaryElementId`：`element_ids` 裡**數值**最大的那個（要用數字比，字串比會選錯：palette 裡有 5、6、7 碼混在一起）。這是推估，UI 把其他編號也列出來。
- 三種匯出都從同一份 `BomRow[]` 產生：
  - `bom.csv`：UTF-8 加 BOM（Excel 開才不會亂碼）。欄位：零件、顏色、LEGO 色名、數量、Element ID、BrickLink 零件編號、BrickLink 色號。
  - `pick-a-brick.csv`：第一行 `elementId,quantity`，之後每列一個 `primaryElementId`。超過 400 列就警告。
  - `bricklink-wanted.xml`：

```xml
<INVENTORY>
<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>5</COLOR><MINQTY>12</MINQTY><CONDITION>N</CONDITION></ITEM>
</INVENTORY>
```

    不能有 `<?xml` 宣告行。`ITEMID` 用 `bricklinkPartId`，`COLOR` 用 `bricklinkColorId`。
- 「下載 LDraw 檔（進階）」匯出 7.6 的 `.ldr`，旁邊註明「可以用 BrickLink Studio 或 LeoCAD 打開，步驟可能不會保留」。

### 8. 3D 渲染與說明書

#### 8.1 幾何 `brickGeometry.ts`

- 每種零件產生一次 `BufferGeometry` 並快取，原點在磚體中心、長邊沿 X。盒子 `(studs·8 − 0.2) × 高 × (studs·8 − 0.2)` mm，頂面每個 stud 一個圓柱（半徑 2.4、高 1.7、16 段），用 `mergeGeometries` 合成一個。
- 材質 `MeshStandardMaterial`，顏色用 palette 的 `rgb`。
- 3D 預覽用 `InstancedMesh`，每種「零件加顏色」一個，**instance 依 step 順序排**。滑桿拉到 N 時，每個 mesh 的 `count` 設成它在第 N 步為止的數量。
- 描邊：整個場景的邊線合成一個 `LineSegments`（`EdgesGeometry` 門檻 30 度，深灰），**也依 step 順序排**，用 `geometry.setDrawRange(0, edgeEnd[N])` 跟著滑桿。

#### 8.2 3D 預覽

- `PerspectiveCamera` 視角 35 度、`OrbitControls`。初始從正面偏右上看：方位角 45 度、仰角 30 度，自動框住整個模型。
- 每次 render 後更新 `window.__legoStats = { bricksRendered, step }`，e2e 用。
- 元件卸載時 `dispose` 所有 geometry、material、renderer。

#### 8.3 截圖 `snapshot.ts`

- 整頁只建立一個 `WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })`，不掛到畫面上。每次 `render()` 完立刻 `toDataURL("image/png")`。瀏覽器同時能開的 WebGL context 只有 8 到 16 個，每張圖開一個會壞掉。
- 步驟圖：`OrthographicCamera`，方位角 45 度、仰角 30 度，用**完整模型**的 bounding box 決定一次縮放，每一步都用同一個縮放。1200 × 900，白色背景。
- 新磚紅框：在新磚外面加一個**每邊固定外擴 1.5 mm**（不是按比例放大）、以磚中心為原點、涵蓋磚體加 stud 高度的方盒，材質 `MeshBasicMaterial({ color: "#E3000B", side: BackSide })`。以 1200 × 900 框住中尺寸模型約 4.5 px/mm，紅框大約 6 px。
- 零件縮圖：256 × 256，每種「零件加顏色」一張，**所有縮圖共用同一個 mm/px 比例**（以 2x8 磚剛好框滿為準，小零件留白）。這樣 1x6 和 1x8 印出來看得出長短。快取成 `Map<string, string>`。
- 分批產圖，每張之間 `await` 一次，顯示進度「產生說明書圖片 12 / 40」。headless 是軟體算圖，很慢，e2e timeout 要放寬。

#### 8.4 說明書版面（列印頁）

- CSS：`@page { size: A4; margin: 10mm }`，每頁 `.page { break-after: page }`，列印時隱藏按鈕與網站外框。
- 封面：標題、完整模型大圖、零件總數、成品尺寸（公分）、日期、「由 Brick Talk 產生」。
- 零件總表：每頁 24 格（4 × 6）。每格：縮圖、「12x」、「磚 1x6」、顏色「深紅色（LEGO：New Dark Red）」、Element ID。
- 步驟頁：一頁一步。左上角大字步驟編號；上方淺藍底（`#D6EAF8`）callout 框，每個零件：縮圖、「2x」、小字「磚 1x6・深紅色」；下方是步驟圖。吊掛步驟加一行「這一步的零件從下方扣上」。
- 最後一頁：完成圖，兩個角度（正面偏右、背面偏左）。
- `?only=parts`：只印零件總表。
- 總頁數 = 1 + ceil(零件種類數 / 24) + 步驟數 + 1。
- P1：新零件少於等於 3 塊的步驟，兩步排一頁。

### 9. LLM 整合

#### 9.1 呼叫方式（以已安裝 SDK 的型別為準）

- `src/llm/models.ts`：`DESIGN_MODEL = "claude-opus-5-5"`、`IDEAS_MODEL = "claude-sonnet-5"`。
- 寫之前先看 `node_modules/@anthropic-ai/sdk` 的型別，確認 `output_config` 的欄位與 `messages.stream` 的用法。參數以已安裝的 SDK 為準。
- 設計呼叫：

```ts
const stream = client.messages.stream(
  {
    model: DESIGN_MODEL,
    max_tokens: 32000,                      // thinking 也算在裡面
    system: SYSTEM_PROMPT,
    messages,
    output_config: { effort: "medium", format: { type: "json_schema", schema: toApiSchema() } },
  },
  { signal, timeout: remainingMs },         // timeout 單位是毫秒
);
const msg = await stream.finalMessage();
const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
```

- claude-opus-5-5 的限制（research.md 第 7 節，官方遷移指南）：thinking 一定會跑、算在 `max_tokens` 裡；回應開頭可能是 thinking block，**一定要用 `type` 找 text，不能用 `content[0]`**；`tool_choice` 只能 `auto` 或 `none`；不要設 `temperature`、`top_p`、`top_k`；結尾不能放 assistant prefill。所以**不要做 tool use 退路**。
- client 建立時 `maxRetries: 0`，重試只由 9.2 控制。
- `stop_reason === "max_tokens"`：下一次請它把形狀數量減半。`stop_reason === "refusal"`：直接回 502。
- API key 只從 `process.env.ANTHROPIC_API_KEY` 讀，不寫進 log、錯誤訊息或 commit。
- `design.ts` 匯出 `designModel(input, { callModel })`，`callModel` 預設包 SDK，測試時傳入假的實作。假實作回的 message 第一個 block 要放 `{ type: "thinking", thinking: "" }`，讓測試跟真實回應同樣形狀。

#### 9.2 流程 `POST /api/design`

1. 驗證輸入：`prompt` 1 到 300 字、`size` 是 `S | M`，不合法回 422。
2. `LLM_MOCK=1`：依關鍵字（房子、鴨、車、樹、機器人）回對應的示範模型，都沒中就回房子。
3. 沒有 API key：回 503，訊息「還沒設定 API key，可以先看範例模型」。
4. 整個請求共用 170 秒 deadline（`AbortController`）。第一次呼叫 timeout 取 120 秒和剩餘時間的較小值；剩不到 40 秒就不再呼叫。含第一次，最多 2 次呼叫。
5. 結構錯誤：把 zod 錯誤附在對話後面再呼叫一次。
6. 結構正確：`normalizeSpec` → server 端跑 `pipeline` → 品質檢查。以下任一成立，而且還有呼叫額度和時間，就把具體問題附上再給 LLM 一次機會：
   - 格子數為 0；移除的懸空格超過總數 40%；磚數超過上限（小 250、中 700）。
   - 元件數大於 1：用 `labelIndex` 找出每個非主要元件包含哪些部位，回饋「『左翅膀』『尾巴』跟主體沒有連在一起，請讓它們跟身體上下重疊至少 1 層」。
   - 補支撐格數超過 4 格或總格數的 2%，或有格子因為接不到地面被移除：同樣列出相關的部位。（原本訂 10%，代理評估時恐龍補了 35 格細柱子沒被擋下來，所以調嚴。）
7. 成功：回 200 `{ spec, specWarnings, warnings }`。`spec` 是正規化後的版本，`specWarnings` 是正規化產生的警告（client 存進 localStorage），`warnings` 是 pipeline 與品質檢查的警告。
8. 額度或時間用完時：結構仍然錯誤、格子數為 0、refusal、deadline 到了，回 502 `{ error: "design_failed", message, details }`，`message` 是給使用者看的中文，**不准回傳空模型當成功**；只剩品質問題（元件數、支撐、磚數），回 200 並把那條問題放在 warnings 第一條。
9. Anthropic 回 429 或 5xx：回 502，訊息「Claude 暫時忙碌，請稍後再試」。
10. client 收到錯誤：顯示訊息、保留輸入、「再試一次」按鈕，下面列範例模型。錯誤結果不寫進 localStorage。

#### 9.3 System prompt 要點（`prompt.ts`）

- 角色：LEGO 設計師，用基本形狀組出使用者要的東西，模型要能用真實零件組起來、拿起來不會散。
- 講清楚 6.1 的座標和 6.2 的單位規則：「y = 0 是正面」「位置用格子座標，z 是層；半徑一律用 stud，程式會自己換算高度」。
- 列出 22 個可用顏色（英文名加中文名）與這次尺寸的上限。
- 設計規則：
  - 先用大形狀抓整體比例，再加細節。左右對稱的東西用 `mirror`。
  - 每個部位至少 2 stud 寬、**至少 2 層厚**。只有 1 層的東西用磚扣不起來。
  - **不同顏色的部位要跟主體上下重疊至少 1 層**，不能只從側面貼上去，不然組起來會分成兩塊。例如手臂最上面一層往身體裡延伸 1 到 2 格。
  - 懸空超過 2 格的部分要有東西撐；底部要平貼 `z = 0`。
  - 眼睛、鈕扣這種單格細節用 `cells`，放在已經有東西的格子上用 `paint` 最安全。
- 附 2 個完整範例（直接用 `src/fixtures/models/` 的房子和小鴨）。
- `title` 和 `summary` 用台灣繁體中文。

#### 9.4 Mock 模式與 e2e

- `LLM_MOCK=1` 時 `/api/design` 照 9.2 第 2 步回 fixture；`/api/ideas` 回固定 3 個點子。
- e2e 一律跑在 mock 模式，測試過程不打任何外部網路。

#### 9.5 點子模式（P1）

`POST /api/ideas` 用 `IDEAS_MODEL`（`output_config.effort: "low"`），回 3 個 `{ title, pitch, size, colors }`，`pitch` 一句話。首頁顯示成卡片，點了把 `title + pitch` 帶進輸入框。

### 10. 示範模型（M5）

在 `src/fixtures/models/` 手寫 5 個 ModelSpec：`house`、`duck`、`car`、`tree`、`robot`。

- 只用 core 色，尺寸小或中，照 9.3 的設計規則。
- 每個都要通過 7.8 全部不變條件（硬性，M5 的驗收）。
- 目標是**元件數 = 1、補支撐格數 = 0**。照 9.3 的設計規則多半做得到，但這是創作，做不到時不要卡住：每個模型最多調 3 次，還是做不到就把數字記進 HANDOFF，繼續下一個里程碑。M6b 有 3D 可以看之後還能再改。
- `layers.ts` 把 VoxelGrid 逐層印成文字俯視圖：每個 core 色一個字元（對照表印在檔案開頭），空格是 `.`，每層從後排（y 大）印到前排，最前排在最下面。M5 的測試把 5 個模型的俯視圖寫到 `artifacts/layers/<id>.txt`，用 Read 逐層看輪廓對不對。
- 到 M6b 有 3D 之後再截圖目視。**M6b 可以修改 `src/fixtures/models/`**，這是明確允許的例外。
- 這 5 個同時是 demo、測試資料、system prompt 範例，品質要顧。

### 11. 里程碑

每個里程碑是一輪的工作量，diff 控制在 400 行左右（lockfile、scaffold 產生的檔案、fixture JSON、`palette.data.json` 不算）。

| # | 內容 | 依賴 | 驗收 | 級別 |
|---|---|---|---|---|
| M0 | 第 13 節的步驟：git、scaffold、套件、測試設定、專案檔案 | 無 | `pnpm build && pnpm test && pnpm e2e` 通過；e2e smoke test 驗證 `canvas.getContext("webgl2")` 不是 null | P0 |
| M1a | `build_palette_data.mjs`、`palette.ts`、`spec.ts`（schema、normalizeSpec、toApiSchema） | M0 | `pnpm test`：core 色 22 個；toApiSchema 沒有不支援關鍵字、沒有 optional；normalizeSpec 每條修正各一個測試 | P0 |
| M1b | `voxelize.ts`（含 labelIndex）、懸空島移除、`layers.ts` | M1a | `pnpm test`：四種形狀、三種 op、mirror（W=16、cells {0,0,0} → (15,0,0)）、半徑單位（radius {3,3,3}：center z = 5 時 z 方向 4 層，center z = 5.5 時 5 層；x 方向 6 格）、bounding box 交集 | P0 |
| M2 | `legolize.ts`（移植參考實作），加上 `support.ts` 裡算元件數用的 `adjacency`、`groundedComponents` | M1b | `pnpm test`：不變條件 1、2；Red 8×2×1 剛好一塊 3007；7.8 連通性驗收的單色 box 與指定形狀全部元件數 1 | P0 |
| M3 | `support.ts` 的補支撐、`steps.ts`、`pipeline.ts`（BOM 欄位先留空陣列，M4 接上）、200 個隨機模型測試 | M2 | `pnpm test`：不變條件 3、4、6；隨機測試 1、2、3、4、6 成立，元件數大於 1 的比例寫進 HANDOFF | P0 |
| M4 | `bom.ts`（三種匯出）、`ldraw.ts`，pipeline 接上 BOM | M3 | `pnpm test`：不變條件 5（含隨機測試）；XML 沒有宣告行；7.6 的兩行 LDraw 完全相等；primaryElementId 用數值比 | P0 |
| M5 | 5 個示範模型、俯視圖輸出 | M4 | `pnpm test`：5 個都過不變條件 1 到 6；讀過 `artifacts/layers/*.txt`；每個的磚數、層數、步驟數、元件數、補支撐格數寫進 HANDOFF（元件數與補支撐是目標值，不擋驗收，見第 10 節） | P0 |
| M6a | `brickGeometry.ts`、`scene.ts`、3D 預覽元件、結果頁（統計、警告、分頁框架、找不到頁）、首頁範例卡片；`layout.tsx` 改成 `lang="zh-Hant-TW"` 與中文標題 | M5 | `pnpm build`；e2e：首頁點「房子」出現 canvas，`window.__legoStats.bricksRendered` 等於磚數 | P0 |
| M6b | 步驟滑桿（instance 排序、drawRange）；5 個示範模型截圖目視，必要時修改 fixture | M6a | e2e：canvas 截圖的像素檢查（第 13.4 節）比例 ≥ 5%；滑桿拉到 1 的截圖跟完整模型不同；5 張截圖存 `artifacts/screenshots/m6-*.png` 並用 Read 看過 | P0 |
| M7 | `snapshot.ts`：步驟圖（紅框）、零件縮圖（固定比例）；說明書分頁預覽 | M6b | e2e：說明書分頁出現第 1 步的圖；截圖用 Read 看，紅框看得到、1x2 和 1x4 的縮圖長短不同 | P0 |
| M8 | 列印頁（封面、零件總表、步驟頁、完成頁）、`?only=parts`、列印 CSS | M7 | e2e：`page.pdf({ format: "A4" })` 頁數等於 8.4 的公式；`?only=parts` 頁數等於零件總表頁數；存 `artifacts/booklet-house.pdf` | P0 |
| M9 | 零件清單分頁：表格（窄螢幕改卡片）、縮圖、色塊、LEGO 色名、下載按鈕、「怎麼買」 | M4、M7 | e2e：BOM 列數大於 0、三個下載檔案內容符合 7.9；390 px 寬截圖沒有橫向捲動 | P0 |
| M10a | `/api/design`、`llm/*`（prompt、design、models） | M5 | `pnpm test`：用假 callModel 測結構錯誤重試、品質不過重試（含元件數回饋文字）、額度用完回 502、只剩品質問題回 200 加警告、deadline、max_tokens 截斷、refusal、thinking block 在前面 | P0 |
| M10b | 首頁輸入流程、loading 與取消、錯誤狀態、localStorage、「再設計一次」與「修改描述」 | M10a、M6a | e2e（mock）：輸入「一隻小鴨」到結果頁；錯誤狀態保留輸入 | P0 |
| M11 | 真實 LLM 目視驗收：恐龍、貓、城堡、飛機、花，小和中都要有，每題截圖用 Read 看，記「看得出／看不出」與秒數、token；看不出就改 `prompt.ts`，最多 2 輪 | M10b | 結果表寫進 HANDOFF。沒有 key：整項標 `BLOCKED-ON-HUMAN`，不影響其他里程碑 | P0（有 key 時） |
| M12 | 點子模式、最近做過的模型、兩步一頁、統計多一行「內部看不到的磚約 N 塊」 | M10b、M8 | e2e（mock）：點子卡片 3 張。兩步一頁會改變頁數，M12 要一起更新頁數公式的實作與 M8 的頁數測試（排版函式回傳步驟頁數），這是明確允許的例外 | P1 |
| M13 | 最終驗證（第 14 節） | 見下方 | 第 14 節 | P0 |
| M14 | 大尺寸、斜面磚屋頂、頂層換 tile、挖空內部、視覺自我批評、對話式修改、元件橋接後處理 | 這次不做 | 列進晨間報告的下一步 | P2 |

- **BLOCKED 會往下傳**：一個里程碑 BLOCKED 時，所有直接或間接依賴它的里程碑在 PLAN.md 標 `BLOCKED-DEPENDENCY：<上游里程碑>`，不能做，但算是有結論。
- **M13 的條件**：M0 到 M12 每一項都是完成、BLOCKED、BLOCKED-DEPENDENCY 或跳過（不含 M13 自己）。任何停下來的路徑（全部做完、全部卡住、時間到）都要先做 M13 裡做得到的部分，至少把晨間報告寫好。
- **M14 不在這次範圍**：PLAN.md 直接標「跳過（本次範圍外）」，列進晨間報告的下一步。
- **時間規則**：開始時間寫在 HANDOFF「目前狀態」第一行（M0 寫入；沒寫就用 `git log --reverse --format=%ci | head -1`）。開始後 5 小時 M8 還沒勾，就照下面的砍單順序砍。開始後 6.5 小時，還沒開始的 M11、M12 標「跳過（時間）」，直接做 M13。開始後 7.5 小時，不管進度都做 M13 並停止。
- **落後時的砍單順序**：M12 → M11 → LDraw 匯出按鈕（`ldraw.ts` 保留）→ BOM 窄螢幕卡片 → `?only=parts`。砍掉的寫進晨間報告。

### 12. 每一輪的流程

每一輪只做一個里程碑，做完就停。

1. **對齊現況**：讀專案 `CLAUDE.md`、`docs/PLAN.md`、`docs/HANDOFF.md`（目前狀態加最後 30 行），跑 `git status` 和 `git log --oneline -10`。
2. **工作樹是髒的**：看 HANDOFF 判斷是哪個里程碑留下的。
   - 只有 PLAN.md、HANDOFF.md 髒：直接 commit，不要 stash。
   - 屬於已經 BLOCKED 的里程碑：`git stash push -u -m "<里程碑> 殘留"`，不重做。
   - 屬於還沒完成的里程碑（上一輪中途斷掉）：這一輪接著做完它。
3. **選工作**：照第 11 節表格順序，第一個沒勾、沒有任何 BLOCKED 或跳過標記、依賴全部勾選的里程碑。M13 用它自己的條件，M14 不選。沒有能做的，先確認 M13 做過（至少晨間報告），再跳到第 8 步。
4. **寫計畫**：在 HANDOFF 追加 3 行以內的本輪計畫（要做什麼、怎麼驗收）。
5. **實作**：照第 5 到 10 節。先寫測試再寫實作。
6. **驗證**：跑表格裡的驗收，外加 `pnpm lint`。「同一個檢查連續失敗 2 次」的定義是：同一個指令、同一個錯誤，修了兩次還是一樣。TDD 的第一次紅燈、不同的錯誤都不算。碰到就停手，照這個順序收尾，收完工作樹要是乾淨的：
   1. 先把所有文件寫好：PLAN.md 在該里程碑後面寫 `BLOCKED：<一句原因>`，所有直接或間接依賴它的里程碑標 `BLOCKED-DEPENDENCY：<該里程碑>`；HANDOFF 寫錯誤輸出摘要、試過什麼、懷疑原因，以及接下來要用的 stash 名稱「<里程碑> 未完成：<一句原因>」。
   2. 只 commit 這兩個檔案：`git commit -m "chore: mark <里程碑> blocked" -- docs/PLAN.md docs/HANDOFF.md`。指定路徑的 commit 只會提交這兩個檔案，就算 index 裡有別的 staged 改動也不會帶進去。commit 完用 `git show --stat HEAD` 確認只有這兩個檔案。
   3. 最後 `git stash push -u -m "<里程碑> 未完成：<一句原因>"`，收掉其餘改動（staged 與 unstaged 都會收）。
   4. 跳到第 8 步。
7. **落地**：勾 PLAN.md；更新 HANDOFF 最上面的「目前狀態」（完成到哪、怎麼跑、最近一次驗證的指令與結果）；輪次紀錄追加 2 到 3 行（做完什麼、下一步、卡在哪）；`git add` 具體檔案（不要 `git add -A`）；commit。
8. **排下一輪**：還有能做的里程碑，呼叫 `ScheduleWakeup`：`delaySeconds: 60`、`prompt` 帶同一句 `/loop` 指令、`noop: false`、`reason` 寫下一個里程碑。全部完成或全部卡住，確認晨間報告是最新的，呼叫 `ScheduleWakeup({ stop: true })`。

Commit 規則：Conventional Commits、英文、一行主旨，例如 `feat(core): port legolize with staggered seams`。**不加任何 trailer**，包括 `Co-Authored-By`、`Claude-Session`、`Generated with`。

### 13. M0 的做法

#### 13.1 步驟

1. 先寫 `.gitignore`（13.3），建立 `docs/PLAN.md`、`docs/HANDOFF.md`（13.3，「目前狀態」第一行寫開始時間），`git init`，把既有檔案 commit：`git add .gitignore SUPERPROMPT.md docs scripts data/catalog data/raw/bricklink data/raw/ldraw/LDConfig.ldr`，`git commit -m "chore: add spec, research notes and parts catalog"`。PLAN 與 HANDOFF 要在第一個 commit 裡，M0 後面失敗時才有地方寫 BLOCKED。
2. 在暫存目錄 scaffold。`create-next-app` 不接受非空目錄，這個目錄已經有檔案，直接跑會失敗：

```bash
pnpm create next-app@latest "$TMPDIR/lb-scaffold" --ts --app --src-dir --tailwind --eslint \
  --import-alias "@/*" --use-pnpm --disable-git --skip-install --yes
```

   flag 以 `pnpm create next-app@latest --help` 為準，全部用 flag 指定，不要進互動模式。
3. `rsync -a --ignore-existing "$TMPDIR/lb-scaffold/" ./`，再把 scaffold 的 `.gitignore` 內容附加到我們的後面。暫存目錄不用刪。
4. scaffold 會產生 `AGENTS.md` 和內容只有 `@AGENTS.md` 的 `CLAUDE.md`。**保留 `AGENTS.md`**，用 13.2 的內容覆蓋 `CLAUDE.md`，最後一行保留 `@AGENTS.md`。刪掉 AGENTS.md 的話，`next dev` 會把規則區塊塞進 CLAUDE.md，工作樹每次都變髒。
5. `pnpm install`，再 `pnpm add three zod @anthropic-ai/sdk`、`pnpm add -D @types/three vitest @playwright/test`。出現「Ignored build scripts」時，把列出的套件加進 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 再 `pnpm install`。**不要跑互動式的 `pnpm approve-builds`**。
6. `pnpm exec playwright install chromium`。
7. `package.json` scripts：`dev`、`build`、`start` 前面加 `NEXT_TELEMETRY_DISABLED=1`；`test` 是 `vitest run`；`e2e` 是 `playwright test`；`palette` 是 `node scripts/build_palette_data.mjs`。
8. `vitest.config.ts`：node 環境，`src/**/*.test.ts`。
9. `playwright.config.ts`：
   - `webServer`：`command: "pnpm build && pnpm start -p 3100"`、`port: 3100`、`reuseExistingServer: false`、`timeout: 300_000`、`env: { LLM_MOCK: "1" }`。用獨立 port，避免沿用使用者開著的 dev server。
   - `testDir: "e2e"`（不設的話 Playwright 會把 `src/**/*.test.ts` 的 vitest 測試也載入而報錯）；`use.baseURL: "http://localhost:3100"`；單一測試 timeout 300 秒（說明書在軟體算圖下很慢）；只跑 chromium。
   - headless Chromium 的 WebGL 是 SwiftShader 軟體算圖，預設就能用。真的拿不到 context 才加 `--use-angle=swiftshader --enable-unsafe-swiftshader`。
10. smoke test：`src/core/smoke.test.ts`；`e2e/smoke.spec.ts` 打開 `/`，驗 `document.createElement("canvas").getContext("webgl2")` 不是 null。
11. 更新 `docs/PLAN.md`、`docs/HANDOFF.md`，commit。

#### 13.2 專案 `CLAUDE.md`（全文照抄）

```markdown
# Brick Talk

- 規格：SUPERPROMPT.md。外部事實：docs/research.md。參考實作：docs/reference/。
- 交接檔：docs/HANDOFF.md。每輪更新最上面的「目前狀態」，並在輪次紀錄追加 2 到 3 行：做完什麼、下一步、卡在哪。
- 里程碑清單：docs/PLAN.md。
- 指令：pnpm dev / pnpm build / pnpm lint / pnpm test / pnpm e2e / pnpm palette
- data/raw/ 唯讀。app 執行期只讀 src/core/palette.data.json。
- src/core/ 不 import React、three、DOM、Node API。
- 只准用 SUPERPROMPT.md 第 5 節列的套件。
- 不 push、不部署、不把 API key 寫進任何檔案或輸出。

@AGENTS.md
```

#### 13.3 其他檔案

**`docs/PLAN.md`**：第 11 節表格轉成勾選清單，一項一行，例如 `- [ ] M3 support、steps、pipeline（依賴 M2）`。M11 另外拆一行 `- [ ] M11 真實 API 驗收（需要 key）`。卡住寫 `BLOCKED：<原因>`，跳過寫 `跳過（時間）`。

**`docs/HANDOFF.md`**：

```markdown
# HANDOFF

## 目前狀態
（每輪更新：完成到哪個里程碑、怎麼跑、最近一次驗證的指令與結果）

## 晨間報告
（M13 或最後一輪填寫，格式見 SUPERPROMPT.md 第 16 節）

## 待決事項
（需要人決定、但不影響繼續做的事）

## 輪次紀錄
```

**`.gitignore`**（在 scaffold 的預設之外）：

```text
.env*.local
artifacts/
data/raw/rebrickable/
data/raw/ldraw/cache/
data/catalog/lego_catalog.sqlite
data/catalog/parts_all.csv
test-results/
playwright-report/
```

另外 `vitest.config` 用 `.mts` 副檔名，不然 vitest 會警告設定檔被當成 CommonJS 載入。

#### 13.4 e2e 的像素檢查方法

預覽的 canvas 沒有 `preserveDrawingBuffer`，在頁面裡直接取樣會拿到全透明，檢查永遠通過。一律這樣做：

```ts
const png = await page.locator("canvas").first().screenshot();
const ratio = await page.evaluate(async (b64) => {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const [br, bg, bb] = [d[0], d[1], d[2]];           // 左上角當背景色
  let diff = 0;
  for (let i = 0; i < d.length; i += 4)
    if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 60) diff++;
  return diff / (d.length / 4);
}, png.toString("base64"));
expect(ratio).toBeGreaterThanOrEqual(0.05);
```

PDF 頁數：`page.pdf()` 回傳的 Buffer 轉字串，數 `/Type /Page`（不含 `/Pages`）出現的次數。

### 14. M13 最終驗證

照這個順序，先把報告寫好再做 review，review 卡住也不會沒有報告：

1. 依序跑 `pnpm lint`、`pnpm test`、`pnpm build`、`pnpm e2e`，每個記下指令、通過與否、測試數量。
2. UI 字串檢查：grep `src/app` 與 `src/render` 的字串。簡體字清單（例如 这、个、们、设、计、块、颜、组、说、书）一個都不能有。英文只准出現在白名單：LEGO、BrickLink、Pick a Brick、LDraw、BrickLink Studio、LeoCAD、Element ID、BrickLink 色名與零件英文名欄位、LEGO 官方色名。
3. 用 Playwright 把 5 個示範模型的 3D、BOM、說明書各截一張圖，存 `artifacts/screenshots/final-*.png`，逐張用 Read 看過。
4. 寫 `README.md`：介紹、安裝與啟動、`.env.local`、指令列表、目錄結構；「零件目錄」一節（檔案位置、筆數、sqlite3 查詢範例、涵蓋範圍：尺寸只解析出 21,090 / 64,664、沒有幾何資料）；資料來源與授權（Rebrickable、LDraw CC BY 4.0、BrickLink 色表）。
5. 更新晨間報告（第 16 節），commit。
6. 對抗性 review：照第 0 節第 3 點，優先透過 Herdr 派 Codex（唯讀 `codex exec`）；Herdr 不能用就用 Claude Code 原生 Agent tool 開唯讀 subagent（`model: "opus"`，prompt 明令禁止任何寫入，包括 shell redirection 與 git 寫入）。假設程式有 bug，重點看：7.8 不變條件有沒有漏測、座標轉換（three.js 與 LDraw）、匯出格式、API key 會不會外洩、WebGL 資源有沒有 dispose、錯誤路徑。20 分鐘沒有結果就放棄，把狀況寫進報告。review 找到的問題，有測試能證明的才修，修完重跑第 1 步並更新報告。

### 15. 什麼時候停下來（BLOCKED-ON-HUMAN）

- **停整個 loop**：任何對外寫入，包括 `git push`、部署、發信、在 BrickLink 或 lego.com 送出表單。
- **只擋那一項，loop 繼續**：
  - 需要 API key 或任何 credential，而 `.env.local` 沒有。
  - 需要清單以外的套件。
  - 需要改 `data/raw/` 或重新下載原始資料。
  - 只有人能做的驗收：實際列印、在 BrickLink Studio 打開 .ldr、上傳 XML 到 BrickLink、在 lego.com 上傳 CSV、在台灣 LEGO 官網試下單。

不要重試無法靠重試解決的授權問題。

### 16. 晨間報告格式

寫在 `docs/HANDOFF.md` 的「晨間報告」段落：

```markdown
## 晨間報告（YYYY-MM-DD HH:MM）

### 結論
一段話：P0 完成幾項、能不能 demo、最大的問題。沒有 API key 就寫「LLM 產出品質未驗證」。

### 怎麼跑
pnpm install / pnpm dev / 打開哪個網址 / 示範模型怎麼點

### 驗證結果
| 指令 | 結果 | 摘要 |
（每一列是真的跑過的指令，附測試數量；沒跑的寫「沒跑」與原因）

### 里程碑
M0 到 M14 各一行：完成、BLOCKED（原因）、跳過（原因）、沒做。

### 示範模型
5 個模型各一行：磚數、零件種類、層數、步驟數、元件數、警告數、截圖路徑。

### LLM 目視驗收
M11 的結果表，或「沒有 key，未驗證」。

### 零件目錄
一行：檔案位置與筆數，詳見 README。

### 需要人處理
- [ ] 每項一行，寫清楚要做什麼、為什麼機器做不到

### 已知問題與下一步
```

### 17. 不要做的事

- 不要 `eval` 或執行任何 LLM 產生的內容。LLM 輸出只當資料，過 zod 驗證。
- 不要用 SDK 的 `zodOutputFormat`，不要做 tool use 退路，不要讀 `content[0]`。
- 不要用 `LDrawLoader`、不要下載 LDraw 完整零件庫、不要做力學模擬。
- 不要每塊磚一個 Mesh，不要每張圖一個 WebGL context。
- 不要把 Rebrickable 色號當成 BrickLink 色號或 LDraw 色碼用。一律查 palette 的對照欄位。
- 不要在 UI 保證「一定買得到」。
- 不要順手重構已經驗收過的里程碑（M6b 修改 fixture 是唯一例外）。發現問題寫進 HANDOFF 的待決事項。
- 不要 `git add -A`、不要 `git reset --hard`、不要 `git clean`、不要 `rm -rf` 專案裡的東西。

---

## 附錄 A：`data/catalog/palette.json` 欄位

```text
units            stud_mm 8.0、plate_height_mm 3.2、brick_height_plates 3、stud_ldu 20、plate_height_ldu 8
recent_rule      「近期生產」的判斷規則（出現在 2024 年以後的套組）
colors[]         依「近期有生產的 palette 零件數」排序
  rebrickable_id   Rebrickable 色號（BOM 內部用這個）
  name / name_zh   英文名（BrickLink 用的名稱）／自訂中文名
  rgb / is_trans
  tier             core（22 個，生成時用）、extended、special（透明、金屬、珍珠等）
  bricklink_id     BrickLink 色號，對不上是 null
  ldraw_code       LDraw 色碼，對不上是 null
  lego_color_ids / lego_color_name   LEGO 官方色號與色名
  recent_palette_parts / recent_brick_plate
parts[]          41 種零件
  part_num         Rebrickable 編號，也是 LDraw 檔名
  bricklink_part_id  BrickLink 編號（3070b→3070、3069b→3069、3068b→3068、3040b→3040，其他相同）
  name / kind      kind：brick、plate、tile、slope45、slope45_inv
  studs_w / studs_l / height_plates   尺寸照名稱「W x L」的順序，只拿來顯示
  size_mm / size_ldu / has_studs / ldraw_file
  ldraw            bbox_min、bbox_max（LDU，Y 朝下）、studs_x、studs_z、centered_xz（斜面磚是 false）
  colors[]         color_id、element_ids、num_sets、first_year、last_year、recent
```

palette 的 41 種零件：

- brick：1x1、1x2、1x3、1x4、1x6、1x8、2x2、2x3、2x4、2x6、2x8（3005、3004、3622、3010、3009、3008、3003、3002、3001、2456、3007）
- plate：1x1、1x2、1x3、1x4、1x6、1x8、2x2、2x3、2x4、2x6、2x8、4x4、4x6、4x8、6x6、6x8
- tile：1x1、1x2、1x3、1x4、1x6、1x8、2x2、2x4
- 45 度斜面：2x1、2x2、2x3、2x4；倒斜面 2x1、2x2

## 附錄 B：參考實作的實測數字（2026-09-27）

用 `docs/reference/` 的兩個檔案在 Node 26 跑出來的結果。移植成 TypeScript 後跑同樣的輸入，數字要一樣。

**連通性（單色實心 box，W、D 從 2 到 16，每格是分成多塊的數量 / 225）**

| 顏色 | H=2 | H=3 | H=4 | H=6 |
|---|---|---|---|---|
| Red | 6 | 0 | 0 | 0 |
| Green | 1 | 0 | 0 | 0 |
| Dark Tan | 68 | 0 | 0 | 0 |

對照原本沒有錯縫、縫隙懲罰 4 的版本：同一組 H=4 分別散開 210、213、216 個。2 層高的模型本來就很難扣緊，所以 9.3 要求每個部位至少 2 層厚，驗收從 H=3 開始。

**指定形狀（元件數）**：16×1×6 Red 牆 1；12×12×4 Red 1；8×8×2 Red 1；32×32×20 Red 1（1,433 塊）；32×32×20 Green 1（1,849 塊）；20×20×14 Dark Tan 1（529 塊）。

**代價**：跟不錯縫（懲罰 25、有內部萬用格）相比，同一組 box 的總磚數多 13% 到 33%。例如 Red H=4 從 5,961 塊變 7,316 塊，Dark Tan H=4 從 7,732 塊變 8,782 塊。不錯縫的版本 Red H=4 有 191 / 225 個會散開，這個代價值得。

**接地與分步（原型的小鴨、懸空桌面，加 200 個隨機模型）**

| 模型 | 補支撐格數 | 吊掛磚 | 元件數 | 漏排／重複／放置時沒有依靠 |
|---|---|---|---|---|
| 小鴨 20×20×14 | 3（舊規則 29） | 17 | 2 | 0／0／0 |
| 兩層厚桌面 | 0（舊規則 72） | 18 | 2 | 0／0／0 |
| 單層桌面 | 132 | 0 | 19 | 0／0／0 |
| 隨機 200 個（產生器沒有附上，數字只當量級參考，不是移植檢查） | 補完全部接地 | | 68 個大於 1 | 0／0／0 |

單層桌面的結果說明：只有 1 層的部位用磚扣不起來，只能補柱子。這要靠 9.3 的設計規則避免，不是演算法能解的。

**壓力測試**：再加 6,000 個多色隨機模型（3,000 個有底座的散點、3,000 個從地面長出去的多色枝條），加固後的 `support_steps.mjs` 沒有任何一個出現沒接地或漏排的磚。

**效能**：從體素化到分步，20×20×14 全實心 12 ms（423 塊、60 步），32×32×20 全實心 27 ms（1,433 塊、187 步）。瓶頸在說明書的截圖，不在演算法。
