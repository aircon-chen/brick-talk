// 同一個設計的三個版本（丐版、平民版、旗艦版），以及依預算挑版本。
// 三版長得一樣，差在大小（等比例縮放整份設計）與做工（粗做、鋪 tile、底板），見 TIERS。
// 挖空試過不划算：內部原本是便宜的大塊磚，挖空後外殼要用小磚拼、還要在裡面補支撐，實測價格幾乎一樣或更貴。
import { type BuildOptions, type BuildResult, runPipeline } from "./pipeline";
import { type ModelSpec, normalizeSpec, type Shape, type Vec3 } from "./spec";

export type TierKey = "cheap" | "standard" | "flagship";
export const TIER_KEYS: TierKey[] = ["cheap", "standard", "flagship"];

type TierDef = {
  label: string;
  note: string;
  /** 預設縮放倍數，以及依預算調整時的範圍 */
  scale: number;
  range: [number, number];
  opts: BuildOptions;
  /** 底板：none 不鋪；spec 照設計；add 設計沒有也鋪（有輪子除外） */
  base: "none" | "spec" | "add";
};

export const TIERS: Record<TierKey, TierDef> = {
  cheap: { label: "丐版", note: "縮小、只用一般磚、不加底板", scale: 0.7, range: [0.4, 0.85], opts: { coarse: true }, base: "none" },
  standard: { label: "平民版", note: "原尺寸、曲面用斜面", scale: 1, range: [0.85, 1.2], opts: {}, base: "spec" },
  flagship: { label: "旗艦版", note: "放大、實心、頂面鋪平滑 tile、加底板", scale: 1.3, range: [1, 1.6], opts: { tiles: true }, base: "add" },
};

/** 旗艦版設計裡沒有底板時補的顏色 */
const DEFAULT_BASE = "Dark Bluish Gray";

const hasWheels = (spec: ModelSpec) => (spec.parts ?? []).some((p) => p.part === "wheels");

/** 縮小後最寬的那一邊至少留幾格：再小的話，1 格的眼睛、鬍子沒地方放，會認不出來 */
export const MIN_DETAIL_STUDS = 16;

/**
 * 可以縮放的範圍。有輪子的模型不縮小（輪子是固定大小，車身要 6 格寬才裝得上）；
 * 小模型也不縮到最寬的一邊少於 16 格（馬力歐這種 16 格寬的小人偶，丐版就維持原尺寸）。
 */
export function scaleRange(spec: ModelSpec, key: TierKey): [number, number] {
  const [lo, hi] = TIERS[key].range;
  const floor = hasWheels(spec) ? 1 : Math.min(1, MIN_DETAIL_STUDS / Math.max(spec.size.x, spec.size.y));
  const low = Math.max(lo, floor);
  return [low, Math.max(low, hi)];
}

/**
 * 等比例縮放整份設計。位置與半徑都乘 s；太薄的形狀至少留 1 格寬、1 片 plate 厚，才不會縮到消失。
 * box 原本是整數的座標縮放後也取整數，零件之間的對齊（例如車身剛好在輪子上一層）才不會跑掉。
 */
export function scaleSpec(spec: ModelSpec, s: number): ModelSpec {
  const v = (p: Vec3): Vec3 => ({ x: p.x * s, y: p.y * s, z: p.z * s });
  const snap = (orig: number, scaled: number) => (Number.isInteger(orig) ? Math.round(scaled) : Math.round(scaled * 3) / 3);
  const vb = (p: Vec3): Vec3 => ({ x: snap(p.x, p.x * s), y: snap(p.y, p.y * s), z: snap(p.z, p.z * s) });
  const shapes: Shape[] = spec.shapes.map((sh): Shape => {
    if (sh.shape === "box") {
      const min = vb(sh.min), max = vb(sh.max);
      const grow = (a: "x" | "y" | "z", least: number) => {
        if (max[a] - min[a] >= least) return;
        const mid = (min[a] + max[a]) / 2;
        min[a] = mid - least / 2;
        max[a] = mid + least / 2;
      };
      grow("x", 1);
      grow("y", 1);
      grow("z", 0.34);
      return { ...sh, min, max };
    }
    if (sh.shape === "ellipsoid") {
      const r = v(sh.radius);
      return { ...sh, center: v(sh.center), radius: { x: Math.max(0.5, r.x), y: Math.max(0.5, r.y), z: Math.max(0.5, r.z) } };
    }
    if (sh.shape === "cylinder") {
      return { ...sh, center: v(sh.center), from: sh.from * s, to: sh.to * s, radius: Math.max(0.5, sh.radius * s), radiusEnd: sh.radiusEnd * s };
    }
    // cells：每一格變成縮放後蓋到的那些格子（放大變成一小塊，縮小就合併）
    const seen = new Set<string>();
    const cells: Vec3[] = [];
    for (const c of sh.cells) {
      const lo = { x: Math.floor(c.x * s), y: Math.floor(c.y * s), z: Math.floor(c.z * s) };
      const hi = { x: Math.max(lo.x + 1, Math.floor((c.x + 1) * s)), y: Math.max(lo.y + 1, Math.floor((c.y + 1) * s)), z: Math.max(lo.z + 1, Math.floor((c.z + 1) * s)) };
      for (let z = lo.z; z < hi.z; z++)
        for (let y = lo.y; y < hi.y; y++)
          for (let x = lo.x; x < hi.x; x++) {
            const k = `${x},${y},${z}`;
            if (!seen.has(k)) { seen.add(k); cells.push({ x, y, z }); }
          }
    }
    return { ...sh, cells };
  });
  const parts = spec.parts?.map((p) => ({ ...p, at: { x: Math.round(p.at.x * s), y: Math.round(p.at.y * s), z: Math.round(p.at.z * s) } }));
  const size = { x: Math.max(2, Math.round(spec.size.x * s)), y: Math.max(2, Math.round(spec.size.y * s)), z: Math.max(1, Math.round(spec.size.z * s)) };
  return { ...spec, size, shapes, ...(parts ? { parts } : {}) };
}

export type TierBuild = { key: TierKey; label: string; note: string; scale: number; spec: ModelSpec; result: BuildResult };

/** 一整塊、不用補支撐、沒有部位被移除 */
const clean = (t: TierBuild) => {
  const s = t.result.stats;
  return s.components === 1 && s.supportCellsAdded === 0 && s.ungroundedCellsRemoved === 0 && s.floatingCellsRemoved === 0;
};

/**
 * 做出某個版本，並在目標倍數附近（每步 0.05，最多 steps 步）找結構乾淨的倍數：縮放後細的部位可能變 1 格寬撐不住，差一點點的倍數就好了。
 * 只往 toward 那一側或兩側都試；都不乾淨就挑「分成幾塊、補幾格、離目標多遠」加起來最少的。
 */
export function buildTierClean(spec: ModelSpec, key: TierKey, scale: number, toward: "down" | "both" = "both", steps = 2): TierBuild {
  const [lo, hi] = scaleRange(spec, key);
  let best: { t: TierBuild; score: number } | null = null;
  for (let k = 0; k <= steps; k++) {
    for (const sign of k === 0 ? [0] : toward === "down" ? [-1] : [1, -1]) {
      const s = scale + sign * k * 0.05;
      if (s < lo - 1e-9 || s > hi + 1e-9) continue;
      const t = buildTier(spec, key, s);
      if (clean(t)) return t;
      const st = t.result.stats;
      const score = 1000 * (st.components - 1) + st.supportCellsAdded + 10 * k;
      if (!best || score < best.score) best = { t, score };
    }
  }
  return best?.t ?? buildTier(spec, key, scale);
}

/**
 * 做出某個版本。scale 沒給就用預設倍數（有輪子的會被拉到至少 1）。
 * 一般是縮放組好的格子（resampleGrid）：左右對稱、細節等比例、部位之間還連著。
 * 有特殊零件（輪子、圓磚、錐體）的放大改成縮放設計，零件才會保持原本的大小。
 */
export function buildTier(spec: ModelSpec, key: TierKey, scale?: number): TierBuild {
  const def = TIERS[key];
  const [lo, hi] = scaleRange(spec, key);
  const s = Math.min(hi, Math.max(lo, scale ?? def.scale));
  const scaleDesign = s > 1 && (spec.parts?.length ?? 0) > 0;
  let scaled = scaleDesign ? scaleSpec(spec, s) : spec;
  if (def.base === "none") scaled = { ...scaled, base: null };
  else if (def.base === "add" && !scaled.base && !hasWheels(scaled)) scaled = { ...scaled, base: DEFAULT_BASE };
  // 放大後可能超過尺寸上限，照最大的「不限」夾回去
  const { spec: normalized } = normalizeSpec(scaled, "XL");
  const opts = s !== 1 && !scaleDesign ? { ...def.opts, resample: s } : def.opts;
  return { key, label: def.label, note: def.note, scale: s, spec: normalized, result: runPipeline(normalized, opts) };
}

/** 旗艦版是高價版本，結構穩比倍數精準重要，找得比較遠 */
export const CLEAN_STEPS: Record<TierKey, number> = { cheap: 2, standard: 0, flagship: 4 };

/** 三個版本。平民版就是原本的設計（倍數 1），不另外找倍數。 */
export function buildTiers(spec: ModelSpec): Record<TierKey, TierBuild> {
  return {
    cheap: buildTierClean(spec, "cheap", TIERS.cheap.scale, "both", CLEAN_STEPS.cheap),
    standard: buildTier(spec, "standard"),
    flagship: buildTierClean(spec, "flagship", TIERS.flagship.scale, "both", CLEAN_STEPS.flagship),
  };
}

/**
 * 依預算（新台幣）挑版本：從旗艦版往下試，每一版在它的縮放範圍裡找預算內最大的倍數（以 0.05 為單位二分搜尋）。
 * 最便宜的丐版最小倍數也超過預算，就回那一版並標 fits = false。
 */
export function fitBudget(spec: ModelSpec, budgetTwd: number): { build: TierBuild; fits: boolean } {
  for (const key of ["flagship", "standard", "cheap"] as const) {
    const [lo, hi] = scaleRange(spec, key);
    const low = buildTier(spec, key, lo);
    if (low.result.stats.priceTwd > budgetTwd) continue;
    let best = low;
    const high = buildTier(spec, key, hi);
    if (high.result.stats.priceTwd <= budgetTwd) return { build: high, fits: true };
    // 以 0.05 為一格：a 在預算內、b 超過預算
    let a = Math.round(lo * 20), b = Math.round(hi * 20);
    while (b - a > 1) {
      const mid = Math.floor((a + b) / 2);
      const t = buildTier(spec, key, mid / 20);
      if (t.result.stats.priceTwd <= budgetTwd) { best = t; a = mid; } else b = mid;
    }
    // 結構不乾淨就往小一點的倍數找（越小越便宜，一定還在預算內）；找不到乾淨的就保留預算內最大的
    if (!clean(best)) {
      const c = buildTierClean(spec, key, best.scale, "down");
      if (clean(c) && c.result.stats.priceTwd <= budgetTwd) best = c;
    }
    return { build: best, fits: true };
  }
  const [lo] = scaleRange(spec, "cheap");
  return { build: buildTier(spec, "cheap", lo), fits: false };
}
