import { describe, expect, it } from "vitest";
import { checkBom, checkCombos, checkCoverage, checkGrounded, checkSteps } from "./invariants";
import { brickCellIndices } from "./legolize";
import { CORE_COLORS } from "./palette";
import { type BuildResult, runPipeline } from "./pipeline";
import type { ModelSpec, Shape } from "./spec";
import { adjacency } from "./support";
import { cellIndex } from "./voxelize";

const base = { op: "add" as const, mirror: "none" as const };
const box = (label: string, color: string, min: [number, number, number], max: [number, number, number]): Shape => ({
  ...base, shape: "box", label, color,
  min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] },
});
const model = (shapes: Shape[], size: [number, number, number]): ModelSpec => ({
  version: 1, title: "t", summary: "", size: { x: size[0], y: size[1], z: size[2] }, shapes,
});

function allInvariants(r: BuildResult): string[] {
  // pipeline 內的 owner 不外露，重算鄰接關係
  const owner = new Int32Array(r.grid.cells.length).fill(-1);
  for (const b of r.bricks) for (const i of brickCellIndices(b, r.grid.size)) owner[i] = b.id;
  const adj = adjacency(r.bricks, owner, r.grid.size);
  return [...checkCoverage(r.grid, r.bricks), ...checkCombos(r.bricks), ...checkGrounded(r.bricks, adj), ...checkSteps(r.bricks, adj, r.steps), ...checkBom(r.bricks, r.bom)];
}

/** mulberry32：固定種子的 PRNG */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("runPipeline", () => {
  it("懸在橫樑下面的磚會排成吊掛步驟", () => {
    const r = runPipeline(model([
      box("柱", "Red", [0, 0, 0], [2, 2, 4]),
      box("橫樑", "Red", [0, 0, 4], [8, 2, 6]),
      box("吊著", "Red", [6, 0, 3], [8, 2, 4]),
    ], [10, 4, 8]));
    expect(allInvariants(r)).toEqual([]);
    expect(r.stats.supportCellsAdded).toBe(0);
    expect(r.steps.some((s) => s.hanging)).toBe(true);
    expect(r.steps.map((s) => s.index)).toEqual(r.steps.map((_, i) => i + 1));
  });

  it("只從側面黏上去的異色手臂不用補支撐：身體裡相鄰的格子改成手臂的顏色，磚跨進身體扣住", () => {
    const r = runPipeline(model([
      box("身體", "Blue", [0, 0, 0], [4, 4, 6]),
      box("手臂", "Light Bluish Gray", [4, 1, 4], [6, 3, 6]),
    ], [8, 6, 8]));
    expect(allInvariants(r)).toEqual([]);
    expect(r.stats.supportCellsAdded).toBe(0);
    expect(r.stats.components).toBe(1);
    const at = (x: number, y: number, z: number) => r.grid.cells[cellIndex(r.grid, x, y, z)];
    expect(at(3, 1, 12)).toBe(at(4, 1, 12));
    // 改到的是身體內部看不到的格子，外觀不變，不用警告
    expect(r.warnings).toEqual([]);
  });

  it("左右鏡射的手臂兩邊一起扣住，結果左右對稱", () => {
    const arm: Shape = { ...box("手臂", "White", [1, 1, 4], [3, 3, 6]), mirror: "x" };
    const r = runPipeline(model([box("身體", "Red", [3, 0, 0], [9, 4, 6]), arm], [12, 6, 8]));
    expect(allInvariants(r)).toEqual([]);
    expect(r.stats.supportCellsAdded).toBe(0);
    expect(r.stats.components).toBe(1);
    const [W, D, H] = r.grid.size;
    const asym: string[] = [];
    for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W / 2; x++)
      if (r.grid.cells[cellIndex(r.grid, x, y, z)] !== r.grid.cells[cellIndex(r.grid, W - 1 - x, y, z)]) asym.push(`${x},${y},${z}`);
    expect(asym).toEqual([]);
  });

  it("同一個 spec 跑兩次結果完全一樣", () => {
    const spec = model([
      box("底", "Tan", [0, 0, 0], [12, 10, 2]),
      { ...base, shape: "ellipsoid", label: "球", color: "Red", center: { x: 6, y: 5, z: 4 }, radius: { x: 4, y: 3, z: 4 } },
    ], [12, 10, 8]);
    const a = runPipeline(spec), b = runPipeline(spec);
    expect(JSON.stringify({ bricks: a.bricks, steps: a.steps, stats: a.stats })).toBe(
      JSON.stringify({ bricks: b.bricks, steps: b.steps, stats: b.stats }));
  });

  it("統計：內部看不到的磚", () => {
    const r = runPipeline(model([box("塊", "Red", [0, 0, 0], [6, 6, 6])], [6, 6, 6]));
    expect(r.stats.hiddenBricks).toBeGreaterThan(0);
    expect(runPipeline(model([box("牆", "Red", [0, 0, 0], [8, 1, 3])], [8, 1, 3])).stats.hiddenBricks).toBe(0);
  });

  it("統計：尺寸用實際占用範圍，公分", () => {
    const r = runPipeline(model([box("塊", "Red", [0, 0, 0], [4, 2, 3])], [10, 10, 10]));
    expect(r.stats.sizeCm).toEqual([3.2, 1.6, 2.9]);
    expect(r.stats.layers).toBe(3);
  });

  it("200 個固定種子的隨機模型：不變條件 1 到 6 全部成立", () => {
    const rnd = prng(20260927);
    const colors = CORE_COLORS.map((c) => c.name);
    const pick = () => colors[Math.floor(rnd() * colors.length)];
    let multi = 0, support = 0, removed = 0;
    const failures: string[] = [];
    for (let k = 0; k < 200; k++) {
      const W = 8 + Math.floor(rnd() * 13), D = 8 + Math.floor(rnd() * 13), H = 4 + Math.floor(rnd() * 11);
      const shapes: Shape[] = [box("地面", pick(), [0, 0, 0], [W, D, 1 + Math.floor(rnd() * 2)])];
      for (let s = 0; s < 4; s++) {
        if (rnd() < 0.5) {
          shapes.push({ ...base, shape: "ellipsoid", label: `球${s}`, color: pick(),
            center: { x: rnd() * W, y: rnd() * D, z: 1 + rnd() * (H - 2) },
            radius: { x: 2 + rnd() * 5, y: 2 + rnd() * 5, z: 1.2 + rnd() * 5 } });
        } else {
          const x0 = Math.floor(rnd() * W * 0.6), y0 = Math.floor(rnd() * D * 0.6);
          shapes.push(box(`塊${s}`, pick(), [x0, y0, 0], [x0 + 3 + Math.floor(rnd() * 6), y0 + 3 + Math.floor(rnd() * 6), 2 + Math.floor(rnd() * (H - 2))]));
        }
      }
      const spec = model(shapes, [W, D, H]);
      const r = runPipeline(spec);
      const errs = allInvariants(r);
      if (errs.length) failures.push(`#${k}: ${errs[0]}`);
      if (k % 40 === 0 && JSON.stringify(runPipeline(spec).bricks) !== JSON.stringify(r.bricks)) failures.push(`#${k}: 不確定`);
      if (r.stats.components > 1) multi++;
      if (r.stats.supportCellsAdded) support++;
      if (r.stats.ungroundedCellsRemoved) removed++;
    }
    console.log(`隨機 200 個：元件數大於 1 有 ${multi} 個，補過支撐 ${support} 個，移除過沒接地的格子 ${removed} 個`);
    expect(failures).toEqual([]);
  });
});
