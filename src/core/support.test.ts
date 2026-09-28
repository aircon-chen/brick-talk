import { describe, expect, it } from "vitest";
import { checkCoverage } from "./invariants";
import { type Brick, brickCellIndices } from "./legolize";
import { adjacency, bridgeComponents, groundedComponents } from "./support";
import { emptyGrid } from "./voxelize";

/** 高度與 z 用「層」寫比較好讀，進格子時換成 plate（一層 3 格） */
function setup(W: number, D: number, H: number, bricks: Omit<Brick, "id">[]) {
  const grid = emptyGrid(W, D, H * 3);
  const owner = new Int32Array(grid.cells.length).fill(-1);
  const bs = bricks.map((b, id) => ({ ...b, z: b.z * 3, id }));
  for (const b of bs)
    for (const i of brickCellIndices(b, grid.size)) {
      grid.cells[i] = b.colorId;
      owner[i] = b.id;
    }
  return { grid, res: { bricks: bs, owner } };
}
const comps = (r: { bricks: Brick[]; owner: Int32Array }, size: [number, number, number]) =>
  groundedComponents(r.bricks, adjacency(r.bricks, r.owner, size)).comps.length;

describe("bridgeComponents", () => {
  it("兩塊相鄰同色磚剛好合成一塊 2x6，把孤立的那塊接回來", () => {
    const { grid, res } = setup(6, 2, 2, [
      { partNum: "3001", colorId: 4, x: 0, y: 0, z: 0, w: 4, d: 2 },
      { partNum: "3003", colorId: 4, x: 4, y: 0, z: 0, w: 2, d: 2 },
      { partNum: "3001", colorId: 4, x: 0, y: 0, z: 1, w: 4, d: 2 },
    ]);
    expect(comps(res, grid.size)).toBe(2);
    const { result, merges } = bridgeComponents(grid, res);
    expect(merges).toBe(1);
    expect(comps(result, grid.size)).toBe(1);
    expect(result.bricks.some((b) => b.partNum === "2456" && b.w === 6)).toBe(true);
    expect(checkCoverage(grid, result.bricks)).toEqual([]);
  });

  it("合起來不是合法尺寸（1x10）時重切：放一塊跨接縫的 1x8", () => {
    const { grid, res } = setup(10, 1, 2, [
      { partNum: "3008", colorId: 4, x: 0, y: 0, z: 0, w: 8, d: 1 },
      { partNum: "3004", colorId: 4, x: 8, y: 0, z: 0, w: 2, d: 1 },
      { partNum: "3008", colorId: 4, x: 0, y: 0, z: 1, w: 8, d: 1 },
    ]);
    expect(comps(res, grid.size)).toBe(2);
    const { result } = bridgeComponents(grid, res);
    expect(comps(result, grid.size)).toBe(1);
    expect(result.bricks.filter((b) => b.z === 0).map((b) => `${b.x}+${b.w}`).sort()).toEqual(["0+2", "2+8"]);
    expect(checkCoverage(grid, result.bricks)).toEqual([]);
  });

  it("不同顏色不會合併", () => {
    const { grid, res } = setup(6, 2, 2, [
      { partNum: "3001", colorId: 4, x: 0, y: 0, z: 0, w: 4, d: 2 },
      { partNum: "3003", colorId: 1, x: 4, y: 0, z: 0, w: 2, d: 2 },
      { partNum: "3001", colorId: 4, x: 0, y: 0, z: 1, w: 4, d: 2 },
    ]);
    expect(bridgeComponents(grid, res).merges).toBe(0);
  });
});
