// ModelSpec：LLM 的輸出格式，也是示範模型的格式。規格見 SUPERPROMPT.md 6.2、6.3。
import { z } from "zod";
import { CORE_COLORS, findColorByName } from "./palette";
import { CELL_PARTS, PART_KEYS } from "./special";

/** 一層 brick 高 9.6 mm，是一格寬 8 mm 的 1.2 倍。半徑用 stud，z 方向要除以它換成層。 */
export const LAYER_RATIO = 1.2;

export const SIZE_LIMITS = {
  S: { x: 12, y: 12, z: 10 },
  M: { x: 20, y: 20, z: 14 },
  L: { x: 32, y: 32, z: 24 },
  // 「不限」不限磚數。格子上限是技術限制：再大，瀏覽器產說明書（每一步一張圖）會吃掉好幾百 MB 記憶體
  XL: { x: 48, y: 48, z: 40 },
} as const;
export type SizeTier = keyof typeof SIZE_LIMITS;
export const SIZE_TIERS = Object.keys(SIZE_LIMITS) as SizeTier[];
export const SIZE_LABELS: Record<SizeTier, string> = { S: "小", M: "中", L: "大", XL: "不限" };

export function isSizeTier(v: unknown): v is SizeTier {
  return typeof v === "string" && Object.hasOwn(SIZE_LIMITS, v);
}

const MAX_TITLE = 20;
/** 形狀數與單一 cells 形狀的格子數上限。尺寸越大，細節要的形狀越多 */
export const SHAPE_LIMITS: Record<"S" | "M" | "L" | "XL", { shapes: number; cells: number }> = {
  S: { shapes: 80, cells: 64 },
  M: { shapes: 80, cells: 64 },
  L: { shapes: 120, cells: 128 },
  XL: { shapes: 150, cells: 256 },
};
const MAX_PARTS = 40;

const CORE_NAMES = CORE_COLORS.map((c) => c.name) as [string, ...string[]];

const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

// 色名不分大小寫：LLM 的 structured outputs 不保證 enum 的大小寫
const ColorSchema = z.preprocess((v) => {
  if (typeof v !== "string") return v;
  const c = findColorByName(v);
  return c && c.tier === "core" ? c.name : v;
}, z.enum(CORE_NAMES));

/** 形狀頂面的處理。舊的設計沒有這個欄位，當成 studs。 */
export const TOPS = ["studs", "tiles", "slopes", "plate"] as const;
export type Top = (typeof TOPS)[number];

const common = {
  op: z.enum(["add", "remove", "paint"]),
  color: ColorSchema,
  label: z.string(),
  mirror: z.enum(["none", "x", "y"]),
  top: z.enum(TOPS).optional(),
};

const BoxSchema = z.object({ shape: z.literal("box"), ...common, min: Vec3Schema, max: Vec3Schema });
const EllipsoidSchema = z.object({ shape: z.literal("ellipsoid"), ...common, center: Vec3Schema, radius: Vec3Schema });
const CylinderSchema = z.object({
  shape: z.literal("cylinder"),
  ...common,
  axis: z.enum(["x", "y", "z"]),
  center: Vec3Schema,
  from: z.number(),
  to: z.number(),
  radius: z.number(),
  radiusEnd: z.number(),
});
const CellsSchema = z.object({ shape: z.literal("cells"), ...common, cells: z.array(Vec3Schema) });

export const ShapeSchema = z.discriminatedUnion("shape", [BoxSchema, EllipsoidSchema, CylinderSchema, CellsSchema]);

/** 特殊零件（輪子組、圓磚、錐體）。at 是零件占用範圍的最小角；wheels 的 at.z 是輪子那一層。 */
export const PartSpecSchema = z.object({
  part: z.enum(PART_KEYS),
  color: ColorSchema,
  label: z.string(),
  at: Vec3Schema,
  axis: z.enum(["x", "y"]).optional(),
  mirror: z.enum(["none", "x", "y"]),
});

export const ModelSpecSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  summary: z.string(),
  size: Vec3Schema,
  shapes: z.array(ShapeSchema).min(1),
  parts: z.array(PartSpecSchema).optional(),
  /** 底板顏色：整個 size 的 x × y 範圍鋪一層 plate，模型墊高一片放在上面。null 或沒寫就不鋪 */
  base: ColorSchema.nullable().optional(),
});

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Shape = z.infer<typeof ShapeSchema>;
export type PartSpec = z.infer<typeof PartSpecSchema>;
export type ModelSpec = z.infer<typeof ModelSpecSchema>;

/** 格子的 labelIndex 對到的部位名稱：先是 shapes，接著是 parts。 */
export function labelOf(spec: ModelSpec, i: number): string {
  if (spec.base && i === spec.shapes.length + (spec.parts?.length ?? 0)) return "底板";
  return spec.shapes[i]?.label ?? spec.parts?.[i - spec.shapes.length]?.label ?? `形狀 ${i + 1}`;
}

/** 特殊零件占的範圍（wheels 是輪軸座 2x2，上面還要一層車身）。 */
export function partExtent(p: PartSpec): { w: number; d: number; layers: number } {
  if (p.part === "wheels") return { w: 2, d: 2, layers: 2 };
  const c = CELL_PARTS[p.part];
  return { w: c.size, d: c.size, layers: c.layers };
}

/** 結構驗證：缺欄位、型別錯、enum 不合都算結構錯誤。 */
export function parseModelSpec(input: unknown): { ok: true; spec: ModelSpec } | { ok: false; errors: string[] } {
  const r = ModelSpecSchema.safeParse(input);
  if (r.success) return { ok: true, spec: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

/**
 * 形狀可能蓋到的格子範圍（半開區間，已經跟格子範圍取交集）。
 * 回傳 null 代表完全落在格子外。
 */
export function shapeBounds(shape: Shape, size: Vec3): { lo: Vec3; hi: Vec3 } | null {
  let lo: Vec3, hi: Vec3;
  if (shape.shape === "box") {
    lo = shape.min;
    hi = shape.max;
  } else if (shape.shape === "ellipsoid") {
    const { center: c, radius: r } = shape;
    lo = { x: c.x - r.x, y: c.y - r.y, z: c.z - r.z / LAYER_RATIO };
    hi = { x: c.x + r.x, y: c.y + r.y, z: c.z + r.z / LAYER_RATIO };
  } else if (shape.shape === "cylinder") {
    const r = Math.max(shape.radius, shape.radiusEnd);
    const c = shape.center;
    lo = { x: c.x - r, y: c.y - r, z: c.z - r / LAYER_RATIO };
    hi = { x: c.x + r, y: c.y + r, z: c.z + r / LAYER_RATIO };
    lo = { ...lo, [shape.axis]: Math.min(shape.from, shape.to) };
    hi = { ...hi, [shape.axis]: Math.max(shape.from, shape.to) };
  } else {
    if (shape.cells.length === 0) return null;
    lo = { x: Infinity, y: Infinity, z: Infinity };
    hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const c of shape.cells) {
      lo = { x: Math.min(lo.x, c.x), y: Math.min(lo.y, c.y), z: Math.min(lo.z, c.z) };
      hi = { x: Math.max(hi.x, c.x + 1), y: Math.max(hi.y, c.y + 1), z: Math.max(hi.z, c.z + 1) };
    }
  }
  const axes = ["x", "y", "z"] as const;
  const out = { lo: { x: 0, y: 0, z: 0 }, hi: { x: 0, y: 0, z: 0 } };
  for (const a of axes) {
    out.lo[a] = Math.max(0, Math.floor(lo[a]));
    out.hi[a] = Math.min(size[a], Math.ceil(hi[a]));
    if (out.lo[a] >= out.hi[a]) return null;
  }
  return out;
}

/** 形狀未裁切前的連續範圍（z 方向的半徑除以 1.2 換成層）。 */
function rawBounds(shape: Shape): { lo: Vec3; hi: Vec3 } {
  if (shape.shape === "box") return { lo: shape.min, hi: shape.max };
  if (shape.shape === "ellipsoid") {
    const { center: c, radius: r } = shape;
    return {
      lo: { x: c.x - r.x, y: c.y - r.y, z: c.z - r.z / LAYER_RATIO },
      hi: { x: c.x + r.x, y: c.y + r.y, z: c.z + r.z / LAYER_RATIO },
    };
  }
  if (shape.shape === "cylinder") {
    const r = Math.max(shape.radius, shape.radiusEnd), c = shape.center;
    const lo = { x: c.x - r, y: c.y - r, z: c.z - r / LAYER_RATIO };
    const hi = { x: c.x + r, y: c.y + r, z: c.z + r / LAYER_RATIO };
    return { lo: { ...lo, [shape.axis]: shape.from }, hi: { ...hi, [shape.axis]: shape.to } };
  }
  const xs = shape.cells.map((c) => c.x), ys = shape.cells.map((c) => c.y), zs = shape.cells.map((c) => c.z);
  return {
    lo: { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) },
    hi: { x: Math.max(...xs) + 1, y: Math.max(...ys) + 1, z: Math.max(...zs) + 1 },
  };
}

/**
 * 形狀有沒有被模型範圍切掉。box 與 cells 超出就算；曲面的邊緣本來就會稍微超出，所以超過 1 格才算。
 * 底部被地面切掉（z < 0）不算：「底部平貼地面」本來就是設計規則，常用這個方式做平底。
 */
function sticksOut(shape: Shape, size: Vec3): boolean {
  const { lo, hi } = rawBounds(shape);
  const tol = shape.shape === "ellipsoid" || shape.shape === "cylinder" ? 1 : 0;
  return lo.x < -tol || lo.y < -tol || hi.x > size.x + tol || hi.y > size.y + tol || hi.z > size.z + tol;
}

/**
 * 修正「修得回來的」問題，每個修正產生一條警告，並把 size clamp 到尺寸上限。
 * server 回傳、client 儲存的都是這個函式的輸出。
 */
export function normalizeSpec(input: ModelSpec, tier: SizeTier): { spec: ModelSpec; warnings: string[] } {
  const warnings: string[] = [];
  const limit = SIZE_LIMITS[tier];

  const size = { x: 0, y: 0, z: 0 };
  // LLM 宣告的 size 只是參考：形狀或零件超出去，就把範圍撐大到放得下（不超過尺寸上限），不要刪東西
  const need = { x: 1, y: 1, z: 1 };
  for (const sh of input.shapes) {
    if (sh.op !== "add" || (sh.shape === "cells" && sh.cells.length === 0)) continue;
    const { hi } = rawBounds(sh);
    // box、cells 是半開區間；曲面看格子中心，邊緣多出不到半格不算
    const slack = sh.shape === "ellipsoid" || sh.shape === "cylinder" ? 0.5 : 0;
    for (const a of ["x", "y", "z"] as const) if (Number.isFinite(hi[a])) need[a] = Math.max(need[a], Math.ceil(hi[a] - slack));
  }
  for (const p of input.parts ?? []) {
    const e = partExtent(p);
    need.x = Math.max(need.x, Math.floor(p.at.x) + e.w);
    need.y = Math.max(need.y, Math.floor(p.at.y) + e.d);
    need.z = Math.max(need.z, Math.floor(p.at.z) + e.layers);
  }
  let sizeClamped = false, sizeRounded = false;
  for (const a of ["x", "y", "z"] as const) {
    const rounded = Math.round(input.size[a]);
    if (rounded !== input.size[a]) sizeRounded = true;
    if (rounded > limit[a]) sizeClamped = true;
    size[a] = Math.min(limit[a], Math.max(1, rounded, need[a]));
  }
  if (sizeClamped) warnings.push(`模型尺寸超過上限，已縮成 ${size.x}×${size.y}×${size.z}`);
  else if (sizeRounded) warnings.push(`模型尺寸有小數，已取整數成 ${size.x}×${size.y}×${size.z}`);

  const rawTitle = input.title.replace(/[\r\n]+/g, " ");

  let title = rawTitle.trim();
  if (Array.from(title).length > MAX_TITLE) {
    title = Array.from(title).slice(0, MAX_TITLE).join("");
    warnings.push(`標題太長，已截成 ${MAX_TITLE} 個字`);
  }

  const { shapes: MAX_SHAPES, cells: MAX_CELLS } = SHAPE_LIMITS[tier];
  let shapesIn = input.shapes;
  if (shapesIn.length > MAX_SHAPES) {
    warnings.push(`形狀超過 ${MAX_SHAPES} 個，後面 ${shapesIn.length - MAX_SHAPES} 個已刪掉`);
    shapesIn = shapesIn.slice(0, MAX_SHAPES);
  }

  const shapes: Shape[] = [];
  shapesIn.forEach((raw, i) => {
    const label = raw.label.trim() || `形狀 ${i + 1}`;
    let s: Shape = { ...raw, label };
    const drop = (why: string) => warnings.push(`「${label}」${why}，已刪掉`);

    if (s.shape === "box") {
      const min = { ...s.min }, max = { ...s.max };
      let swapped = false;
      for (const a of ["x", "y", "z"] as const) {
        if (min[a] > max[a]) { [min[a], max[a]] = [max[a], min[a]]; swapped = true; }
      }
      if (swapped) warnings.push(`「${label}」的 min 和 max 顛倒，已對調`);
      if ((["x", "y", "z"] as const).some((a) => min[a] === max[a])) return drop("的體積是 0");
      s = { ...s, min, max };
    } else if (s.shape === "ellipsoid") {
      if (s.radius.x <= 0 || s.radius.y <= 0 || s.radius.z <= 0) return drop("的半徑不是正數");
    } else if (s.shape === "cylinder") {
      let { from, to, radius, radiusEnd } = s;
      if (from > to) {
        // 兩端一起對調，圓錐才不會上下顛倒
        [from, to] = [to, from];
        [radius, radiusEnd] = [radiusEnd, radius];
        warnings.push(`「${label}」的 from 和 to 顛倒，已對調`);
      }
      if (from === to) return drop("的長度是 0");
      if (radius < 0 || radiusEnd < 0) warnings.push(`「${label}」的半徑是負數，已改成 0`);
      radius = Math.max(0, radius);
      radiusEnd = Math.max(0, radiusEnd);
      if (Math.max(radius, radiusEnd) <= 0) return drop("的半徑不是正數");
      s = { ...s, from, to, radius, radiusEnd };
    } else {
      let cells = s.cells;
      if (cells.length > MAX_CELLS) {
        warnings.push(`「${label}」的格子超過 ${MAX_CELLS} 個，後面的已刪掉`);
        cells = cells.slice(0, MAX_CELLS);
      }
      if (cells.some((c) => !Number.isInteger(c.x) || !Number.isInteger(c.y) || !Number.isInteger(c.z))) {
        warnings.push(`「${label}」的格子座標有小數，已取整數`);
        cells = cells.map((c) => ({ x: Math.floor(c.x), y: Math.floor(c.y), z: Math.floor(c.z) }));
      }
      if (cells.length === 0) return drop("沒有任何格子");
      s = { ...s, cells };
    }

    if (!shapeBounds(s, size)) return drop("完全在模型範圍外");
    if (sticksOut(s, size)) warnings.push(`「${label}」有一部分超出模型範圍，超出的部分不會出現`);
    shapes.push(s);
  });

  let partsIn = input.parts ?? [];
  if (partsIn.length > MAX_PARTS) {
    warnings.push(`零件超過 ${MAX_PARTS} 個，後面 ${partsIn.length - MAX_PARTS} 個已刪掉`);
    partsIn = partsIn.slice(0, MAX_PARTS);
  }
  const parts: PartSpec[] = [];
  partsIn.forEach((raw, i) => {
    const label = raw.label.trim() || `零件 ${i + 1}`;
    let at = raw.at;
    if (!Number.isInteger(at.x) || !Number.isInteger(at.y) || !Number.isInteger(at.z)) {
      at = { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) };
      warnings.push(`「${label}」的位置有小數，已取整數`);
    }
    const e = partExtent(raw);
    if (e.w > size.x || e.d > size.y || e.layers > size.z) {
      warnings.push(`「${label}」比模型範圍還大，放不進去`);
      return;
    }
    // 超出尺寸上限（或是負的座標）就往內移到放得下，不刪
    const fit = { x: Math.min(Math.max(at.x, 0), size.x - e.w), y: Math.min(Math.max(at.y, 0), size.y - e.d), z: Math.min(Math.max(at.z, 0), size.z - e.layers) };
    if (fit.x !== at.x || fit.y !== at.y || fit.z !== at.z) {
      warnings.push(`「${label}」超出模型範圍，往內移到放得下的位置`);
      at = fit;
    }
    parts.push({ ...raw, label, at });
  });

  const spec: ModelSpec = { version: 1, title, summary: input.summary.trim(), size, shapes };
  if (parts.length) spec.parts = parts;
  if (input.base) {
    // 輪子靠輪胎著地，跟底板會打架：有輪子就不鋪
    if (parts.some((p) => p.part === "wheels")) warnings.push("有輪子的模型不鋪底板");
    else spec.base = input.base;
  }
  return { spec, warnings };
}

// ---------- 給 API 的 JSON Schema ----------

/** structured outputs 不支援的關鍵字（research.md 第 7 節）。minItems 另外處理：只留 0 和 1。 */
const UNSUPPORTED = new Set([
  "$schema", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "maxItems", "prefixItems", "pattern", "format",
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (UNSUPPORTED.has(k)) continue;
    if (k === "minItems" && v !== 0 && v !== 1) continue;
    out[k === "oneOf" ? "anyOf" : k] = clean(v);
  }
  if (out.type === "object") {
    out.additionalProperties = false;
    // 選填欄位（top、axis、parts）送給 LLM 時也標成必填，讓它每次都明確給值；程式讀取時照樣當選填
    if (out.properties) out.required = Object.keys(out.properties as object);
  }
  return out;
}

/** 任何 zod schema 轉成 structured outputs 能接受的 JSON Schema。 */
export function toStructuredSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** 送給 output_config.format 的 schema。不要用 SDK 的 zodOutputFormat（遇到 tuple 會丟錯、會把 enum 搬進 description）。 */
export function toApiSchema(): Record<string, unknown> {
  return toStructuredSchema(ModelSpecSchema);
}
