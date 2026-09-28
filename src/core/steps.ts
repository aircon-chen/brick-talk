// Brick[] → Step[]。移植 docs/reference/support_steps.mjs 的 makeSteps（SUPERPROMPT.md 7.7）。
import { type Brick, touchesGround } from "./legolize";
import type { Adjacency } from "./support";

export type Step = {
  /** 從 1 開始；滑桿拉到 N 就顯示 index ≤ N 的步驟 */
  index: number;
  /** 這一步的磚是從下方扣到上面的磚 */
  hanging: boolean;
  brickIds: number[];
  parts: { partNum: string; colorId: number; qty: number }[];
};

const MAX_BRICKS_PER_STEP = 8;
const MAX_TYPES_PER_STEP = 4;

/**
 * 一層一層往上。先放「下面有已放的磚撐著」的磚；放完一層，把「上面已經有磚、可以從下方扣上去」的吊掛磚放進去，
 * 重複到沒有新的可放。一步最多 8 塊、最多 4 種零件加顏色，吊掛磚自成一步。
 * 掛在別的磚上的零件（輪框、輪胎）在它掛的那塊放下去之後自成一步。
 */
export function makeSteps(bricks: Brick[], adj: Adjacency, layers: number): Step[] {
  const placed = new Uint8Array(bricks.length);
  type Draft = { index: number; hanging: boolean; brickIds: number[]; types: Map<string, number> };
  const steps: Draft[] = [];

  const attached = bricks.filter((b) => b.attachedTo !== undefined);
  const push = (list: Brick[], hanging: boolean) => {
    pushRaw(list, hanging);
    const ready = attached.filter((b) => !placed[b.id] && placed[b.attachedTo!]);
    if (ready.length) pushRaw(ready, false);
  };
  const pushRaw = (list: Brick[], hanging: boolean) => {
    let cur: Draft | null = null;
    for (const b of list) {
      const key = `${b.partNum}|${b.colorId}`;
      if (!cur || cur.brickIds.length >= MAX_BRICKS_PER_STEP || (!cur.types.has(key) && cur.types.size >= MAX_TYPES_PER_STEP)) {
        cur = { index: steps.length + 1, hanging, brickIds: [], types: new Map() };
        steps.push(cur);
      }
      cur.brickIds.push(b.id);
      cur.types.set(key, (cur.types.get(key) ?? 0) + 1);
      placed[b.id] = 1;
    }
  };
  const someIn = (set: Set<number>) => {
    for (const j of set) if (placed[j]) return true;
    return false;
  };

  const byLayer: Brick[][] = Array.from({ length: layers }, () => []);
  const standing = bricks.filter((b) => b.attachedTo === undefined);
  for (const b of standing) byLayer[b.z].push(b);

  for (let z = 0; z < layers; z++) {
    push(byLayer[z].filter((b) => !placed[b.id] && (touchesGround(b) || someIn(adj.down[b.id]))), false);
    // 吊掛可能連鎖好幾層，重複到沒有新的為止
    for (;;) {
      const hanging = standing.filter((b) => !placed[b.id] && b.z <= z && someIn(adj.up[b.id]));
      const normalLate = standing.filter((b) => !placed[b.id] && b.z <= z && someIn(adj.down[b.id]));
      if (!hanging.length && !normalLate.length) break;
      push(normalLate, false);
      push(hanging.filter((b) => !placed[b.id]), true);
    }
  }

  const missing = bricks.filter((b) => !placed[b.id]).length;
  if (missing) throw new Error(`makeSteps: ${missing} bricks could not be placed (ungrounded input?)`);
  return steps.map((s) => ({
    index: s.index,
    hanging: s.hanging,
    brickIds: s.brickIds,
    parts: [...s.types].map(([k, qty]) => {
      const [partNum, c] = k.split("|");
      return { partNum, colorId: Number(c), qty };
    }),
  }));
}
