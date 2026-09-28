// ModelSpec → VoxelGrid。語意見 SUPERPROMPT.md 6.2。
// 格子的高度單位是 plate（3.2 mm）：spec 的 z 用「層」（一塊磚高），一層是 3 格。曲面因此能做出 1/3 層的階梯。
import { findColorByName, getColor, hasCombo } from "./palette";
import { LAYER_RATIO, type ModelSpec, partExtent, type Shape, shapeBounds, TOPS, type Vec3 } from "./spec";
import { type Axis, CELL_PARTS, WHEELS, wheelArchOffsets } from "./special";

/** 一層（一塊磚高）有幾格 plate */
export const PLATES_PER_LAYER = 3;
/** 底板幾片 plate 厚：兩層接縫錯開，整片才會連在一起 */
export const BASE_PLATES = 2;

/** 特殊零件放在格子上的位置（z 與 h 的單位是 plate）。wheels 在這裡是輪軸座，輪框和輪胎之後才掛上去。 */
export type SpecialPlacement = {
  partNum: string;
  colorId: number;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  axis?: Axis;
  rimColor?: number;
};

export type VoxelGrid = {
  /** [W, D, H]，H 的單位是 plate */
  size: [number, number, number];
  /** Rebrickable 色號，-1 是空。index = x + W*(y + D*z)，z 是第幾格 plate */
  cells: Int16Array;
  /** 每一格最後是被哪一個部位設定的，-1 是空。先是 spec.shapes 的索引，接著是 spec.parts（加上 shapes 的數量）。 */
  labelIndex: Int16Array;
  /** 每一格的頂面處理，值是 TOPS 的索引（0 是 studs） */
  finish: Uint8Array;
  /** 每一格屬於 specials 的第幾個，-1 是一般的磚 */
  special: Int16Array;
  specials: SpecialPlacement[];
  /** 底板的厚度（格）：有底板時 z < zOffset 是底板，模型從 z = zOffset 開始 */
  zOffset: number;
  /** 鎖住的格子：只有同色的磚能蓋（內部格子不能被別的顏色順便蓋掉），見 support.ts 的 attachSideways */
  pinned: Uint8Array;
  /** 每個部位（labelIndex）的鏡射設定，補接合時另一邊也要做一樣的事 */
  labelMirror: ("none" | "x" | "y")[];
};

export const FINISH = { studs: 0, tiles: 1, slopes: 2, plate: 3 } as const;

export function emptyGrid(W: number, D: number, H: number): VoxelGrid {
  const n = W * D * H;
  return {
    size: [W, D, H],
    cells: new Int16Array(n).fill(-1),
    labelIndex: new Int16Array(n).fill(-1),
    finish: new Uint8Array(n),
    special: new Int16Array(n).fill(-1),
    specials: [],
    zOffset: 0,
    pinned: new Uint8Array(n),
    labelMirror: [],
  };
}

/** 把一格清空（連同頂面處理與特殊零件標記）。 */
export function clearCell(grid: VoxelGrid, i: number) {
  grid.cells[i] = -1;
  grid.labelIndex[i] = -1;
  grid.finish[i] = 0;
  grid.special[i] = -1;
}

export const cellIndex = (grid: VoxelGrid, x: number, y: number, z: number) =>
  x + grid.size[0] * (y + grid.size[1] * z);

/** 格子中心 p 在不在形狀內（不含 cells，cells 另外處理）。 */
function contains(s: Exclude<Shape, { shape: "cells" }>, p: Vec3): boolean {
  if (s.shape === "box") {
    return p.x >= s.min.x && p.x < s.max.x && p.y >= s.min.y && p.y < s.max.y && p.z >= s.min.z && p.z < s.max.z;
  }
  if (s.shape === "ellipsoid") {
    const dx = (p.x - s.center.x) / s.radius.x;
    const dy = (p.y - s.center.y) / s.radius.y;
    const dz = ((p.z - s.center.z) * LAYER_RATIO) / s.radius.z;
    return dx * dx + dy * dy + dz * dz <= 1;
  }
  // cylinder：沿 axis 的座標在 [from, to)，半徑線性內插；z 方向的差先乘 1.2 換成 stud
  const t = p[s.axis];
  if (t < s.from || t >= s.to) return false;
  const r = s.radius + ((s.radiusEnd - s.radius) * (t - s.from)) / (s.to - s.from);
  const dx = s.axis === "x" ? 0 : p.x - s.center.x;
  const dy = s.axis === "y" ? 0 : p.y - s.center.y;
  const dz = s.axis === "z" ? 0 : (p.z - s.center.z) * LAYER_RATIO;
  return dx * dx + dy * dy + dz * dz <= r * r;
}

/**
 * 做工選項（見 tiers.ts 的三個版本）。
 * coarse：曲面上緣四捨五入到整層、不自動換斜面、不鋪 tile，零件少；tiles：box 露出的頂面鋪 tile。
 */
export type VoxelOptions = { coarse?: boolean; tiles?: boolean };

/** 體素化。spec 應該已經過 normalizeSpec。每一格 plate 看它的中心（換算成層）在不在形狀裡。 */
export function voxelize(spec: ModelSpec, opts: VoxelOptions = {}): VoxelGrid {
  const P = PLATES_PER_LAYER;
  const W = Math.floor(spec.size.x), D = Math.floor(spec.size.y), H = Math.floor(spec.size.z);
  const baseColor = spec.base ? (findColorByName(spec.base)?.rebrickable_id ?? -1) : -1;
  const off = baseColor === -1 ? 0 : BASE_PLATES;
  const grid = emptyGrid(W, D, H * P + off);
  grid.zOffset = off;
  grid.labelMirror = [...spec.shapes.map((sh) => sh.mirror), ...(spec.parts ?? []).map((p) => p.mirror), "none"];
  const size = { x: W, y: D, z: H };
  // 哪些格子是球、圓柱蓋出來的（paint 不改），下面要對齊它們的下緣
  const curved = new Uint8Array(grid.cells.length);

  spec.shapes.forEach((shape, shapeIdx) => {
    const colorId = findColorByName(shape.color)?.rebrickable_id ?? -1;
    // 球、圓柱沒指定特別的頂面處理時，邊緣自動換斜面
    const curvedShape = shape.shape === "ellipsoid" || shape.shape === "cylinder";
    const top = shape.top ?? "studs";
    let finish = TOPS.indexOf(top);
    if (top === "studs" && curvedShape && !opts.coarse) finish = FINISH.slopes;
    if (top === "studs" && !curvedShape && opts.tiles) finish = FINISH.tiles;
    if (top === "tiles" && opts.coarse) finish = FINISH.studs;
    const apply = (x: number, y: number, z: number) => {
      const i = x + W * (y + D * z);
      if (shape.op === "add") {
        grid.cells[i] = colorId;
        grid.labelIndex[i] = shapeIdx;
        grid.finish[i] = finish;
        curved[i] = shape.shape === "ellipsoid" || shape.shape === "cylinder" ? 1 : 0;
      } else if (shape.op === "remove") {
        clearCell(grid, i);
        curved[i] = 0;
      } else if (grid.cells[i] !== -1) {
        // paint 只換顏色，頂面處理跟著原本的形狀
        grid.cells[i] = colorId;
        grid.labelIndex[i] = shapeIdx;
      }
    };
    // mirror 在格子層級做：原形狀蓋到 (i,j,k)，"x" 再蓋 (W-1-i,j,k)，"y" 再蓋 (i,D-1-j,k)
    const hit = (x: number, y: number, z: number) => {
      apply(x, y, z);
      if (shape.mirror === "x") apply(W - 1 - x, y, z);
      else if (shape.mirror === "y") apply(x, D - 1 - y, z);
    };

    if (shape.shape === "cells") {
      for (const c of shape.cells) {
        if (c.x >= 0 && c.y >= 0 && c.z >= 0 && c.x < W && c.y < D && c.z < H) for (let k = 0; k < P; k++) hit(c.x, c.y, c.z * P + k + off);
      }
      return;
    }
    const b = shapeBounds(shape, size);
    if (!b) return;
    // 先收集原形狀的格子，再一次套用，避免 mirror 的結果影響同一個形狀的 paint 判斷
    const hits: number[] = [];
    for (let z = b.lo.z * P; z < b.hi.z * P; z++)
      for (let y = b.lo.y; y < b.hi.y; y++)
        for (let x = b.lo.x; x < b.hi.x; x++)
          if (contains(shape, { x: x + 0.5, y: y + 0.5, z: (z + 0.5) / P })) hits.push(x, y, z + off);
    for (let k = 0; k < hits.length; k += 3) hit(hits[k], hits[k + 1], hits[k + 2]);
  });

  const Hp = H * P + off;
  // 曲面的每一段（同一柱連續有東西的格子）：下緣往下對齊到整層、不到一層厚的補成一層。
  // 下緣一片一片往外長會懸空要補支撐，只有一片厚的外圈也接不到主體；上緣保留 1/3 層的細階梯（粗做時四捨五入到整層）
  snapRuns(grid, (i) => curved[i] === 1, !!opts.coarse);

  // 頂面設成 plate：最上面那一層、上面沒東西的格子，只留那一層最下面的一片
  for (let y = 0; y < D; y++)
    for (let x = 0; x < W; x++)
      for (let z = off; z < Hp; z++) {
        const i = x + W * (y + D * z);
        if (grid.cells[i] === -1 || grid.finish[i] !== FINISH.plate) continue;
        if (z + 1 < Hp && grid.cells[i + W * D] !== -1) continue;
        for (let k = z - ((z - off) % P) + 1; k <= z; k++) {
          const j = x + W * (y + D * k);
          if (grid.finish[j] === FINISH.plate) clearCell(grid, j);
        }
      }

  // 底板：最下面兩片整面鋪滿，組磚時只放得下 plate，會用大片的
  const baseLabel = spec.shapes.length + (spec.parts?.length ?? 0);
  for (let i = 0; i < W * D * off; i++) {
    grid.cells[i] = baseColor;
    grid.labelIndex[i] = baseLabel;
  }
  return grid;
}

/** 以面相鄰（6 個方向）找連通元件，沒碰到 z = 0 的整塊移除。回傳移除的格數；labels 有給就收集被移除格子的部位。 */
export function removeFloatingIslands(grid: VoxelGrid, labels?: Set<number>): number {
  const [W, D, H] = grid.size;
  const c = grid.cells;
  const seen = new Uint8Array(c.length);
  const stack = new Int32Array(c.length);
  let removed = 0;
  for (let s = 0; s < c.length; s++) {
    if (c[s] === -1 || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    const comp: number[] = [];
    let grounded = false;
    while (sp) {
      const i = stack[--sp];
      comp.push(i);
      const x = i % W, y = Math.floor(i / W) % D, z = Math.floor(i / (W * D));
      // 輪子那一層貼地的輪軸座也算接地：輪胎著地
      if (z === 0 || (z === PLATES_PER_LAYER - 1 && grid.special[i] !== -1 && grid.specials[grid.special[i]]?.partNum === WHEELS.holder)) grounded = true;
      const nb: number[] = [];
      if (x > 0) nb.push(i - 1);
      if (x < W - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - W);
      if (y < D - 1) nb.push(i + W);
      if (z > 0) nb.push(i - W * D);
      if (z < H - 1) nb.push(i + W * D);
      for (const j of nb) if (c[j] !== -1 && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
    }
    if (!grounded) {
      for (const i of comp) {
        if (labels && grid.labelIndex[i] !== -1) labels.add(grid.labelIndex[i]);
        clearCell(grid, i);
      }
      removed += comp.length;
    }
  }
  return removed;
}

export function countFilled(grid: VoxelGrid): number {
  let n = 0;
  for (const v of grid.cells) if (v !== -1) n++;
  return n;
}

/**
 * 把 spec.parts 的特殊零件放上格子（在 voxelize 之後、移除懸空之前呼叫）。回傳警告。
 * 圓磚、錐體直接占格子；全部放完後，錐體頂端上面還有東西就改成同尺寸的圓磚。
 * 輪子組：上面要有車身，輪軸座占 z 層那 2x2 最上面一片 plate，兩側輪拱在 z、z+1 兩層挖空。
 */
export function applyParts(grid: VoxelGrid, spec: ModelSpec): string[] {
  const P = PLATES_PER_LAYER;
  const off = grid.zOffset;
  const [W, D, H] = grid.size;
  const warnings: string[] = [];
  const idx = (x: number, y: number, z: number) => x + W * (y + D * z);
  const inside = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < H;
  const filled = (x: number, y: number, z: number) => inside(x, y, z) && grid.cells[idx(x, y, z)] !== -1;
  const setCell = (x: number, y: number, z: number, colorId: number, label: number, special: number) => {
    const i = idx(x, y, z);
    grid.cells[i] = colorId;
    grid.labelIndex[i] = label;
    grid.finish[i] = 0;
    grid.special[i] = special;
  };

  (spec.parts ?? []).forEach((p, pi) => {
    const label = spec.shapes.length + pi;
    const colorId = findColorByName(p.color)?.rebrickable_id ?? -1;
    const colorZh = colorId === -1 ? p.color : (getColor(colorId).name_zh ?? p.color);
    const e = partExtent(p);
    const anchors: Vec3[] = [p.at];
    // 放在正中間的零件鏡射後是同一個位置，不要放兩次
    if (p.mirror === "x" && W - p.at.x - e.w !== p.at.x) anchors.push({ ...p.at, x: W - p.at.x - e.w });
    else if (p.mirror === "y" && D - p.at.y - e.d !== p.at.y) anchors.push({ ...p.at, y: D - p.at.y - e.d });

    for (const a of anchors) {
      if (p.part === "wheels") {
        const axis = p.axis ?? "x";
        // 輪子那一層的格子範圍 [z0, z0 + P)，輪軸座是最上面那一片
        const z0 = a.z * P + off, zh = z0 + P - 1;
        let bodyAbove = true;
        for (let y = a.y; y < a.y + 2; y++) for (let x = a.x; x < a.x + 2; x++) if (!filled(x, y, z0 + P)) bodyAbove = false;
        if (!bodyAbove) {
          warnings.push(`「${p.label}」上面沒有車身可以扣，輪子沒有裝上`);
          continue;
        }
        // 輪拱是設計好的行為（prompt 有寫），挖掉車身的格子不發警告
        for (let z = z0; z < z0 + 2 * P; z++)
          for (const [dx, dy] of wheelArchOffsets(axis)) {
            const x = a.x + dx, y = a.y + dy;
            if (filled(x, y, z)) clearCell(grid, idx(x, y, z));
          }
        for (let z = z0; z < zh; z++)
          for (let y = a.y; y < a.y + 2; y++) for (let x = a.x; x < a.x + 2; x++) if (filled(x, y, z)) clearCell(grid, idx(x, y, z));
        let rimColor = colorId;
        if (!hasCombo(WHEELS.rim, colorId)) {
          rimColor = WHEELS.fallbackRimColor;
          warnings.push(`「${p.label}」的輪框沒有${colorZh}，改用淺灰色`);
        }
        const si = grid.specials.length;
        grid.specials.push({ partNum: WHEELS.holder, colorId: WHEELS.holderColor, x: a.x, y: a.y, z: zh, w: 2, d: 2, h: 1, axis, rimColor });
        for (let y = a.y; y < a.y + 2; y++) for (let x = a.x; x < a.x + 2; x++) setCell(x, y, zh, WHEELS.holderColor, label, si);
        continue;
      }

      const def = CELL_PARTS[p.part];
      const ok = hasCombo(def.partNum, colorId);
      if (!ok) warnings.push(`「${p.label}」的${def.nameZh}近期沒有${colorZh}，改用一般的磚`);
      const si = ok ? grid.specials.length : -1;
      if (ok) grid.specials.push({ partNum: def.partNum, colorId, x: a.x, y: a.y, z: a.z * P + off, w: def.size, d: def.size, h: def.layers * P });
      for (let z = a.z * P + off; z < (a.z + def.layers) * P + off; z++)
        for (let y = a.y; y < a.y + def.size; y++)
          for (let x = a.x; x < a.x + def.size; x++) setCell(x, y, z, colorId, label, si);
    }
  });

  // 錐體頂端不能再接東西。全部零件放完才檢查，後放的零件疊上去也算到
  const cells = (s: SpecialPlacement) => {
    const out: number[] = [];
    for (let z = s.z; z < s.z + s.h; z++)
      for (let y = s.y; y < s.y + s.d; y++)
        for (let x = s.x; x < s.x + s.w; x++) out.push(idx(x, y, z));
    return out;
  };
  grid.specials.forEach((s, si) => {
    const cone = Object.values(CELL_PARTS).find((c) => c.partNum === s.partNum && c.closedTop);
    if (!cone || !cells(s).every((i) => grid.cells[i] !== -1 && grid.special[i] === si)) return;
    let above = false;
    for (let y = s.y; y < s.y + s.d; y++) for (let x = s.x; x < s.x + s.w; x++) if (filled(x, y, s.z + s.h)) above = true;
    if (!above) return;
    const label = spec.parts?.[grid.labelIndex[idx(s.x, s.y, s.z)] - spec.shapes.length]?.label ?? "錐體";
    const round = s.w === 1 ? CELL_PARTS.round_1x1 : CELL_PARTS.round_2x2;
    if (!hasCombo(round.partNum, s.colorId)) {
      const colorZh = getColor(s.colorId).name_zh ?? getColor(s.colorId).name;
      warnings.push(`「${label}」上面還有東西，錐體頂端接不了，${colorZh}又沒有${round.nameZh}，改用一般的磚`);
      for (const i of cells(s)) grid.special[i] = -1;
      return;
    }
    warnings.push(`「${label}」上面還有東西，錐體頂端接不了，改成${round.nameZh}`);
    // 每一層一塊圓磚（錐體 2x2x2 改成兩塊疊起來）
    grid.specials[si] = { ...s, partNum: round.partNum, h: P };
    for (let z = s.z + P; z < s.z + s.h; z += P) {
      const sj = grid.specials.length;
      grid.specials.push({ ...s, partNum: round.partNum, z, h: P });
      for (let zz = z; zz < z + P; zz++)
        for (let y = s.y; y < s.y + s.d; y++) for (let x = s.x; x < s.x + s.w; x++) grid.special[idx(x, y, zz)] = sj;
    }
  });
  return warnings;
}

/**
 * 每一柱連續有東西的一段（which 選中那段最下面一格才處理）：下緣往下對齊到整層，
 * 上緣至少一層；coarse 時上緣四捨五入到整層，不留 1/3 層的階梯。
 */
export function snapRuns(grid: VoxelGrid, which: (i: number) => boolean, coarse: boolean) {
  const P = PLATES_PER_LAYER;
  const [W, D, Hp] = grid.size;
  const off = grid.zOffset;
  const copyCell = (from: number, to: number) => {
    grid.cells[to] = grid.cells[from];
    grid.labelIndex[to] = grid.labelIndex[from];
    grid.finish[to] = grid.finish[from];
  };
  for (let y = 0; y < D; y++)
    for (let x = 0; x < W; x++) {
      const at = (z: number) => x + W * (y + D * z);
      let z = off;
      while (z < Hp) {
        if (grid.cells[at(z)] === -1) { z++; continue; }
        let top = z;
        while (top < Hp && grid.cells[at(top)] !== -1) top++;
        if (which(at(z))) {
          const bottom = z - ((z - off) % P);
          for (let k = bottom; k < z; k++) copyCell(at(z), at(k));
          const want = coarse ? bottom + P * Math.max(1, Math.round((top - bottom) / P)) : Math.max(top, bottom + P);
          for (let k = top; k < Math.min(Hp, want); k++) copyCell(at(top - 1), at(k));
          for (let k = want; k < top; k++) clearCell(grid, at(k));
          top = Math.min(Hp, Math.max(top, want));
        }
        z = top;
      }
    }
}

/**
 * 把整個格子縮放 s 倍（放大或縮小），同一份設計做出大小不同的版本（見 tiers.ts）。
 * 每個新格子看它中心對到原本的哪一格，剛好卡在格線上就往模型中線取，鏡射對稱的設計縮放後還是對稱。
 * 放大：原本每一格都會出現，1 格的眼睛變 1 到 2 格，比例跟著放大。
 * 縮小：新格子蓋到的原格子只要有一格有東西就算有，相鄰的部位縮完一定還相鄰；顏色先取中心那格，中心是空的就取多數。
 * 特殊零件縮放不了，變成一般的格子；縮完每一段下緣對齊整層，coarse 時上緣也四捨五入到整層。
 */
export function resampleGrid(src: VoxelGrid, s: number, coarse: boolean): VoxelGrid {
  const P = PLATES_PER_LAYER;
  const [W, D, Hp] = src.size;
  const off = src.zOffset;
  const W2 = Math.max(1, Math.round(W * s)), D2 = Math.max(1, Math.round(D * s));
  const Hm = Hp - off, Hm2 = Math.max(1, Math.round((Hm / P) * s)) * P;
  const out = emptyGrid(W2, D2, Hm2 + off);
  out.zOffset = off;
  out.labelMirror = src.labelMirror;
  // 新格子 t 在原格子的中心位置；卡在格線上時往中線取（mirror 才會對稱）
  const center = (t: number, n: number, n2: number, symmetric: boolean) => {
    const c = ((t + 0.5) * n) / n2;
    const k = symmetric && c >= n / 2 && Number.isInteger(c) ? c - 1 : Math.floor(c);
    return Math.min(n - 1, Math.max(0, k));
  };
  // 縮小時新格子蓋到的原格子範圍 [lo, hi)
  const cover = (t: number, n: number, n2: number) => {
    const lo = Math.floor((t * n) / n2), hi = Math.ceil(((t + 1) * n) / n2);
    return [lo, Math.max(lo + 1, Math.min(n, hi))];
  };
  const shrink = s < 1;
  const at = (x: number, y: number, z: number) => x + W * (y + D * z);
  for (let z = 0; z < Hm2 + off; z++) {
    const zc = z < off ? z : off + center(z - off, Hm, Hm2, false);
    const [z0, z1] = z < off ? [z, z + 1] : cover(z - off, Hm, Hm2).map((v) => v + off);
    for (let y = 0; y < D2; y++) {
      const yc = center(y, D, D2, true);
      const [y0, y1] = cover(y, D, D2);
      for (let x = 0; x < W2; x++) {
        const xc = center(x, W, W2, true);
        let pick = at(xc, yc, zc);
        if (src.cells[pick] === -1 && shrink) {
          const votes = new Map<number, number>();
          pick = -1;
          const [x0, x1] = cover(x, W, W2);
          for (let zz = z0; zz < z1; zz++)
            for (let yy = y0; yy < y1; yy++)
              for (let xx = x0; xx < x1; xx++) {
                const i = at(xx, yy, zz);
                if (src.cells[i] === -1) continue;
                const n = (votes.get(src.cells[i]) ?? 0) + 1;
                votes.set(src.cells[i], n);
                if (pick === -1 || n > (votes.get(src.cells[pick]) ?? 0)) pick = i;
              }
        }
        if (pick === -1 || src.cells[pick] === -1) continue;
        const o = x + W2 * (y + D2 * z);
        out.cells[o] = src.cells[pick];
        out.labelIndex[o] = src.labelIndex[pick];
        out.finish[o] = src.finish[pick];
      }
    }
  }
  snapRuns(out, () => true, coarse);
  return out;
}
