// SUPERPROMPT.md 7.8 的不變條件檢查。回傳違反的描述，空陣列代表全部成立。測試與除錯共用。
import type { BomRow } from "./bom";
import { type Brick, brickCellIndices, brickHeight, touchesGround } from "./legolize";
import { hasCombo } from "./palette";
import type { Step } from "./steps";
import { type Adjacency, groundedComponents } from "./support";
import type { VoxelGrid } from "./voxelize";

/** 1：磚不重疊；磚覆蓋的格子剛好等於 grid 有東西的格子；表面格子的顏色等於磚的顏色。 */
export function checkCoverage(grid: VoxelGrid, bricks: Brick[]): string[] {
  const [W, D, H] = grid.size;
  const errors: string[] = [];
  const cover = new Int32Array(grid.cells.length).fill(-1);
  for (const b of bricks) {
    const cells = brickCellIndices(b, grid.size);
    if (!cells.length) continue; // tile、輪框、輪胎不占格子
    if (b.x < 0 || b.y < 0 || b.z < 0 || b.x + b.w > W || b.y + b.d > D || b.z + brickHeight(b) > H) { errors.push(`磚 ${b.id} 超出範圍`); continue; }
    for (const i of cells) {
      const x = i % W, y = Math.floor(i / W) % D, z = Math.floor(i / (W * D));
      if (cover[i] !== -1) errors.push(`磚 ${b.id} 與磚 ${cover[i]} 重疊於 (${x},${y},${z})`);
      cover[i] = b.id;
      if (grid.cells[i] === -1) errors.push(`磚 ${b.id} 蓋到空格 (${x},${y},${z})`);
    }
  }
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < H && grid.cells[x + W * (y + D * z)] !== -1;
  for (let z = 0; z < H; z++)
    for (let y = 0; y < D; y++)
      for (let x = 0; x < W; x++) {
        const i = x + W * (y + D * z);
        if (grid.cells[i] === -1) continue;
        if (cover[i] === -1) { errors.push(`格子 (${x},${y},${z}) 沒有磚`); continue; }
        const surface = !(filled(x - 1, y, z) && filled(x + 1, y, z) && filled(x, y - 1, z) && filled(x, y + 1, z) &&
          filled(x, y, z - 1) && filled(x, y, z + 1));
        const brick = bricks[cover[i]];
        if (surface && brick.colorId !== grid.cells[i]) errors.push(`表面格子 (${x},${y},${z}) 顏色 ${grid.cells[i]} 被磚 ${brick.id} 蓋成 ${brick.colorId}`);
      }
  return errors.slice(0, 20);
}

/** 2：每塊磚的零件加顏色都存在於 palette.data.json（近期有生產）。 */
export function checkCombos(bricks: Brick[]): string[] {
  return bricks.filter((b) => !hasCombo(b.partNum, b.colorId)).slice(0, 20).map((b) => `磚 ${b.id} 的 ${b.partNum}+${b.colorId} 不在 palette`);
}

/** 3：每塊磚所在的連通元件都有 z = 0 的磚。 */
export function checkGrounded(bricks: Brick[], adj: Adjacency): string[] {
  const { comps } = groundedComponents(bricks, adj);
  return comps.filter((c) => !c.grounded).map((c) => `元件（${c.members.length} 塊）沒有接地`);
}

/** 4：每塊磚剛好出現在一個 step；放下去那一刻至少碰到一塊更早放的磚，或在 z = 0。 */
export function checkSteps(bricks: Brick[], adj: Adjacency, steps: Step[]): string[] {
  const errors: string[] = [];
  const order = new Int32Array(bricks.length).fill(-1);
  let n = 0;
  steps.forEach((s, si) => {
    if (s.index !== si + 1) errors.push(`step ${si} 的 index 是 ${s.index}`);
    for (const id of s.brickIds) {
      if (order[id] !== -1) errors.push(`磚 ${id} 出現兩次`);
      order[id] = n++;
    }
  });
  for (const b of bricks) {
    if (order[b.id] === -1) { errors.push(`磚 ${b.id} 沒有排進步驟`); continue; }
    if (b.attachedTo !== undefined) {
      if (order[b.attachedTo] > order[b.id]) errors.push(`磚 ${b.id} 比它掛的磚 ${b.attachedTo} 早放`);
      continue;
    }
    if (touchesGround(b)) continue;
    const touches = [...adj.up[b.id], ...adj.down[b.id]].some((j) => order[j] !== -1 && order[j] < order[b.id]);
    if (!touches) errors.push(`磚 ${b.id} 放下去時沒有碰到任何已放的磚`);
  }
  return errors.slice(0, 20);
}

/** 5：BOM 數量加總等於磚數；每列都有 primaryElementId、bricklinkColorId、ldrawColor。 */
export function checkBom(bricks: Brick[], bom: BomRow[]): string[] {
  const errors: string[] = [];
  const total = bom.reduce((a, r) => a + r.qty, 0);
  if (total !== bricks.length) errors.push(`BOM 數量加總 ${total} 不等於磚數 ${bricks.length}`);
  for (const r of bom) {
    if (!r.primaryElementId) errors.push(`${r.partNum}+${r.colorId} 沒有 element ID`);
    if (r.bricklinkColorId < 0) errors.push(`${r.partNum}+${r.colorId} 沒有 BrickLink 色號`);
    if (r.ldrawColor < 0) errors.push(`${r.partNum}+${r.colorId} 沒有 LDraw 色碼`);
  }
  return errors.slice(0, 20);
}
