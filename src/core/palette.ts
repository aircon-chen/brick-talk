// app 執行期唯一的零件事實來源。資料由 scripts/build_palette_data.mjs 產生。
import data from "./palette.data.json";

export type PartKind =
  | "brick" | "plate" | "tile" | "slope45" | "slope45_inv"
  // 特殊零件：輪軸座、輪框、輪胎、圓磚、錐體
  | "wheel_holder" | "wheel" | "tyre" | "round" | "cone";

export type PaletteColor = {
  rebrickable_id: number;
  name: string;
  name_zh: string | null;
  rgb: string;
  is_trans: boolean;
  tier: "core" | "extended";
  bricklink_id: number | null;
  ldraw_code: number | null;
  lego_color_name: string | null;
};

export type PalettePart = {
  part_num: string;
  bricklink_part_id: string;
  name: string;
  kind: PartKind;
  studs_w: number;
  studs_l: number;
  height_plates: number;
  has_studs: boolean;
  /** LDraw 官方庫的檔名。67687 沒有檔案，用同模具的 4600.dat */
  ldraw_file: string;
  ldraw: {
    bbox_min: [number, number, number];
    bbox_max: [number, number, number];
    studs_x: number;
    studs_z: number;
    centered_xz: boolean;
  };
  colors: { color_id: number; element_ids: string[] }[];
};

/** 某個顏色可用的 brick 尺寸。w 是 x 方向、d 是 y 方向的 stud 數。 */
export type BrickSize = { partNum: string; w: number; d: number };

const palette = data as unknown as { colors: PaletteColor[]; parts: PalettePart[] };

export const COLORS: readonly PaletteColor[] = palette.colors;
export const PARTS: readonly PalettePart[] = palette.parts;
export const CORE_COLORS: readonly PaletteColor[] = COLORS.filter((c) => c.tier === "core");

const colorById = new Map(COLORS.map((c) => [c.rebrickable_id, c]));
const colorByLowerName = new Map(COLORS.map((c) => [c.name.toLowerCase(), c]));
const partByNum = new Map(PARTS.map((p) => [p.part_num, p]));
const comboKey = (partNum: string, colorId: number) => `${partNum}|${colorId}`;
const combos = new Map<string, string[]>();
for (const p of PARTS) for (const k of p.colors) combos.set(comboKey(p.part_num, k.color_id), k.element_ids);

export function getColor(colorId: number): PaletteColor {
  const c = colorById.get(colorId);
  if (!c) throw new Error(`unknown color ${colorId}`);
  return c;
}

/** 不分大小寫、忽略前後空白找顏色，找不到回 undefined。 */
export function findColorByName(name: string): PaletteColor | undefined {
  return colorByLowerName.get(name.trim().toLowerCase());
}

export function getPart(partNum: string): PalettePart {
  const p = partByNum.get(partNum);
  if (!p) throw new Error(`unknown part ${partNum}`);
  return p;
}

/** 這個零件加顏色近期有沒有生產（palette.data.json 只留近期有生產的組合）。 */
export function hasCombo(partNum: string, colorId: number): boolean {
  return combos.has(comboKey(partNum, colorId));
}

export function elementIdsOf(partNum: string, colorId: number): string[] {
  return combos.get(comboKey(partNum, colorId)) ?? [];
}

const sizeCache = new Map<string, BrickSize[]>();

/**
 * 這個顏色可用的 brick 尺寸，順序跟 docs/reference/legolize.mjs 一致：
 * 依面積由大到小，同面積照 palette 零件順序；每個零件先放長邊沿 x，再放轉 90 度的，正方形只放一次。
 */
export function brickSizesForColor(colorId: number): BrickSize[] {
  return sizesForColor("brick", colorId);
}

/** 同 brickSizesForColor，但可以指定 plate 或 tile。 */
export function sizesForColor(kind: "brick" | "plate" | "tile", colorId: number): BrickSize[] {
  const key = `${kind}|${colorId}`;
  const cached = sizeCache.get(key);
  if (cached) return cached;
  const bricks = PARTS.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === kind && hasCombo(p.part_num, colorId));
  bricks.sort((a, b) => b.p.studs_w * b.p.studs_l - a.p.studs_w * a.p.studs_l || a.i - b.i);
  const list: BrickSize[] = [];
  for (const { p } of bricks) {
    const short = Math.min(p.studs_w, p.studs_l);
    const long = Math.max(p.studs_w, p.studs_l);
    list.push({ partNum: p.part_num, w: long, d: short });
    if (short !== long) list.push({ partNum: p.part_num, w: short, d: long });
  }
  sizeCache.set(key, list);
  return list;
}

/** 這個顏色可用的 45 度斜面（或倒斜面），依寬度（垂直於斜面方向的 stud 數）由大到小。 */
export function slopesForColor(colorId: number, kind: "slope45" | "slope45_inv" = "slope45"): { partNum: string; width: number }[] {
  return PARTS.filter((p) => p.kind === kind && hasCombo(p.part_num, colorId))
    .map((p) => ({ partNum: p.part_num, width: p.studs_l }))
    .sort((a, b) => b.width - a.width);
}
