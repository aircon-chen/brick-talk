# LEGO 零件目錄

這個資料夾是 LEGO 零件的完整目錄，加上一份給 builder 生成模型用的精選零件表。全部由 `scripts/` 底下的腳本從公開資料產生，可以重跑。

資料日期：2026-09-27 下載的 Rebrickable dump。

## 裡面有什麼

| 檔案 | 內容 | 規模 |
|---|---|---|
| `lego_catalog.sqlite` | 完整目錄，六張表（見下方） | 30 MB |
| `parts_all.csv` | 全部零件一覽，含分類、材質、解析出的尺寸、出現年份 | 64,664 列 |
| `colors_all.csv` | 全部顏色，含 RGB、是否透明、中文名（有的話）、年份 | 275 列 |
| `palette.json` | builder 用的 63 種零件乘上顏色，含 element ID 與四套色號對照 | 63 零件、68 色 |
| `ldraw_bbox.json` | palette 零件在 LDraw 裡的 bounding box，用來確認方向與原點 | 63 零件 |
| `SUMMARY.md` | 自動產生的統計摘要 | |

### 形狀、顏色、規格分別在哪

- **形狀**：`parts.name`（例如 `Brick 2 x 4`）、`parts.category`（76 種分類）、`part_colors.img_url`（Rebrickable 的零件照片，98,263 個零件加顏色組合有圖）。palette 零件另外有 LDraw 幾何。
- **顏色**：`colors` 表（275 種），`part_colors` 記錄每個零件出現過哪些顏色、第一次和最後一次出現在套組的年份。
- **規格**：`parts.studs_w`、`studs_l`、`height_plates`、`width_mm`、`length_mm`、`height_mm`。這些是從零件名稱解析出來的，21,090 個零件解析得出尺寸。人偶、貼紙、布料這類名稱裡沒有尺寸的零件，這些欄位是空的。

### SQLite 的表

```text
parts               part_num, name, category, material, family, studs_w, studs_l, height_bricks,
                    height_plates, width_mm, length_mm, height_mm, num_colors, y1, y2
colors              id, name, rgb, is_trans, num_parts, num_sets, y1, y2, name_zh
elements            element_id, part_num, color_id, design_id
part_colors         part_num, color_id, num_sets, total_qty, y1, y2, element_ids, img_url
part_categories     id, name
part_relationships  rel_type, child_part_num, parent_part_num
                    （P 印刷版、M 模具版本、A 替代品、B 子零件、R 成對、T 圖案）
```

查詢範例：

```sql
-- 紅色 2x4 磚的購買編號、出現在幾個套組、最近一次是哪一年
SELECT pc.element_ids, pc.num_sets, pc.y2
FROM part_colors pc JOIN colors c ON c.id = pc.color_id
WHERE pc.part_num = '3001' AND c.name = 'Red';
-- 結果：300121 | 1071 | 2026

-- 2024 年以後還有出現的 1 x N 薄板（排除印刷版），以及還有出現的顏色數
SELECT p.part_num, p.name, COUNT(*) AS colors
FROM parts p JOIN part_colors pc ON pc.part_num = p.part_num
WHERE p.family = 'plate' AND p.studs_w = 1 AND pc.y2 >= 2024
  AND p.part_num NOT GLOB '*pr[0-9]*'
GROUP BY p.part_num ORDER BY p.studs_l;
```

## 規格換算

| 項目 | 數值 |
|---|---|
| stud 間距 | 8 mm（LDraw 20 LDU） |
| plate 高度 | 3.2 mm（8 LDU） |
| brick 高度 | 3 plates = 9.6 mm（24 LDU） |
| 實際長寬 | `studs × 8 mm − 0.2 mm` |

## palette.json 的重點

- **顏色分級**：`core` 22 色是生成模型時用的顏色，條件是 27 種 brick 與 plate 尺寸裡，至少 21 種在 2024 年以後的套組還有出現。`extended` 是其他不透明色，`special` 是透明、金屬、珍珠等。
- **四套色號**：Rebrickable、LDraw、BrickLink、LEGO 的編號互不相通，每個顏色都有對照欄位，對不上是 `null`。22 個 core 色四套都有。對照方式見 `docs/research.md` 第 2 節。
- **近期生產**：`recent` 是推估，條件是這個零件加顏色出現在 2024 年以後發行的套組。LEGO 沒有公開生產狀態，實際買不買得到以通路頁面為準。
- **BrickLink 零件編號與色號**：來自 Rebrickable API 的 external_ids（`bricklink_part_id`、顏色的 `bricklink_id`），重建 palette 時抓一次、快取在 `data/raw/rebrickable/`。
- **LDraw 方向**：brick、plate、tile 的長邊沿 LDraw X 軸，XZ 置中；斜面磚不置中，原點在有 stud 那一排，往 -Z 下坡。一律看 `ldraw.studs_x`、`ldraw.studs_z`。
- **特殊零件**（2026-09-27 加）：輪子組是 67687 輪軸座加 2 個 6014b 輪框、2 個 87697 輪胎，2023 年以後有 10 個套組這樣配（用 `data/raw/rebrickable` 的 inventory 交叉比對）。LDraw 官方庫沒有 67687，`ldraw_file` 改用同模具的 4600.dat。圓磚 3062b、3941，錐體 59900、3942c。另外加了 15 種 1x10 到 16x16 的大片 plate。這些零件都不參與顏色分級，加進來之後顏色表沒有變。

## 怎麼重建

```bash
# 1. 下載 Rebrickable dump（約 16 MB）。Rebrickable 要求自動下載一天最多一次
mkdir -p data/raw/rebrickable && cd data/raw/rebrickable
for f in colors part_categories parts part_relationships elements themes sets inventories inventory_parts; do
  curl -fsSL -o $f.csv.gz "https://cdn.rebrickable.com/media/downloads/$f.csv.gz"
done
cd -

# 2a. 只要零件總覽頁 /parts：產生資料庫就好（約 5 秒，不需要 key）
python3 scripts/build_catalog.py --db-only

# 2b. 要重建 palette（設計用的零件表）：BrickLink 零件編號與色號從 Rebrickable API 取得，
#     先到 rebrickable.com 免費申請 API key。再算 LDraw 幾何（第一次要抓 .dat 檔，約 2 分鐘），再建一次把幾何併進 palette
#     LDraw 色表 data/raw/ldraw/LDConfig.ldr 已經在 repo 裡，要更新才重新下載：
#     curl -fsSL -o data/raw/ldraw/LDConfig.ldr https://library.ldraw.org/library/official/LDConfig.ldr
export REBRICKABLE_API_KEY=你的 key
python3 scripts/build_catalog.py
python3 scripts/ldraw_bbox.py
python3 scripts/build_catalog.py
pnpm palette
```

只用 Python 標準庫，不用裝套件。

## 資料來源與授權

- Rebrickable CSV dump：https://rebrickable.com/downloads/ 。下載頁寫「You can use these files for any purpose」（2025-03 Wayback 存檔，現行頁面被 Cloudflare 擋住沒看到）。
- LDraw 官方零件庫與 LDConfig.ldr：https://library.ldraw.org/ ，CC BY 4.0。
- BrickLink 零件編號與色號：Rebrickable API（https://rebrickable.com/api/ ）的 external_ids。BrickLink 的條款不允許散布它網站上的資料，所以不直接取自 BrickLink。
- 中文色名是自訂的，LEGO 沒有官方繁中色名。
