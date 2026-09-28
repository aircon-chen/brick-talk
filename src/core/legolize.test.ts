import { describe, expect, it } from "vitest";
import { checkCombos, checkCoverage } from "./invariants";
import { legolize } from "./legolize";
import type { ModelSpec } from "./spec";
import { adjacency, groundedComponents } from "./support";
import { removeFloatingIslands, voxelize } from "./voxelize";

const boxSpec = (W: number, D: number, H: number, color: string): ModelSpec => ({
  version: 1, title: "t", summary: "", size: { x: W, y: D, z: H },
  shapes: [{ shape: "box", op: "add", color, label: "b", mirror: "none", min: { x: 0, y: 0, z: 0 }, max: { x: W, y: D, z: H } }],
});

function build(spec: ModelSpec) {
  const grid = voxelize(spec);
  removeFloatingIslands(grid);
  const { bricks, owner } = legolize(grid);
  const { comps } = groundedComponents(bricks, adjacency(bricks, owner, grid.size));
  return { grid, bricks, owner, components: comps.length };
}

describe("不變條件檢查本身", () => {
  it("負座標的磚要被抓到，不能對到合法格子", () => {
    const grid = voxelize(boxSpec(2, 2, 1, "Red"));
    grid.cells.fill(-1);
    grid.cells[1] = 4; // (1,0,0)
    const errs = checkCoverage(grid, [{ id: 0, partNum: "3005", colorId: 4, x: -1, y: 1, z: 0, w: 1, d: 1 }]);
    expect(errs.some((e) => e.includes("超出範圍"))).toBe(true);
    expect(errs.some((e) => e.includes("沒有磚"))).toBe(true);
  });
});

describe("legolize", () => {
  it("Red 8×2×1 剛好一塊 3007", () => {
    const { bricks } = build(boxSpec(8, 2, 1, "Red"));
    expect(bricks).toHaveLength(1);
    expect(bricks[0]).toMatchObject({ partNum: "3007", w: 8, d: 2 });
  });

  it("Red 8×8×2：第 0 層長邊沿 x、第 1 層沿 y", () => {
    const { bricks } = build(boxSpec(8, 8, 2, "Red"));
    const z0 = bricks.filter((b) => b.z === 0);
    expect(new Set(bricks.map((b) => b.z))).toEqual(new Set([0, 3]));
    expect(z0.every((b) => b.w >= b.d)).toBe(true);
    expect(bricks.filter((b) => b.z === 3).some((b) => b.d > b.w)).toBe(true); // z 是 plate，第 1 層從 3 開始
  });

  // 附錄 B 的指定形狀：磚數與元件數要跟參考實作完全一樣
  it.each([
    ["16×1×6 Red 牆", 16, 1, 6, "Red", 20],
    ["12×12×4 Red", 12, 12, 4, "Red", 52],
    ["8×8×2 Red", 8, 8, 2, "Red", 16],
    ["32×32×20 Red", 32, 32, 20, "Red", 1433],
    ["32×32×20 Green", 32, 32, 20, "Green", 1849],
    ["20×20×14 Dark Tan", 20, 20, 14, "Dark Tan", 529],
  ] as const)("%s：磚數 %#，元件數 1，不變條件 1、2 成立", (_n, W, D, H, color, expected) => {
    const { grid, bricks, components } = build(boxSpec(W, D, H, color));
    expect(bricks.length).toBe(expected);
    expect(components).toBe(1);
    expect(checkCoverage(grid, bricks)).toEqual([]);
    expect(checkCombos(bricks)).toEqual([]);
  });

  // 附錄 B 的單色 box 表：W、D 從 2 到 16。H ≥ 3 全部連成一塊；總磚數與 H=2 的散開數要跟參考實作一樣
  const table: Record<string, Record<number, [split: number, bricks: number]>> = {
    Red: { 2: [6, 3736], 3: [0, 5887], 4: [0, 7316], 6: [0, 11085] },
    Green: { 2: [1, 4275], 3: [0, 6605], 4: [0, 8381], 6: [0, 12762] },
    "Dark Tan": { 2: [68, 4406], 3: [0, 6922], 4: [0, 8782], 6: [0, 13311] },
  };
  for (const [color, rows] of Object.entries(table)) {
    for (const [h, [split, total]] of Object.entries(rows)) {
      it(`${color} H=${h}：225 個 box 散開 ${split} 個，總磚數 ${total}`, () => {
        let splitCount = 0, bricksSum = 0;
        const bad: string[] = [];
        for (let W = 2; W <= 16; W++)
          for (let D = 2; D <= 16; D++) {
            const { grid, bricks, components } = build(boxSpec(W, D, Number(h), color));
            bricksSum += bricks.length;
            if (components > 1) splitCount++;
            if (W % 5 === 0 && D % 5 === 0) {
              const errs = [...checkCoverage(grid, bricks), ...checkCombos(bricks)];
              if (errs.length) bad.push(`${W}x${D}: ${errs[0]}`);
            }
          }
        expect(bad).toEqual([]);
        expect(splitCount).toBe(split);
        expect(bricksSum).toBe(total);
      });
    }
  }
});
