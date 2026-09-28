// 補支撐之後才加上去、不占格子的零件：頂面的 tile，還有掛在輪軸座上的輪框、輪胎。
import type { Brick } from "./legolize";
import { getPart, sizesForColor } from "./palette";
import { WHEELS } from "./special";
import type { Adjacency } from "./support";
import { FINISH, type VoxelGrid } from "./voxelize";

export function addExtras(grid: VoxelGrid, bricks: Brick[], owner: Int32Array, adj: Adjacency): { bricks: Brick[]; adj: Adjacency; warnings: string[] } {
  const [W, D, H] = grid.size;
  const c = grid.cells;
  const idx = (x: number, y: number, z: number) => x + W * (y + D * z);
  const out = [...bricks];
  const up = adj.up.map((s) => new Set(s));
  const down = adj.down.map((s) => new Set(s));
  const push = (b: Omit<Brick, "id">, below: number[]) => {
    const id = out.length;
    out.push({ ...b, id });
    up.push(new Set());
    down.push(new Set(below));
    for (const j of below) up[j].add(id);
  };
  const warnings: string[] = [];

  // tile：頂面露出、底下是 brick 或 plate（斜面、圓磚、錐體頂上不鋪）
  const want = new Uint8Array(c.length);
  for (let z = 0; z < H; z++)
    for (let y = 0; y < D; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y, z);
        if (c[i] === -1 || grid.finish[i] !== FINISH.tiles || owner[i] === -1) continue;
        if (z + 1 < H && c[idx(x, y, z + 1)] !== -1) continue;
        const kind = getPart(bricks[owner[i]].partNum).kind;
        if (kind === "brick" || kind === "plate") want[i] = 1;
      }
  let noTile = 0;
  for (let z = 0; z < H; z++)
    for (let y = 0; y < D; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y, z);
        if (!want[i]) continue;
        const color = c[i];
        const fits = (w: number, d: number) => {
          if (x + w > W || y + d > D) return false;
          for (let yy = y; yy < y + d; yy++)
            for (let xx = x; xx < x + w; xx++) {
              const j = idx(xx, yy, z);
              if (!want[j] || c[j] !== color) return false;
            }
          return true;
        };
        const pick = sizesForColor("tile", color).find((s) => fits(s.w, s.d));
        if (!pick) { want[i] = 0; noTile++; continue; }
        const below = new Set<number>();
        for (let yy = y; yy < y + pick.d; yy++)
          for (let xx = x; xx < x + pick.w; xx++) {
            const j = idx(xx, yy, z);
            want[j] = 0;
            below.add(owner[j]);
          }
        push({ partNum: pick.partNum, colorId: color, x, y, z: z + 1, w: pick.w, d: pick.d }, [...below]);
      }
  if (noTile) warnings.push(`有 ${noTile} 格的顏色沒有 tile，頂面保留 stud`);

  // 輪子：每個輪軸座兩側各一個輪框加輪胎。只看最後留在格子上的那筆紀錄，被蓋掉的不算
  for (const [si, s] of grid.specials.entries()) {
    if (s.partNum !== WHEELS.holder || grid.special[idx(s.x, s.y, s.z)] !== si) continue;
    const holder = bricks.find((b) => b.partNum === WHEELS.holder && b.x === s.x && b.y === s.y && b.z === s.z);
    if (!holder) continue;
    const sides = s.axis === "y" ? (["-y", "+y"] as const) : (["-x", "+x"] as const);
    for (const dir of sides) {
      const base = { x: s.x, y: s.y, z: s.z, w: 2, d: 2, dir, attachedTo: holder.id };
      push({ partNum: WHEELS.rim, colorId: s.rimColor ?? WHEELS.fallbackRimColor, ...base }, []);
      push({ partNum: WHEELS.tyre, colorId: WHEELS.tyreColor, ...base }, []);
    }
  }
  return { bricks: out, adj: { up, down }, warnings };
}
