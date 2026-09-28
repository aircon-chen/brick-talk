import { describe, expect, it } from "vitest";
import { FIXTURES, getFixture } from "@/fixtures";
import { getPart } from "./palette";
import type { ModelSpec } from "./spec";
import { buildTiers, fitBudget, scaleSpec } from "./tiers";
import { cellIndex, emptyGrid, resampleGrid, voxelize } from "./voxelize";

describe("scaleSpec", () => {
  it("box 原本是整數的座標縮放後還是整數；太薄的至少留 1 格", () => {
    const spec: ModelSpec = { version: 1, title: "t", summary: "", size: { x: 10, y: 10, z: 6 }, shapes: [
      { shape: "box", op: "add", color: "Red", label: "身體", mirror: "none", min: { x: 0, y: 0, z: 1 }, max: { x: 10, y: 10, z: 3 } },
      { shape: "box", op: "add", color: "Red", label: "天線", mirror: "none", min: { x: 5, y: 5, z: 3 }, max: { x: 6, y: 6, z: 6 } },
    ] };
    const s = scaleSpec(spec, 1.3);
    expect(s.size).toEqual({ x: 13, y: 13, z: 8 });
    const [body, antenna] = s.shapes as Extract<ModelSpec["shapes"][number], { shape: "box" }>[];
    expect([body.min.z, body.max.z]).toEqual([1, 4]);
    expect(antenna.max.x - antenna.min.x).toBeGreaterThanOrEqual(1);
  });
});

describe("三個版本", () => {
  it.each(FIXTURES.map((f) => [f.key, f] as const))("%s：丐版 ≤ 平民版 < 旗艦版；平民與旗艦是一整塊", (_k, f) => {
    const t = buildTiers(f.spec);
    const p = (k: "cheap" | "standard" | "flagship") => t[k].result.stats.priceTwd;
    expect(p("cheap")).toBeLessThanOrEqual(p("standard"));
    expect(p("standard")).toBeLessThan(p("flagship"));
    expect(t.standard.result.stats.components).toBe(1);
    expect(t.flagship.result.stats.components).toBe(1);
  });

  it("小模型（最寬不到 16 格）丐版不縮小；大模型才縮", () => {
    const small = buildTiers(getFixture("demo-house")!.spec);
    expect(small.cheap.scale).toBe(1);
    const big: ModelSpec = { version: 1, title: "t", summary: "", size: { x: 32, y: 20, z: 10 }, shapes: [
      { shape: "box", op: "add", color: "Red", label: "牆", mirror: "none", min: { x: 0, y: 0, z: 0 }, max: { x: 32, y: 20, z: 10 } },
    ] };
    expect(buildTiers(big).cheap.scale).toBeLessThan(1);
  });

  it("房子、小鴨、機器人的丐版結構乾淨：一整塊、不用補支撐", () => {
    for (const id of ["demo-house", "demo-duck", "demo-robot"]) {
      const s = buildTiers(getFixture(id)!.spec).cheap.result.stats;
      expect([id, s.components, s.supportCellsAdded]).toEqual([id, 1, 0]);
    }
  });

  it("有輪子的不縮小；旗艦版輪子還在", () => {
    const t = buildTiers(getFixture("demo-car")!.spec);
    expect(t.cheap.scale).toBe(1);
    expect(t.flagship.result.bricks.filter((b) => getPart(b.partNum).kind === "tyre")).toHaveLength(4);
  });

  it("旗艦版加底板（設計沒有也加）、丐版不加", () => {
    const t = buildTiers(getFixture("demo-duck")!.spec);
    expect(t.flagship.spec.base).toBeTruthy();
    expect(t.cheap.spec.base).toBeFalsy();
  });
});

describe("依預算", () => {
  const house = getFixture("demo-house")!.spec;

  it("挑預算內最好的版本，價格不超過預算", () => {
    const t = buildTiers(house);
    const price = (k: "cheap" | "standard" | "flagship") => t[k].result.stats.priceTwd;
    for (const [budget, want] of [[price("cheap") + 10, "cheap"], [price("flagship") * 1.2, "flagship"]] as const) {
      const r = fitBudget(house, budget);
      expect(r.fits).toBe(true);
      expect(r.build.result.stats.priceTwd).toBeLessThanOrEqual(budget);
      expect(r.build.key).toBe(want);
    }
  });

  it("預算太低：回最便宜的版本，標示不夠", () => {
    const r = fitBudget(house, 50);
    expect(r.fits).toBe(false);
    expect(r.build.key).toBe("cheap");
  });
});

describe("resampleGrid", () => {
  it("縮小後原本相連的部位還是相連（L 形細條）", () => {
    const g = emptyGrid(10, 10, 3);
    const set = (x: number, y: number) => { for (let z = 0; z < 3; z++) g.cells[x + 10 * (y + 10 * z)] = 4; };
    for (let x = 0; x < 10; x++) set(x, 0);
    for (let y = 0; y < 10; y++) set(9, y);
    const d = resampleGrid(g, 0.55, true);
    const [W, D, H] = d.size;
    const filled = (i: number) => d.cells[i] !== -1;
    const start = d.cells.findIndex((v) => v !== -1);
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W, y = Math.floor(i / W) % D, z = Math.floor(i / (W * D));
      for (const [nx, ny, nz] of [[x - 1, y, z], [x + 1, y, z], [x, y - 1, z], [x, y + 1, z], [x, y, z - 1], [x, y, z + 1]]) {
        if (nx < 0 || ny < 0 || nz < 0 || nx >= W || ny >= D || nz >= H) continue;
        const j = nx + W * (ny + D * nz);
        if (filled(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    expect(seen.size).toBe(d.cells.filter((v) => v !== -1).length);
  });

  it("左右對稱的設計放大、縮小後還是左右對稱", () => {
    const spec: ModelSpec = { version: 1, title: "t", summary: "", size: { x: 16, y: 6, z: 6 }, shapes: [
      { shape: "box", op: "add", color: "Red", label: "身體", mirror: "none", min: { x: 2, y: 0, z: 0 }, max: { x: 14, y: 6, z: 6 } },
      { shape: "box", op: "paint", color: "Black", label: "眼睛", mirror: "x", min: { x: 5, y: 0, z: 4 }, max: { x: 6, y: 1, z: 5 } },
      { shape: "box", op: "add", color: "White", label: "手", mirror: "x", min: { x: 0, y: 2, z: 2 }, max: { x: 2, y: 4, z: 4 } },
    ] };
    const g = voxelize(spec);
    for (const s of [0.7, 1.2, 1.3, 1.5]) {
      const d = resampleGrid(g, s, false);
      const [W, D, H] = d.size;
      let asym = 0;
      for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++)
        if (d.cells[cellIndex(d, x, y, z)] !== d.cells[cellIndex(d, W - 1 - x, y, z)]) asym++;
      expect([s, asym]).toEqual([s, 0]);
      // 1 格寬的眼睛也還在
      expect(new Set(d.cells).size).toBe(new Set(g.cells).size);
    }
  });
});
