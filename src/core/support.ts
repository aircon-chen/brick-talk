// 磚與磚的連接、接地檢查、補支撐。移植 docs/reference/support_steps.mjs（SUPERPROMPT.md 7.5）。
import { type Brick, brickCellIndices, legolize, type LegolizeResult, touchesGround } from "./legolize";
import { type BrickSize, brickSizesForColor, getPart } from "./palette";
import { clearCell, PLATES_PER_LAYER, type VoxelGrid } from "./voxelize";

export type Adjacency = { up: Set<number>[]; down: Set<number>[] };

/** 磚的鄰接：相鄰兩層、平面投影有重疊。回傳每塊磚的上下鄰居。 */
export function adjacency(bricks: Brick[], owner: Int32Array, size: [number, number, number]): Adjacency {
  const [W, D] = size;
  const up = bricks.map(() => new Set<number>());
  const down = bricks.map(() => new Set<number>());
  for (const b of bricks) {
    if (b.z === 0 || b.attachedTo !== undefined) continue;
    for (let y = b.y; y < b.y + b.d; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        const o = owner[x + W * (y + D * (b.z - 1))];
        if (o !== -1) {
          down[b.id].add(o);
          up[o].add(b.id);
        }
      }
  }
  return { up, down };
}

export type Component = { members: number[]; grounded: boolean };

/** 連通元件，並標出有沒有接地（元件裡有 z = 0 的磚）。 */
export function groundedComponents(bricks: Brick[], adj: Adjacency): { comp: Int32Array; comps: Component[] } {
  const comp = new Int32Array(bricks.length).fill(-1);
  const comps: Component[] = [];
  for (const b of bricks) {
    if (comp[b.id] !== -1 || b.attachedTo !== undefined) continue;
    const k = comps.length;
    const stack = [b.id];
    const members: number[] = [];
    comp[b.id] = k;
    while (stack.length) {
      const i = stack.pop()!;
      members.push(i);
      for (const j of adj.up[i]) if (comp[j] === -1) { comp[j] = k; stack.push(j); }
      for (const j of adj.down[i]) if (comp[j] === -1) { comp[j] = k; stack.push(j); }
    }
    comps.push({ members, grounded: members.some((i) => touchesGround(bricks[i])) });
  }
  // 掛在別的磚上的（輪框、輪胎）跟著它掛的那塊
  for (const b of bricks) {
    if (b.attachedTo !== undefined) comp[b.id] = comp[b.attachedTo];
  }
  return { comp, comps };
}

export type SupportResult = {
  bricks: Brick[];
  owner: Int32Array;
  adj: Adjacency;
  components: Component[];
  supportCellsAdded: number;
  ungroundedCellsRemoved: number;
  /** 需要補支撐的部位（spec.shapes 的索引） */
  supportedShapes: number[];
  /** 接不到地面、被移除的部位 */
  removedShapes: number[];
  warnings: string[];
};

/**
 * legolize，但斜面不能讓模型斷開：組完找出沒接到主體（最大的接地元件）的小塊，
 * 把小塊裡面、還有緊貼小塊旁邊的斜面位置記進 noSlope，重組一次。
 * 斜面只有 1、2 格寬又先放，常常占掉原本能橫向跨接的磚。noSlope 由呼叫的人保存，補支撐重組時沿用。
 */
export function legolizeConnected(grid: VoxelGrid, noSlope: Uint8Array): LegolizeResult {
  const [W, D] = grid.size;
  let res = legolize(grid, brickSizesForColor, noSlope);
  for (let round = 0; round < 5; round++) {
    const { comps } = groundedComponents(res.bricks, adjacency(res.bricks, res.owner, grid.size));
    const main = comps.filter((c) => c.grounded).sort((a, b) => b.members.length - a.members.length)[0];
    const isSlope = (b: Brick) => ["slope45", "slope45_inv"].includes(getPart(b.partNum).kind);
    const ban = new Set<number>();
    for (const c of comps) {
      if (c === main) continue;
      for (const i of c.members) {
        if (isSlope(res.bricks[i])) ban.add(i);
        for (const k of brickCellIndices(res.bricks[i], grid.size)) {
          const x = k % W, y = Math.floor(k / W) % D;
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (nx < 0 || ny < 0 || nx >= W || ny >= D) continue;
            const o = res.owner[k - x - W * y + nx + W * ny];
            if (o !== -1 && isSlope(res.bricks[o])) ban.add(o);
          }
        }
      }
    }
    if (!ban.size) break;
    for (const i of ban) for (const k of brickCellIndices(res.bricks[i], grid.size)) noSlope[k] = 1;
    res = legolize(grid, brickSizesForColor, noSlope);
  }
  // 保底：還是比完全不放斜面斷得多，就整個不放斜面
  const count = (r: LegolizeResult) => groundedComponents(r.bricks, adjacency(r.bricks, r.owner, grid.size)).comps.length;
  const n = count(res);
  if (n > 1) {
    const all = new Uint8Array(noSlope.length).fill(1);
    const plain = legolize(grid, brickSizesForColor, all);
    if (count(plain) < n) {
      noSlope.fill(1);
      return plain;
    }
  }
  return res;
}

/**
 * 只從側面貼著主體的部位（例如手臂）：樂高只能上下扣，側面貼著扣不住。
 * 把它旁邊主體的格子（優先挑內部看不到的，往內最多 2 格）改成它的顏色並鎖住，讓它的磚伸進主體扣住。
 * 設計是鏡射的，另一邊對稱的位置也做一樣的事，兩邊才會一樣。回傳改了幾格、其中幾格看得到。
 */
export function attachSideways(grid: VoxelGrid, res: LegolizeResult, comp: Int32Array, comps: Component[]): { changed: number; visible: number } {
  const [W, D, H] = grid.size;
  const idx = (x: number, y: number, z: number) => x + W * (y + D * z);
  const filled = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < H && grid.cells[idx(x, y, z)] !== -1;
  const hidden = (x: number, y: number, z: number) =>
    filled(x - 1, y, z) && filled(x + 1, y, z) && filled(x, y - 1, z) && filled(x, y + 1, z) && filled(x, y, z - 1) && filled(x, y, z + 1);
  const grounded = (i: number) => res.owner[i] !== -1 && comps[comp[res.owner[i]]]?.grounded;
  let changed = 0, visible = 0;
  const recolor = (x: number, y: number, z: number, color: number, label: number) => {
    const i = idx(x, y, z);
    if (grid.cells[i] === color && grid.pinned[i]) return;
    if (!hidden(x, y, z)) visible++;
    grid.cells[i] = color;
    grid.labelIndex[i] = label;
    grid.pinned[i] = 1;
    changed++;
  };
  for (const c of comps) {
    if (c.grounded) continue;
    // 先收集候選：懸空部位的格子，旁邊（同一格高度）是接地主體的格子
    const cands: { x: number; y: number; z: number; dx: number; dy: number; color: number; label: number; hide: boolean }[] = [];
    for (const m of c.members) {
      for (const i of brickCellIndices(res.bricks[m], grid.size)) {
        const x = i % W, y = Math.floor(i / W) % D, z = Math.floor(i / (W * D));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (!filled(nx, ny, z) || !grounded(idx(nx, ny, z))) continue;
          cands.push({ x: nx, y: ny, z, dx, dy, color: grid.cells[i], label: grid.labelIndex[i], hide: hidden(nx, ny, z) });
        }
      }
    }
    const use = cands.some((k) => k.hide) ? cands.filter((k) => k.hide) : cands;
    for (const k of use) {
      const mirror = grid.labelMirror[k.label] ?? "none";
      for (let depth = 0; depth < 2; depth++) {
        const x = k.x + k.dx * depth, y = k.y + k.dy * depth;
        if (!filled(x, y, k.z) || !grounded(idx(x, y, k.z)) || (depth > 0 && !hidden(x, y, k.z))) break;
        recolor(x, y, k.z, k.color, k.label);
        const mx = mirror === "x" ? W - 1 - x : x, my = mirror === "y" ? D - 1 - y : y;
        if ((mx !== x || my !== y) && filled(mx, my, k.z)) recolor(mx, my, k.z, k.color, k.label);
      }
    }
  }
  return { changed, visible };
}

/**
 * legolize + 補支撐（SUPERPROMPT.md 7.5）。會直接修改 grid。
 * 沒接地的元件，在它最低那層、往下離既有結構最近的格子底下補同色柱子，直到碰到東西或 z = 0（含）。
 * 一直補到全部接地，或某一輪沒補到新格子（上限 8 輪）。還是沒接地的元件整塊移除（最多 3 次）。
 */
export function buildWithSupport(grid: VoxelGrid): SupportResult {
  const [W, D] = grid.size;
  const warnings: string[] = [];
  const supported = new Set<number>();
  const removedShapes = new Set<number>();
  const noSlope = new Uint8Array(grid.cells.length);
  let res = legolizeConnected(grid, noSlope);
  let added = 0, removed = 0;
  const analyze = (r: LegolizeResult) => {
    const adj = adjacency(r.bricks, r.owner, grid.size);
    return { adj, ...groundedComponents(r.bricks, adj) };
  };
  const labelsOf = (r: LegolizeResult, members: number[], into: Set<number>) => {
    for (const i of members) {
      const b = r.bricks[i];
      for (let y = b.y; y < b.y + b.d; y++)
        for (let x = b.x; x < b.x + b.w; x++) {
          const l = grid.labelIndex[x + W * (y + D * b.z)];
          if (l !== -1) into.add(l);
        }
    }
  };

  let sidewaysVisible = 0;
  for (let round = 0; round < 8; round++) {
    const a = analyze(res);
    const floating = a.comps.filter((c) => !c.grounded);
    if (!floating.length) break;
    // 先試側面接合（見 attachSideways），前兩輪有改到格子就重組再看，還是懸空才補柱子
    if (round < 2) {
      const r = attachSideways(grid, res, a.comp, a.comps);
      if (r.changed) {
        sidewaysVisible += r.visible;
        res = legolizeConnected(grid, noSlope);
        continue;
      }
    }
    let addedThisRound = 0;
    for (const c of floating) {
      labelsOf(res, c.members, supported);
      const minZ = Math.min(...c.members.map((i) => res.bricks[i].z));
      let best: { x: number; y: number; z: number; color: number; label: number; dist: number } | null = null;
      for (const i of c.members) {
        const b = res.bricks[i];
        if (b.z !== minZ) continue;
        for (let y = b.y; y < b.y + b.d; y++)
          for (let x = b.x; x < b.x + b.w; x++) {
            // 往下找第一個有東西的格子，距離越短越好；一路到地面就是 z
            let dist = b.z;
            for (let z = b.z - 1; z >= 0; z--) if (grid.cells[x + W * (y + D * z)] !== -1) { dist = b.z - 1 - z; break; }
            if (!best || dist < best.dist) best = { x, y, z: b.z, color: b.colorId, label: grid.labelIndex[x + W * (y + D * b.z)], dist };
          }
      }
      if (!best) continue;
      for (let z = best.z - 1; z >= 0; z--) {
        const i = best.x + W * (best.y + D * z);
        if (grid.cells[i] !== -1) break;
        grid.cells[i] = best.color;
        grid.labelIndex[i] = best.label;
        added++;
        addedThisRound++;
      }
    }
    res = legolizeConnected(grid, noSlope);
    if (addedThisRound === 0) break;
  }

  // 最後防線：還沒接地的元件整塊移除（重新合併可能讓別處變成沒接地，所以最多重複 3 次）
  for (let pass = 0; pass < 3; pass++) {
    const floating = analyze(res).comps.filter((c) => !c.grounded);
    if (!floating.length) break;
    for (const c of floating) {
      labelsOf(res, c.members, removedShapes);
      for (const i of c.members) {
        for (const k of brickCellIndices(res.bricks[i], grid.size)) {
          if (grid.cells[k] !== -1) { clearCell(grid, k); removed++; }
        }
      }
    }
    res = legolizeConnected(grid, noSlope);
  }

  // 分成多塊時試著把相鄰的同色磚合併成一塊長磚，把元件接起來
  const bridged = bridgeComponents(grid, res);
  res = bridged.result;

  const { adj, comps } = analyze(res);
  if (comps.some((c) => !c.grounded)) throw new Error("buildWithSupport: ungrounded components remain after removal");
  // 格數換成層（一層 3 格 plate）給人看
  if (sidewaysVisible) warnings.push(`有部位只從側面貼著主體，把相鄰的 ${Math.ceil(sidewaysVisible / PLATES_PER_LAYER)} 格改成同色，讓它扣得住`);
  if (added) warnings.push(`為了支撐懸空的部分，加了 ${Math.ceil(added / PLATES_PER_LAYER)} 格支撐`);
  if (removed) warnings.push(`有 ${Math.ceil(removed / PLATES_PER_LAYER)} 格無法接到地面，已移除`);
  if (comps.length > 1) warnings.push(`模型會分成 ${comps.length} 塊`);
  return {
    ...res, adj, components: comps, supportCellsAdded: added, ungroundedCellsRemoved: removed,
    supportedShapes: [...supported].sort((a, b) => a - b), removedShapes: [...removedShapes].sort((a, b) => a - b), warnings,
  };
}

/** 每個「不是最大的」元件包含哪些部位，品質回饋用。 */
export function detachedShapes(grid: VoxelGrid, bricks: Brick[], comps: Component[]): number[][] {
  if (comps.length <= 1) return [];
  const [W, D] = grid.size;
  const sorted = [...comps].sort((a, b) => b.members.length - a.members.length);
  return sorted.slice(1).map((c) => {
    const labels = new Set<number>();
    for (const i of c.members) {
      const b = bricks[i];
      for (let y = b.y; y < b.y + b.d; y++)
        for (let x = b.x; x < b.x + b.w; x++) {
          const l = grid.labelIndex[x + W * (y + D * b.z)];
          if (l !== -1) labels.add(l);
        }
    }
    return [...labels].sort((a, b) => a - b);
  });
}

/** 把一段長度 n 用可用的長度（大到小）鋪滿，鋪不滿回 null。 */
function tile(n: number, lens: number[]): number[] | null {
  const out: number[] = [];
  let left = n;
  while (left > 0) {
    const l = lens.find((x) => x <= left);
    if (!l) return null;
    out.push(l);
    left -= l;
  }
  return out;
}

/**
 * 兩塊相鄰同色磚（b 在前、m 接在後面，沿 axis 排成一條）重新切成幾塊，讓其中一塊盡量長、跨過原本的接縫。
 * 回傳新的磚（id 之後再重編），切不出來回 null。
 */
function recut(b: Brick, m: Brick, axis: "x" | "y", sizes: BrickSize[]): Brick[] | null {
  const t = axis === "x" ? b.d : b.w;
  const L = axis === "x" ? b.w + m.w : b.d + m.d;
  const seam = axis === "x" ? b.w : b.d;
  const fits = (s: BrickSize) => (axis === "x" ? s.d === t : s.w === t);
  const lenOf = (s: BrickSize) => (axis === "x" ? s.w : s.d);
  const lens = [...new Set(sizes.filter(fits).map(lenOf))].sort((p, q) => q - p);
  const partFor = (len: number) => sizes.find((s) => fits(s) && lenOf(s) === len)!;
  const place = (offset: number, len: number): Brick => {
    const part = partFor(len);
    return axis === "x"
      ? { id: 0, partNum: part.partNum, colorId: b.colorId, x: b.x + offset, y: b.y, z: b.z, w: len, d: t }
      : { id: 0, partNum: part.partNum, colorId: b.colorId, x: b.x, y: b.y + offset, z: b.z, w: t, d: len };
  };
  for (const k of lens) {
    if (k < 2 || k > L) continue;
    const starts: number[] = [];
    for (let st = Math.max(0, seam - k + 1); st <= Math.min(seam - 1, L - k); st++) starts.push(st);
    starts.sort((p, q) => Math.abs(p + k / 2 - seam) - Math.abs(q + k / 2 - seam));
    for (const st of starts) {
      const before = tile(st, lens), after = tile(L - st - k, lens);
      if (!before || !after) continue;
      const out: Brick[] = [];
      let off = 0;
      for (const l of before) { out.push(place(off, l)); off += l; }
      out.push(place(off, k)); off += k;
      for (const l of after) { out.push(place(off, l)); off += l; }
      return out;
    }
  }
  return null;
}

function reindex(grid: VoxelGrid, bricks: Brick[]): LegolizeResult {
  const sorted = [...bricks].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x).map((b, i) => ({ ...b, id: i }));
  const owner = new Int32Array(grid.cells.length).fill(-1);
  for (const b of sorted) for (const i of brickCellIndices(b, grid.size)) owner[i] = b.id;
  return { bricks: sorted, owner };
}

/**
 * 元件橋接：模型分成多塊時，找同一層、同顏色、相鄰、屬於不同元件的兩塊磚，重新切成一塊跨過接縫的長磚加上兩邊的小磚。
 * 元件數有下降才保留。只在元件數大於 1 時動作，單一元件的模型（包括附錄 B 的單色 box）完全不受影響。
 */
export function bridgeComponents(grid: VoxelGrid, input: LegolizeResult, sizesByColor: (colorId: number) => BrickSize[] = brickSizesForColor): { result: LegolizeResult; merges: number } {
  const [W, D] = grid.size;
  let cur = input;
  let merges = 0;
  const count = (r: LegolizeResult) => groundedComponents(r.bricks, adjacency(r.bricks, r.owner, grid.size));
  let { comp, comps } = count(cur);
  const tried = new Set<string>();

  for (let guard = 0; guard < 400 && comps.length > 1; guard++) {
    let improved = false;
    outer: for (const b of cur.bricks) {
      const pairs: [number, "x" | "y"][] = [];
      if (b.x + b.w < W) pairs.push([cur.owner[b.x + b.w + W * (b.y + D * b.z)], "x"]);
      if (b.y + b.d < D) pairs.push([cur.owner[b.x + W * (b.y + b.d + D * b.z)], "y"]);
      for (const [j, axis] of pairs) {
        if (j < 0 || comp[b.id] === comp[j]) continue;
        const m = cur.bricks[j];
        if (m.colorId !== b.colorId || m.z !== b.z) continue;
        // 只重切一般的 brick：斜面、薄板、特殊零件的形狀不能換
        if (getPart(b.partNum).kind !== "brick" || getPart(m.partNum).kind !== "brick") continue;
        const aligned = axis === "x" ? m.y === b.y && m.d === b.d && m.x === b.x + b.w : m.x === b.x && m.w === b.w && m.y === b.y + b.d;
        if (!aligned) continue;
        const key = `${b.x},${b.y},${b.z},${b.w},${b.d}|${m.x},${m.y},${m.w},${m.d}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const pieces = recut(b, m, axis, sizesByColor(b.colorId));
        if (!pieces) continue;
        const next = reindex(grid, [...cur.bricks.filter((x) => x.id !== b.id && x.id !== j), ...pieces]);
        const c = count(next);
        if (c.comps.length < comps.length) {
          cur = next;
          ({ comp, comps } = c);
          merges++;
          improved = true;
          break outer;
        }
      }
    }
    if (!improved) break;
  }
  return { result: cur, merges };
}
