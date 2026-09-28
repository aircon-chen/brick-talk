// VoxelGrid → Brick[]。一般格子移植 docs/reference/legolize.mjs，行為要完全一致（SUPERPROMPT.md 7.4、附錄 B）。
// 格子高度的單位是 plate：每個位置先試 brick（往上 3 格都放得下），放不下才用 plate。整數層的模型結果跟以前完全一樣。
// 另外先放特殊零件（圓磚、錐體、輪軸座）和頂面斜面。
import { type BrickSize, brickSizesForColor, getPart, sizesForColor, slopesForColor } from "./palette";
import { WHEELS } from "./special";
import { FINISH, PLATES_PER_LAYER, type VoxelGrid } from "./voxelize";

/** 方向：斜面往下坡的方向；輪軸座是輪軸方向（+x 或 +y）；輪框、輪胎是在輪軸座的哪一側。 */
export type Dir = "+x" | "-x" | "+y" | "-y";

export type Brick = {
  /** 依 (z, y, x) 排序後編號，從 0 開始 */
  id: number;
  partNum: string;
  /** Rebrickable 色號 */
  colorId: number;
  x: number;
  y: number;
  /** 底部在第幾格 plate。高度看零件（brick 3、plate 1、錐體 2x2x2 是 6） */
  z: number;
  /** x 方向 stud 數 */
  w: number;
  /** y 方向 stud 數 */
  d: number;
  dir?: Dir;
  /** 掛在哪塊磚上、不占格子（輪框、輪胎掛在輪軸座上） */
  attachedTo?: number;
};

/** 這塊零件碰到地面：底部在 z = 0，或是輪子那一層貼地的輪軸座（輪胎著地）。 */
export function touchesGround(b: Brick): boolean {
  return b.z === 0 || (b.partNum === WHEELS.holder && b.z === PLATES_PER_LAYER - 1);
}

/** 零件高幾格 plate。掛在別的磚上的（輪框、輪胎）是 0。 */
export function brickHeight(b: Brick): number {
  return b.attachedTo !== undefined ? 0 : getPart(b.partNum).height_plates;
}

/** 磚占的格子 index。掛在別的磚上的（輪框、輪胎）和鋪在頂面上的 tile 不占格子。 */
export function brickCellIndices(b: Brick, size: [number, number, number]): number[] {
  if (b.attachedTo !== undefined || getPart(b.partNum).kind === "tile") return [];
  const [W, D] = size;
  const out: number[] = [];
  for (let z = b.z; z < b.z + brickHeight(b); z++)
    for (let y = b.y; y < b.y + b.d; y++)
      for (let x = b.x; x < b.x + b.w; x++) out.push(x + W * (y + D * z));
  return out;
}

const DIRS: [Dir, number, number][] = [["-y", 0, -1], ["+y", 0, 1], ["-x", -1, 0], ["+x", 1, 0]];

/** 斜面最多幾格寬（2 x 4） */
const SLOPE_MAX_WIDTH = 4;

export type LegolizeResult = {
  bricks: Brick[];
  /** 每一格屬於哪塊磚（brick id），-1 是空 */
  owner: Int32Array;
};

export const SEAM_PENALTY = 25;
/** 錯縫層一排第一塊磚的長邊上限 */
const STAGGER_MAX = 4;

/** noSlope：這些格子不准放斜面（放了會讓模型斷開，見 support.ts 的 legolizeConnected） */
export function legolize(grid: VoxelGrid, sizesByColor: (colorId: number) => BrickSize[] = brickSizesForColor, noSlope?: Uint8Array): LegolizeResult {
  const P = PLATES_PER_LAYER;
  const [W, D, H] = grid.size;
  const c = grid.cells;
  const idx = (x: number, y: number, z: number) => x + W * (y + D * z);
  const filled = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < H && c[idx(x, y, z)] !== -1;
  const owner = new Int32Array(c.length).fill(-1);
  type Raw = Omit<Brick, "id">;
  const raw: Raw[] = [];
  const claim = (bi: number, x0: number, y0: number, z0: number, w: number, d: number, h: number) => {
    for (let z = z0; z < z0 + h; z++) for (let y = y0; y < y0 + d; y++) for (let x = x0; x < x0 + w; x++) owner[idx(x, y, z)] = bi;
  };

  // 特殊零件：占的格子都還在（沒被移除、沒被後面的零件蓋掉）才放，放不了的格子當一般格子
  grid.specials.forEach((s, si) => {
    for (let z = s.z; z < s.z + s.h; z++)
      for (let y = s.y; y < s.y + s.d; y++)
        for (let x = s.x; x < s.x + s.w; x++) if (!filled(x, y, z) || grid.special[idx(x, y, z)] !== si) return;
    const bi = raw.length;
    raw.push({
      partNum: s.partNum, colorId: s.colorId, x: s.x, y: s.y, z: s.z, w: s.w, d: s.d,
      ...(s.axis ? { dir: s.axis === "x" ? "+x" : "+y" } as const : {}),
    });
    claim(bi, s.x, s.y, s.z, s.w, s.d, s.h);
  });

  /** 斜面的前排：一整柱（一層磚高）頂面露出（倒斜面是底面露出）、前面空著，後排同色而且還沒被占。 */
  const slopeFront = (x: number, y: number, z: number, dx: number, dy: number, inverted = false): boolean => {
    if (!filled(x, y, z)) return false;
    const color = c[idx(x, y, z)];
    const bx = x - dx, by = y - dy;
    for (let k = 0; k < P; k++) {
      const i = idx(x, y, z + k);
      if (!filled(x, y, z + k) || c[i] !== color || owner[i] !== -1 || grid.finish[i] !== FINISH.slopes || noSlope?.[i]) return false;
      if (filled(x + dx, y + dy, z + k)) return false;
      if (!filled(bx, by, z + k)) return false;
      const j = idx(bx, by, z + k);
      if (c[j] !== color || owner[j] !== -1 || noSlope?.[j]) return false;
    }
    // 倒斜面：下面空著（懸出來的底面）、上面要有東西扣住；一般斜面：上面空著、下面要有東西撐。
    // 不然斜面會變成一小塊沒接到主體的零件（例如圓錐最底下那一圈），留給一般磚橫向接回去
    if (inverted) return z > grid.zOffset && !filled(x, y, z - 1) && (filled(x, y, z + P) || filled(bx, by, z + P));
    return !filled(x, y, z + P) && (z === grid.zOffset || filled(x, y, z - 1) || filled(bx, by, z - 1));
  };
  const placeSlopes = (z: number) => {
    // 只放在對齊整層的高度：錯開一兩片 plate 的斜面會讓周圍的磚也錯位，接不起來
    if ((z - grid.zOffset) % P !== 0) return;
    for (let y = 0; y < D; y++)
      for (let x = 0; x < W; x++) {
        let placed = false;
        for (const inverted of [false, true]) {
          if (placed) break;
          for (const [dir, dx, dy] of DIRS) {
            if (!slopeFront(x, y, z, dx, dy, inverted)) continue;
            const color = c[idx(x, y, z)];
            const options = slopesForColor(color, inverted ? "slope45_inv" : "slope45");
            if (!options.length) break;
            // 沿垂直斜面的方向延伸，同一排越寬越好
            const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0;
            let run = 1;
            while (run < SLOPE_MAX_WIDTH && slopeFront(x + px * run, y + py * run, z, dx, dy, inverted) && c[idx(x + px * run, y + py * run, z)] === color) run++;
            const pick = options.find((o) => o.width <= run);
            if (!pick) break;
            const bi = raw.length;
            const x0 = Math.min(x, x - dx), y0 = Math.min(y, y - dy);
            const w = dx !== 0 ? 2 : pick.width, d = dy !== 0 ? 2 : pick.width;
            raw.push({ partNum: pick.partNum, colorId: color, x: x0, y: y0, z, w, d, dir });
            claim(bi, x0, y0, z, w, d, P);
            placed = true;
            break;
          }
        }
      }
  };

  // 內部格子：6 個鄰居都有東西，外面看不到。任何顏色的磚都可以蓋它（磚的顏色以錨點格為準）。
  const interior = new Uint8Array(c.length);
  for (let z = 0; z < H; z++)
    for (let y = 0; y < D; y++)
      for (let x = 0; x < W; x++)
        if (filled(x, y, z) && filled(x - 1, y, z) && filled(x + 1, y, z) && filled(x, y - 1, z) &&
            filled(x, y + 1, z) && filled(x, y, z - 1) && filled(x, y, z + 1)) interior[idx(x, y, z)] = 1;

  const seam = (z: number, ax: number, ay: number, bx: number, by: number) => {
    if (ax < 0 || ay < 0 || bx >= W || by >= D) return false;
    const a = owner[idx(ax, ay, z - 1)], b = owner[idx(bx, by, z - 1)];
    return a !== -1 && b !== -1 && a !== b;
  };
  /** w×d、高 h 格的零件放得下：每一格都沒被占，而且同色或是內部格子 */
  const fits = (x: number, y: number, z: number, w: number, d: number, h: number, color: number) => {
    if (x + w > W || y + d > D || z + h > H) return false;
    for (let zz = z; zz < z + h; zz++)
      for (let yy = y; yy < y + d; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const j = idx(xx, yy, zz);
          if ((c[j] !== color && (!interior[j] || grid.pinned[j])) || owner[j] !== -1) return false;
        }
    return true;
  };
  const scoreOf = (x: number, y: number, z: number, w: number, d: number, alongX: boolean) => {
    let score = 10 * w * d;
    if (z > 0) {
      const below = new Set<number>();
      for (let yy = y; yy < y + d; yy++)
        for (let xx = x; xx < x + w; xx++) {
          const o = owner[idx(xx, yy, z - 1)];
          if (o !== -1) below.add(o);
        }
      score += 6 * below.size;
      // 對齊的縫：沿這條邊的每一格，邊兩側正下方都有磚而且分屬不同塊。模型外緣不算。
      let aligned = 0;
      let all = true;
      for (let yy = y; yy < y + d; yy++) if (!seam(z, x - 1, yy, x, yy)) { all = false; break; }
      if (all) aligned++;
      all = true;
      for (let yy = y; yy < y + d; yy++) if (!seam(z, x + w - 1, yy, x + w, yy)) { all = false; break; }
      if (all) aligned++;
      all = true;
      for (let xx = x; xx < x + w; xx++) if (!seam(z, xx, y - 1, xx, y)) { all = false; break; }
      if (all) aligned++;
      all = true;
      for (let xx = x; xx < x + w; xx++) if (!seam(z, xx, y + d - 1, xx, y + d)) { all = false; break; }
      if (all) aligned++;
      score -= SEAM_PENALTY * aligned;
      if (below.size === 0) score -= 1000;
    }
    if (alongX ? w >= d : d >= w) score += 2; // 方向符合偏好（正方形也算）
    return score;
  };

  // 底板兩層：整片先排好，確定兩層連成一塊（見 tileBase）
  if (grid.zOffset > 0) {
    const color = c[0];
    for (const piece of tileBase(W, D, color)) {
      claim(raw.length, piece.x, piece.y, piece.z, piece.w, piece.d, 1);
      raw.push({ ...piece, colorId: color });
    }
  }

  for (let z = 0; z < H; z++) {
    placeSlopes(z);
    // 方向與錯縫照「第幾層磚」算，整數層的模型才會跟以前一樣
    const L = Math.floor((z - grid.zOffset) / P);
    const alongX = L % 2 === 0; // 偶數層長邊偏好沿 x，奇數層沿 y
    const stagger = L % 4 === 1 || L % 4 === 2; // 錯縫層
    const coords: [number, number][] = [];
    if (alongX) { for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) coords.push([x, y]); }
    else { for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) coords.push([x, y]); }

    for (const [x, y] of coords) {
      const i = idx(x, y, z);
      if (c[i] === -1 || owner[i] !== -1) continue;
      const color = c[i];
      const runStart = alongX ? !filled(x - 1, y, z) : !filled(x, y - 1, z);
      const perpStart = alongX ? !filled(x, y - 1, z) : !filled(x - 1, y, z);
      let best: (BrickSize & { score: number; h: number }) | null = null;

      for (const cand of sizesByColor(color)) {
        const { w, d } = cand;
        if (stagger && runStart && Math.max(w, d) > STAGGER_MAX) continue; // 錯縫：一排的第一塊最長 4
        if (stagger && perpStart && (alongX ? d : w) > 1) continue; // 錯縫：第一排只放 1 格寬
        if (!fits(x, y, z, w, d, P, color)) continue;
        const score = scoreOf(x, y, z, w, d, alongX);
        if (best === null || score > best.score) best = { ...cand, score, h: P };
      }
      // 往上不到 3 格（曲面的階梯、薄的部位）才用 plate。plate 上面常常不會再疊東西，不套錯縫，才能用大片的跨過去
      if (!best) {
        for (const cand of sizesForColor("plate", color)) {
          if (!fits(x, y, z, cand.w, cand.d, 1, color)) continue;
          const score = scoreOf(x, y, z, cand.w, cand.d, alongX);
          if (best === null || score > best.score) best = { ...cand, score, h: 1 };
        }
      }
      if (!best) throw new Error(`no brick fits color ${color} at (${x},${y},${z})`);
      const bi = raw.length;
      raw.push({ partNum: best.partNum, colorId: color, x, y, z, w: best.w, d: best.d });
      claim(bi, x, y, z, best.w, best.d, best.h);
    }
  }

  // id 依 (z, y, x) 排序後重新編號
  const order = raw.map((_, i) => i).sort((a, b) => raw[a].z - raw[b].z || raw[a].y - raw[b].y || raw[a].x - raw[b].x);
  const remap = new Int32Array(raw.length);
  order.forEach((old, n) => (remap[old] = n));
  for (let i = 0; i < owner.length; i++) if (owner[i] !== -1) owner[i] = remap[owner[i]];
  return { bricks: order.map((old, n) => ({ id: n, ...raw[old] })), owner };
}

type Tile = { partNum: string; x: number; y: number; z: number; w: number; d: number };

/** 在 W×D 的範圍用 plate 鋪滿：先在 (sx, sy) 起算的格子放 S×S 正方形，剩下的從左上往右下放放得下的最大片。 */
function tileLayer(W: number, D: number, z: number, sizes: BrickSize[], S: number, sx: number, sy: number): Tile[] {
  const used = new Uint8Array(W * D);
  const out: Tile[] = [];
  const free = (x: number, y: number, w: number, d: number) => {
    if (x + w > W || y + d > D) return false;
    for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) if (used[xx + W * yy]) return false;
    return true;
  };
  const put = (s: BrickSize, x: number, y: number) => {
    for (let yy = y; yy < y + s.d; yy++) for (let xx = x; xx < x + s.w; xx++) used[xx + W * yy] = 1;
    out.push({ partNum: s.partNum, x, y, z, w: s.w, d: s.d });
  };
  const sq = sizes.find((s) => s.w === S && s.d === S);
  if (sq) for (let y = sy; y + S <= D; y += S) for (let x = sx; x + S <= W; x += S) put(sq, x, y);
  for (let y = 0; y < D; y++)
    for (let x = 0; x < W; x++) {
      if (used[x + W * y]) continue;
      const s = sizes.find((c) => free(x, y, c.w, c.d));
      if (s) put(s, x, y);
    }
  return out;
}

/**
 * 上層專用：每個位置挑「跨過下層接縫」的那片——壓住越多片下層越好，邊緣別跟下層接縫對齊，最後才看面積。
 */
function tileCrossing(W: number, D: number, z: number, sizes: BrickSize[], lower: Tile[], byColumn: boolean): Tile[] {
  const below = new Int32Array(W * D);
  lower.forEach((t, i) => { for (let y = t.y; y < t.y + t.d; y++) for (let x = t.x; x < t.x + t.w; x++) below[x + W * y] = i; });
  const used = new Uint8Array(W * D);
  const out: Tile[] = [];
  for (let a = 0; a < W * D; a++) {
      const x = byColumn ? Math.floor(a / D) : a % W, y = byColumn ? a % D : Math.floor(a / W);
      if (used[x + W * y]) continue;
      let best: { s: BrickSize; score: number } | null = null;
      for (const s of sizes) {
        if (x + s.w > W || y + s.d > D) continue;
        let ok = true;
        const covered = new Set<number>();
        for (let yy = y; yy < y + s.d && ok; yy++)
          for (let xx = x; xx < x + s.w; xx++) {
            if (used[xx + W * yy]) { ok = false; break; }
            covered.add(below[xx + W * yy]);
          }
        if (!ok) continue;
        // 右邊、下邊整條都落在下層接縫上就是對齊的縫
        let aligned = 0;
        if (x + s.w < W) { let all = true; for (let yy = y; yy < y + s.d; yy++) if (below[x + s.w - 1 + W * yy] === below[x + s.w + W * yy]) { all = false; break; } if (all) aligned++; }
        if (y + s.d < D) { let all = true; for (let xx = x; xx < x + s.w; xx++) if (below[xx + W * (y + s.d - 1)] === below[xx + W * (y + s.d)]) { all = false; break; } if (all) aligned++; }
        const score = 1000 * (covered.size - 1) - 500 * aligned + s.w * s.d;
        if (!best || score > best.score) best = { s, score };
      }
      if (!best) continue;
      for (let yy = y; yy < y + best.s.d; yy++) for (let xx = x; xx < x + best.s.w; xx++) used[xx + W * yy] = 1;
      out.push({ partNum: best.s.partNum, x, y, z, w: best.s.w, d: best.s.d });
  }
  return out;
}

/**
 * 底板兩層 plate。單層拼起來的大平面，上面沒壓東西的那片會自己掉，所以一定要兩層接縫錯開。
 * 下層從左上角鋪；上層先試正方形錯開（往內錯半塊、貼右邊或下邊，片數少），都連不起來再用跨接縫的鋪法。
 */
export function tileBase(W: number, D: number, color: number): Tile[] {
  const sizes = sizesForColor("plate", color);
  const S = sizes.find((s) => s.w === s.d && s.w >= 4 && s.w <= Math.min(W, D))?.w ?? 0;
  const shifts = (n: number) => [...new Set([S / 2, S ? n % S : 0, 0])];
  let best: { tiles: Tile[]; comps: number } | null = null;
  // 下層：正方形格子，或直接挑最大片
  for (const lower of [tileLayer(W, D, 0, sizes, S, 0, 0), tileLayer(W, D, 0, sizes, 0, 0, 0)]) {
    const uppers: Tile[][] = [];
    for (const sy of shifts(D)) for (const sx of shifts(W)) uppers.push(tileLayer(W, D, 1, sizes, S, sx, sy));
    uppers.push(tileCrossing(W, D, 1, sizes, lower, false), tileCrossing(W, D, 1, sizes, lower, true));
    for (const upper of uppers) {
      const tiles = [...lower, ...upper];
      const comps = countTileComponents(tiles);
      if (comps === 1) return tiles;
      if (!best || comps < best.comps) best = { tiles, comps };
    }
  }
  return best!.tiles;
}

/** 上下兩層、平面投影有重疊的 plate 算接在一起。 */
function countTileComponents(tiles: Tile[]): number {
  const parent = tiles.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i], b = tiles[j];
      if (a.z === b.z) continue;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.d && b.y < a.y + a.d) parent[find(i)] = find(j);
    }
  return new Set(tiles.map((_, i) => find(i))).size;
}
