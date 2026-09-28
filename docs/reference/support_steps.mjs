// 參考實作：接地檢查、補支撐、分步（含從上方吊著的磚）。
import { legolize } from "./legolize.mjs";

// 磚的鄰接：相鄰兩層、平面投影有重疊。回傳每塊磚的上下鄰居。
export function adjacency(bricks, owner, size) {
  const [W, D] = size;
  const up = bricks.map(() => new Set()), down = bricks.map(() => new Set());
  for (const b of bricks) {
    if (b.z === 0) continue;
    for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) {
      const o = owner[x + W * (y + D * (b.z - 1))];
      if (o !== -1) { down[b.id].add(o); up[o].add(b.id); }
    }
  }
  return { up, down };
}

// 連通元件，並標出有沒有接地（元件裡有 z = 0 的磚）
export function groundedComponents(bricks, adj) {
  const comp = new Int32Array(bricks.length).fill(-1);
  const comps = [];
  for (const b of bricks) {
    if (comp[b.id] !== -1) continue;
    const k = comps.length, stack = [b.id], members = [];
    comp[b.id] = k;
    while (stack.length) {
      const i = stack.pop(); members.push(i);
      for (const j of [...adj.up[i], ...adj.down[i]]) if (comp[j] === -1) { comp[j] = k; stack.push(j); }
    }
    comps.push({ members, grounded: members.some((i) => bricks[i].z === 0) });
  }
  return { comp, comps };
}

// legolize + 補支撐：沒接地的元件，在它最低那層、離下方既有結構最近的格子底下補同色柱子，直到碰到東西或 z = 0（含）。
// 一直補到全部接地，或某一輪完全沒進展（上限 8 輪）。還是有沒接地的元件，就把它的格子移除再重新合併。
// 這樣「每塊磚都接地」由結構保證（2026-09-27 依 Codex 第二輪審查補上移除這一步）。
export function buildWithSupport(grid, sizesByColor, warnings) {
  const [W, D] = grid.size;
  let res = legolize(grid, sizesByColor), added = 0, removed = 0;
  const floatingOf = (r) => {
    const adj = adjacency(r.bricks, r.owner, grid.size);
    return { adj, ...groundedComponents(r.bricks, adj) };
  };
  for (let round = 0; round < 8; round++) {
    const { comps } = floatingOf(res);
    const floating = comps.filter((c) => !c.grounded);
    if (!floating.length) break;
    let addedThisRound = 0;
    for (const c of floating) {
      const minZ = Math.min(...c.members.map((i) => res.bricks[i].z));
      let best = null;
      for (const i of c.members) {
        const b = res.bricks[i];
        if (b.z !== minZ) continue;
        for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) {
          let dist = Infinity; // 往下找第一個有東西的格子，距離越短越好；一路到地面就是 z
          for (let z = b.z - 1; z >= 0; z--) if (grid.cells[x + W * (y + D * z)] !== -1) { dist = b.z - 1 - z; break; }
          if (dist === Infinity) dist = b.z;
          if (!best || dist < best.dist) best = { x, y, z: b.z, color: b.colorId, dist };
        }
      }
      for (let z = best.z - 1; z >= 0; z--) {
        const i = best.x + W * (best.y + D * z);
        if (grid.cells[i] !== -1) break;
        grid.cells[i] = best.color; added++; addedThisRound++;
      }
    }
    res = legolize(grid, sizesByColor);
    if (addedThisRound === 0) break; // 沒有進展就不要再試
  }
  // 最後防線：還沒接地的元件整塊移除（最多重複 3 次，因為重新合併可能讓別的地方變成沒接地）
  for (let pass = 0; pass < 3; pass++) {
    const { comps } = floatingOf(res);
    const floating = comps.filter((c) => !c.grounded);
    if (!floating.length) break;
    for (const c of floating) for (const i of c.members) {
      const b = res.bricks[i];
      for (let y = b.y; y < b.y + b.d; y++) for (let x = b.x; x < b.x + b.w; x++) {
        const k = x + W * (y + D * b.z);
        if (grid.cells[k] !== -1) { grid.cells[k] = -1; removed++; }
      }
    }
    res = legolize(grid, sizesByColor);
  }
  const { adj, comps } = floatingOf(res);
  if (added) warnings.push(`為了支撐懸空的部分，加了 ${added} 格支撐`);
  if (removed) warnings.push(`有 ${removed} 格無法接到地面，已移除`);
  const floatingLeft = comps.filter((c) => !c.grounded).length;
  if (floatingLeft) throw new Error(`still ${floatingLeft} ungrounded components after removal`); // 理論上到不了
  if (comps.length > 1) warnings.push(`模型會分成 ${comps.length} 塊`);
  return { ...res, adj, components: comps.length, floating: 0, supportCellsAdded: added, cellsRemoved: removed };
}

// 分步：一層一層往上。先放「下面有東西撐」的磚；放完一層後，把「上面已經有磚、可以從下方扣上去」的吊掛磚放進去，直到沒有新的可放。
// 一步最多 8 塊、最多 4 種零件加顏色，吊掛磚自成一步並標 hanging。
export function makeSteps(bricks, adj, H) {
  const placed = new Uint8Array(bricks.length);
  const steps = [];
  const push = (list, hanging) => {
    let cur = null;
    for (const b of list) {
      const key = b.partNum + "|" + b.colorId;
      if (!cur || cur.brickIds.length >= 8 || (!cur.types.has(key) && cur.types.size >= 4)) {
        cur = { index: steps.length + 1, hanging, brickIds: [], types: new Map() };
        steps.push(cur);
      }
      cur.brickIds.push(b.id); cur.types.set(key, (cur.types.get(key) || 0) + 1);
      placed[b.id] = 1;
    }
  };
  const byLayer = Array.from({ length: H }, () => []);
  for (const b of bricks) byLayer[b.z].push(b);
  for (let z = 0; z < H; z++) {
    const normal = byLayer[z].filter((b) => !placed[b.id] && (b.z === 0 || [...adj.down[b.id]].some((j) => placed[j])));
    push(normal, false);
    // 吊掛：還沒放、而且上面有已放的磚。可能連鎖好幾層，所以重複到沒有新的為止。
    for (;;) {
      const hanging = bricks.filter((b) => !placed[b.id] && b.z <= z && [...adj.up[b.id]].some((j) => placed[j]));
      const normalLate = bricks.filter((b) => !placed[b.id] && b.z <= z && [...adj.down[b.id]].some((j) => placed[j]));
      if (!hanging.length && !normalLate.length) break;
      push(normalLate, false);
      push(hanging.filter((b) => !placed[b.id]), true);
    }
  }
  const missing = bricks.filter((b) => !placed[b.id]).length;
  if (missing) throw new Error(`makeSteps: ${missing} bricks could not be placed (ungrounded input?)`);
  return steps.map((s) => ({ index: s.index, hanging: s.hanging, brickIds: s.brickIds,
    parts: [...s.types].map(([k, qty]) => { const [partNum, c] = k.split("|"); return { partNum, colorId: +c, qty }; }) }));
}
