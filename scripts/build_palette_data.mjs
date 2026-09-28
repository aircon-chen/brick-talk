#!/usr/bin/env node
// 從 data/catalog/palette.json 產生 app 執行期用的精簡版 src/core/palette.data.json。
// 只留 core 與 extended 顏色、近期有生產的組合、程式要用的欄位。零件順序不能變，legolize 的同分決勝靠它。
// 重跑：pnpm palette
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = JSON.parse(readFileSync(join(root, "data/catalog/palette.json"), "utf8"));

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));

const colors = src.colors
  .filter((c) => c.tier === "core" || c.tier === "extended")
  .map((c) => pick(c, ["rebrickable_id", "name", "name_zh", "rgb", "is_trans", "tier", "bricklink_id", "ldraw_code", "lego_color_name"]));
const keep = new Set(colors.map((c) => c.rebrickable_id));

const parts = src.parts.map((p) => ({
  ...pick(p, ["part_num", "bricklink_part_id", "name", "kind", "studs_w", "studs_l", "height_plates", "has_studs", "ldraw_file", "ldraw"]),
  colors: p.colors
    .filter((k) => k.recent === true && keep.has(k.color_id))
    .map((k) => ({ color_id: k.color_id, element_ids: k.element_ids })),
}));

const out = JSON.stringify({ source: src.source, recent_rule: src.recent_rule, colors, parts });
writeFileSync(join(root, "src/core/palette.data.json"), out);
console.log(`palette.data.json: ${colors.length} colors, ${parts.length} parts, ${Buffer.byteLength(out)} bytes`);
