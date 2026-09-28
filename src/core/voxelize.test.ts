import { describe, expect, it } from "vitest";
import { renderLayers } from "./layers";
import type { ModelSpec, Shape } from "./spec";
import { cellIndex, countFilled, removeFloatingIslands, voxelize } from "./voxelize";

const base = { op: "add" as const, color: "Red", label: "形狀", mirror: "none" as const };
const model = (shapes: Shape[], size = { x: 10, y: 10, z: 10 }): ModelSpec => ({ version: 1, title: "t", summary: "", size, shapes });
const filledCells = (g: ReturnType<typeof voxelize>) => {
  const out: [number, number, number][] = [];
  const [W, D, H] = g.size;
  for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++)
    if (g.cells[cellIndex(g, x, y, z)] !== -1) out.push([x, y, z]);
  return out;
};
/** 格子的 z 是 plate（一層 3 格），投影回「層」 */
const layerOf = (zPlate: number) => Math.floor(zPlate / 3);

describe("voxelize", () => {
  it("box 用半開區間：{0,0,0}→{4,2,1} 剛好 8 格（每格 3 片 plate）", () => {
    const g = voxelize(model([{ ...base, shape: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 1 } }]));
    expect(g.size).toEqual([10, 10, 30]);
    expect(countFilled(g)).toBe(8 * 3);
    expect(g.cells[cellIndex(g, 3, 1, 0)]).toBe(4);
    expect(g.labelIndex[cellIndex(g, 3, 1, 0)]).toBe(0);
  });

  it("球的半徑用 stud：半徑 3 的球（中心在格子中心），x 方向 6 格、z 方向 5 層", () => {
    // z 方向半徑 = 3 / 1.2 = 2.5 層；中心 z = 5.5 時取樣點在 0、±1、±2 層都在球內
    const g = voxelize(model([{ ...base, shape: "ellipsoid", center: { x: 5, y: 5, z: 5.5 }, radius: { x: 3, y: 3, z: 3 } }]));
    const cells = filledCells(g);
    const xs = new Set(cells.map((c) => c[0])), zs = new Set(cells.map((c) => layerOf(c[2])));
    expect(xs.size).toBe(6);
    expect(zs.size).toBe(5);
    // 高度方向以 plate 取樣：5 層 = 15 片，而且中間比上下寬（曲面有 1/3 層的階梯）
    expect(new Set(cells.map((c) => c[2])).size).toBe(15);
    const width = (z: number) => cells.filter((c) => c[2] === z && c[1] === 5).length;
    expect(width(16)).toBeGreaterThan(width(9));
  });

  it("曲面的每一段從整層開始、至少一層厚（下緣不懸空，上緣保留 1/3 層的階梯）", () => {
    const g = voxelize(model([{ ...base, shape: "ellipsoid", center: { x: 5, y: 5, z: 5 }, radius: { x: 4, y: 4, z: 4 } }]));
    const [W, D, H] = g.size;
    const tops = new Set<number>();
    for (let y = 0; y < D; y++)
      for (let x = 0; x < W; x++) {
        const zs: number[] = [];
        for (let z = 0; z < H; z++) if (g.cells[cellIndex(g, x, y, z)] !== -1) zs.push(z);
        if (!zs.length) continue;
        expect(zs[0] % 3).toBe(0);
        expect(zs.length).toBeGreaterThanOrEqual(3);
        tops.add((zs.at(-1)! + 1) % 3);
      }
    expect(tops.size).toBeGreaterThan(1); // 有些柱子停在 1/3、2/3 層
  });

  it("z 可以用小數：{max.z: 0.34} 只有最下面一片 plate", () => {
    const g = voxelize(model([{ ...base, shape: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 0.34 } }]));
    expect(filledCells(g).map((c) => c[2])).toEqual([0, 0, 0, 0]);
  });

  it("直立圓柱的截面是圓，圓錐台越往上越細", () => {
    const g = voxelize(model([{ ...base, shape: "cylinder", axis: "z", center: { x: 5, y: 5, z: 0 }, from: 0, to: 4, radius: 3, radiusEnd: 1 }]));
    const perLayer = [0, 1, 2, 3].map((z) => filledCells(g).filter((c) => layerOf(c[2]) === z).length);
    expect(perLayer[0]).toBeGreaterThan(perLayer[3]);
    expect(perLayer[3]).toBeGreaterThan(0);
  });

  it("橫放圓柱會把 z 方向換算成 stud，所以高度層數比寬度格數少", () => {
    const g = voxelize(model([{ ...base, shape: "cylinder", axis: "x", center: { x: 0, y: 5, z: 5.5 }, from: 0, to: 2, radius: 3, radiusEnd: 3 }]));
    const cells = filledCells(g).filter((c) => c[0] === 0);
    const ys = new Set(cells.map((c) => c[1])), zs = new Set(cells.map((c) => layerOf(c[2])));
    expect(ys.size).toBe(6);
    expect(zs.size).toBe(5);
  });

  it("mirror 在格子層級：W=16 時 cells (0,0,0) 鏡射到 (15,0,0)", () => {
    const g = voxelize(model([{ ...base, shape: "cells", mirror: "x", cells: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 2, z: 1 }] }], { x: 16, y: 5, z: 3 }));
    const layers = new Set(filledCells(g).map((c) => [c[0], c[1], layerOf(c[2])].join(",")));
    expect([...layers].sort()).toEqual(["0,0,0", "12,2,1", "15,0,0", "3,2,1"].sort());
    expect(countFilled(g)).toBe(4 * 3);
  });

  it("mirror y 與 box 鏡射完全對稱", () => {
    const g = voxelize(model([{ ...base, shape: "box", mirror: "y", min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 3, z: 1 } }], { x: 4, y: 10, z: 2 }));
    const ys = [...new Set(filledCells(g).map((c) => c[1]))].sort((a, b) => a - b);
    expect(ys).toEqual([0, 1, 2, 7, 8, 9]);
  });

  it("remove 清空，paint 只改已經有東西的格子", () => {
    const g = voxelize(model([
      { ...base, shape: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 4, z: 1 } },
      { ...base, op: "remove", shape: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 4, z: 1 } },
      { ...base, op: "paint", color: "Blue", label: "塗", shape: "box", min: { x: 3, y: 0, z: 0 }, max: { x: 6, y: 4, z: 1 } },
    ]));
    expect(countFilled(g)).toBe(12 * 3);
    expect(g.cells[cellIndex(g, 3, 0, 0)]).toBe(1);
    expect(g.labelIndex[cellIndex(g, 3, 0, 0)]).toBe(2);
    expect(g.cells[cellIndex(g, 5, 0, 0)]).toBe(-1);
  });

  it("超大形狀只掃跟格子的交集，不會卡住", () => {
    const t0 = performance.now();
    const g = voxelize(model([{ ...base, shape: "box", min: { x: -1e6, y: -1e6, z: 0 }, max: { x: 1e6, y: 1e6, z: 1 } }]));
    expect(countFilled(g)).toBe(100 * 3);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("removeFloatingIslands", () => {
  it("沒接到地面的整塊移除，側面相連算接到", () => {
    const g = voxelize(model([
      { ...base, shape: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 3 } },
      { ...base, label: "側面", shape: "box", min: { x: 2, y: 0, z: 2 }, max: { x: 4, y: 2, z: 3 } },
      { ...base, label: "飄浮", shape: "box", min: { x: 7, y: 7, z: 5 }, max: { x: 9, y: 9, z: 6 } },
    ]));
    expect(removeFloatingIslands(g)).toBe(4 * 3);
    expect(countFilled(g)).toBe((12 + 4) * 3);
  });
});

describe("renderLayers", () => {
  it("印出圖例與每一層，正面在最下面", () => {
    const g = voxelize(model([
      { ...base, shape: "box", min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 1 } },
      { ...base, color: "Blue", label: "後", shape: "box", min: { x: 0, y: 1, z: 0 }, max: { x: 1, y: 2, z: 1 } },
    ], { x: 2, y: 2, z: 1 }));
    const text = renderLayers(g, "測試");
    const lines = text.trim().split("\n");
    expect(text).toContain("圖例");
    expect(lines.at(-2)).toBe("B.");
    expect(lines.at(-1)).toBe("RR");
  });
});
