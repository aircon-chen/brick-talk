// ModelSpec → BuildResult。串起體素化、合併、補支撐、分步、BOM。
import { type BomRow, buildBom } from "./bom";
import { addExtras } from "./extras";
import { type Brick, brickCellIndices, brickHeight } from "./legolize";
import { getPart } from "./palette";
import { totalPriceTwd } from "./price";
import type { ModelSpec } from "./spec";
import { WHEELS } from "./special";
import { type Step, makeSteps } from "./steps";
import { buildWithSupport, detachedShapes } from "./support";
import { applyParts, countFilled, PLATES_PER_LAYER, removeFloatingIslands, resampleGrid, type VoxelGrid, type VoxelOptions, voxelize } from "./voxelize";

/** 做工選項（見 voxelize 的 VoxelOptions）；resample 不是 1 時整個格子縮放（見 resampleGrid） */
export type BuildOptions = VoxelOptions & { resample?: number };

export type BuildStats = {
  bricks: number;
  partTypes: number;
  /** 幾層磚高（plate 數除以 3 無條件進位） */
  layers: number;
  steps: number;
  /** 實際占用範圍的寬 × 深 × 高（公分） */
  sizeCm: [number, number, number];
  components: number;
  supportCellsAdded: number;
  floatingCellsRemoved: number;
  ungroundedCellsRemoved: number;
  /** 每一格六個方向都被包住、從外面看不到的磚 */
  hiddenBricks: number;
  /** 估計總價（新台幣），見 price.ts */
  priceTwd: number;
};

export type BuildResult = {
  spec: ModelSpec;
  /** 修補後（移除懸空島、補支撐之後）的格子 */
  grid: VoxelGrid;
  bricks: Brick[];
  steps: Step[];
  bom: BomRow[];
  warnings: string[];
  stats: BuildStats;
  /** 給 LLM 品質回饋用：spec.shapes 的索引 */
  diagnostics: { filledCells: number; detachedShapes: number[][]; supportedShapes: number[]; removedShapes: number[]; floatingShapes: number[] };
};

export function runPipeline(spec: ModelSpec, opts: BuildOptions = {}): BuildResult {
  const warnings: string[] = [];
  let grid = voxelize(spec, opts);
  warnings.push(...applyParts(grid, spec));
  if (opts.resample && opts.resample !== 1) grid = resampleGrid(grid, opts.resample, !!opts.coarse);
  const floatingLabels = new Set<number>();
  const floatingCellsRemoved = removeFloatingIslands(grid, floatingLabels);
  if (floatingCellsRemoved) warnings.push(`移除了 ${toLayerCells(floatingCellsRemoved)} 格懸空的部分`);

  const s = buildWithSupport(grid);
  warnings.push(...s.warnings);
  const ex = addExtras(grid, s.bricks, s.owner, s.adj);
  warnings.push(...ex.warnings);
  const bricks = ex.bricks;
  // 高度單位是 plate
  const plates = bricks.reduce((m, b) => Math.max(m, b.z + Math.max(1, brickHeight(b))), 0);
  const steps = makeSteps(bricks, ex.adj, plates);

  const partTypes = new Set(bricks.map((b) => `${b.partNum}|${b.colorId}`)).size;
  const hiddenBricks = s.bricks.filter((b) => isHidden(grid, b)).length;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of bricks) {
    // 輪子從輪軸座往兩側伸出約 1.4 stud
    const k = getPart(b.partNum).kind;
    const out = k === "tyre" ? (WHEELS.wheelOffsetMm + 5.6) / 8 - 1 : 0;
    const ox = b.dir === "+x" || b.dir === "-x" ? out : 0, oy = b.dir === "+y" || b.dir === "-y" ? out : 0;
    minX = Math.min(minX, b.x - ox); maxX = Math.max(maxX, b.x + b.w + ox);
    minY = Math.min(minY, b.y - oy); maxY = Math.max(maxY, b.y + b.d + oy);
  }
  const round1 = (v: number) => Math.round(v * 10) / 10;
  const heightMm = bricks.reduce((m, b) => Math.max(m, (b.z + brickHeight(b)) * 3.2), 0);
  const sizeCm: [number, number, number] = bricks.length
    ? [round1((maxX - minX) * 0.8), round1((maxY - minY) * 0.8), round1(heightMm / 10)]
    : [0, 0, 0];

  const bom = buildBom(bricks);
  return {
    spec,
    grid,
    bricks,
    steps,
    bom,
    warnings,
    stats: {
      bricks: bricks.length,
      partTypes,
      layers: Math.ceil(plates / PLATES_PER_LAYER),
      steps: steps.length,
      sizeCm,
      components: s.components.length,
      supportCellsAdded: s.supportCellsAdded,
      floatingCellsRemoved,
      ungroundedCellsRemoved: s.ungroundedCellsRemoved,
      hiddenBricks,
      priceTwd: totalPriceTwd(bom),
    },
    diagnostics: {
      filledCells: countFilled(grid),
      detachedShapes: detachedShapes(grid, s.bricks, s.components),
      supportedShapes: s.supportedShapes,
      removedShapes: s.removedShapes,
      floatingShapes: [...floatingLabels].sort((a, b) => a - b),
    },
  };
}

/** 格子數換成「層」的格數（給使用者和 LLM 看，一層是 3 格 plate），無條件進位。 */
export function toLayerCells(plateCells: number): number {
  return Math.ceil(plateCells / PLATES_PER_LAYER);
}

/** 磚蓋到的每一格，六個方向都有東西（外面看不到）。 */
function isHidden(grid: VoxelGrid, b: Brick): boolean {
  const [W, D, H] = grid.size;
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < H && grid.cells[x + W * (y + D * z)] !== -1;
  const cells = brickCellIndices(b, grid.size);
  if (!cells.length) return false;
  return cells.every((i) => {
    const x = i % W, y = Math.floor(i / W) % D, z = Math.floor(i / (W * D));
    return filled(x - 1, y, z) && filled(x + 1, y, z) && filled(x, y - 1, z) && filled(x, y + 1, z) && filled(x, y, z - 1) && filled(x, y, z + 1);
  });
}
