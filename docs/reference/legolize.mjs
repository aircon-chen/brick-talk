// 參考實作：VoxelGrid → Brick[]（只用 brick）。2026-09-27 實測過，實測數字見 SUPERPROMPT.md 附錄 B。
// grid = { size: [W, D, H], cells: Int16Array }，index = x + W*(y + D*z)，值是 Rebrickable 色號，-1 是空。
// sizesByColor(colorId) 回傳這個顏色可用的 brick 尺寸：
//   依面積由大到小，同面積照 palette 零件順序；每個零件先放「長邊沿 x」(w=長, d=短) 再放轉 90 度的版本。
//   正方形只放一次。例：[{partNum:"3007",w:8,d:2},{partNum:"3007",w:2,d:8},{partNum:"2456",w:6,d:2},...]
export const SEAM_PENALTY = 25;

export function legolize(grid, sizesByColor) {
  const [W, D, H] = grid.size;
  const c = grid.cells;
  const idx = (x, y, z) => x + W * (y + D * z);
  const filled = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < D && z < H && c[idx(x, y, z)] !== -1;
  const owner = new Int32Array(c.length).fill(-1);

  // 內部格子：6 個鄰居都有東西，外面看不到。任何顏色的磚都可以蓋它（磚的顏色以錨點格為準）。
  const interior = new Uint8Array(c.length);
  for (let z = 0; z < H; z++) for (let y = 0; y < D; y++) for (let x = 0; x < W; x++)
    if (filled(x, y, z) && filled(x - 1, y, z) && filled(x + 1, y, z) && filled(x, y - 1, z) &&
        filled(x, y + 1, z) && filled(x, y, z - 1) && filled(x, y, z + 1)) interior[idx(x, y, z)] = 1;

  const raw = [];
  for (let z = 0; z < H; z++) {
    const alongX = z % 2 === 0;                 // 偶數層長邊偏好沿 x，奇數層沿 y
    const stagger = z % 4 === 1 || z % 4 === 2; // 錯縫層
    const coords = [];
    if (alongX) { for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) coords.push([x, y]); }
    else { for (let x = 0; x < W; x++) for (let y = 0; y < D; y++) coords.push([x, y]); }

    for (const [x, y] of coords) {
      const i = idx(x, y, z);
      if (c[i] === -1 || owner[i] !== -1) continue;
      const color = c[i];
      // 這一格是不是一排的開頭（沿偏好方向），以及是不是垂直方向的第一排
      const runStart = alongX ? !filled(x - 1, y, z) : !filled(x, y - 1, z);
      const perpStart = alongX ? !filled(x, y - 1, z) : !filled(x - 1, y, z);
      let best = null;
      for (const cand of sizesByColor(color)) {
        const { w, d } = cand;
        if (x + w > W || y + d > D) continue;
        if (stagger && runStart && Math.max(w, d) > 4) continue;       // 錯縫：一排的第一塊最長 4
        if (stagger && perpStart && (alongX ? d : w) > 1) continue;    // 錯縫：第一排只放 1 格寬
        let ok = true;
        for (let yy = y; yy < y + d && ok; yy++) for (let xx = x; xx < x + w; xx++) {
          const j = idx(xx, yy, z);
          if ((c[j] !== color && !interior[j]) || owner[j] !== -1) { ok = false; break; }
        }
        if (!ok) continue;

        let score = 10 * w * d;
        if (z > 0) {
          const below = new Set();
          for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) {
            const o = owner[idx(xx, yy, z - 1)];
            if (o !== -1) below.add(o);
          }
          score += 6 * below.size;
          // 對齊的縫：沿這條邊的每一格，邊兩側正下方都有磚而且分屬不同塊。模型外緣不算。
          const seam = (ax, ay, bx, by) => {
            if (ax < 0 || ay < 0 || bx >= W || by >= D) return false;
            const a = owner[idx(ax, ay, z - 1)], b = owner[idx(bx, by, z - 1)];
            return a !== -1 && b !== -1 && a !== b;
          };
          const edgeAligned = (cells) => cells.every(([ax, ay, bx, by]) => seam(ax, ay, bx, by));
          const ys = Array.from({ length: d }, (_, k) => y + k);
          const xs = Array.from({ length: w }, (_, k) => x + k);
          let aligned = 0;
          if (edgeAligned(ys.map((yy) => [x - 1, yy, x, yy]))) aligned++;
          if (edgeAligned(ys.map((yy) => [x + w - 1, yy, x + w, yy]))) aligned++;
          if (edgeAligned(xs.map((xx) => [xx, y - 1, xx, y]))) aligned++;
          if (edgeAligned(xs.map((xx) => [xx, y + d - 1, xx, y + d]))) aligned++;
          score -= SEAM_PENALTY * aligned;
          if (below.size === 0) score -= 1000;
        }
        if (alongX ? w >= d : d >= w) score += 2;                      // 方向符合偏好（正方形也算）
        if (best === null || score > best.score) best = { ...cand, score };
      }
      const bi = raw.length;
      raw.push({ partNum: best.partNum, colorId: color, x, y, z, w: best.w, d: best.d });
      for (let yy = y; yy < y + best.d; yy++) for (let xx = x; xx < x + best.w; xx++) owner[idx(xx, yy, z)] = bi;
    }
  }

  // id 依 (z, y, x) 排序後重新編號
  const order = raw.map((_, i) => i).sort((a, b) => raw[a].z - raw[b].z || raw[a].y - raw[b].y || raw[a].x - raw[b].x);
  const remap = new Int32Array(raw.length);
  order.forEach((old, n) => (remap[old] = n));
  for (let i = 0; i < owner.length; i++) if (owner[i] !== -1) owner[i] = remap[owner[i]];
  return { bricks: order.map((old, n) => ({ id: n, ...raw[old] })), owner };
}
