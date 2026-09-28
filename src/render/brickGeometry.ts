// 依零件產生 three.js 幾何（快取）。原點在磚體中心、長邊沿 X（跟 LDraw 的 studs_x 一致），單位 mm。
// 斜面：寬沿 X、深 2 格沿 Z，往 -Z 下坡（也就是格子的 +y）；輪框、輪胎：輪軸沿 X。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getPart } from "../core/palette";

export const STUD_MM = 8;
export const PLATE_MM = 3.2;
const GAP = 0.2;
const STUD_R = 2.4;
const STUD_H = 1.7;
const STUD_SEGMENTS = 16;
const EDGE_SEGMENTS = 12;

export type PartDims = { sx: number; sz: number; h: number; studsX: number; studsZ: number; hasStuds: boolean };

/** 輪框、輪胎：沿輪軸的寬、直徑（mm，LDraw bounding box 量的） */
const WHEEL_MM = { wheel: { width: 11.2, diameter: 10.4 }, tyre: { width: 11.2, diameter: 20 } } as const;

export function partDims(partNum: string): PartDims {
  const p = getPart(partNum);
  if (p.kind === "wheel" || p.kind === "tyre") {
    const w = WHEEL_MM[p.kind];
    return { sx: w.width, sz: w.diameter, h: w.diameter, studsX: 1, studsZ: 1, hasStuds: false };
  }
  if (p.kind === "slope45" || p.kind === "slope45_inv") {
    // 名稱「2 x N」：2 是沿斜面的深度、N 是寬
    return { sx: p.studs_l * STUD_MM - GAP, sz: 2 * STUD_MM - GAP, h: p.height_plates * PLATE_MM, studsX: p.studs_l, studsZ: 2, hasStuds: true };
  }
  if (p.kind === "wheel_holder") {
    return { sx: 2 * STUD_MM - GAP, sz: 2 * STUD_MM - GAP, h: PLATE_MM, studsX: 2, studsZ: 2, hasStuds: true };
  }
  const studsX = p.ldraw.studs_x, studsZ = p.ldraw.studs_z;
  return {
    sx: studsX * STUD_MM - GAP,
    sz: studsZ * STUD_MM - GAP,
    h: p.height_plates * PLATE_MM,
    studsX,
    studsZ,
    hasStuds: p.has_studs,
  };
}

const meshCache = new Map<string, THREE.BufferGeometry>();
const edgeCache = new Map<string, Float32Array>();

function stud(x: number, y: number, z: number, r = STUD_R): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, STUD_H, STUD_SEGMENTS);
  g.translate(x, y + STUD_H / 2, z);
  return g;
}

/** 特殊外型的零件（斜面、圓磚、錐體、輪子組），其他回 null 用方塊。 */
function specialBody(partNum: string, d: PartDims): THREE.BufferGeometry[] | null {
  const p = getPart(partNum);
  const hy = d.h / 2;
  if (p.kind === "slope45") {
    // 側面輪廓（Z, Y）：後排滿高、前排從滿高斜到 1.6 mm 的邊，沿 X 擠出
    const hz = d.sz / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-hz, -hy);
    shape.lineTo(hz, -hy);
    shape.lineTo(hz, hy);
    shape.lineTo(0, hy);
    shape.lineTo(-hz, -hy + 1.6);
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, { depth: d.sx, bevelEnabled: false });
    // 擠出方向（local Z）轉到 X、輪廓的橫軸轉到 Z：滿高的後排在 +Z，往 -Z 下坡
    body.rotateY(-Math.PI / 2);
    body.translate(d.sx / 2, 0, 0);
    const out: THREE.BufferGeometry[] = [body];
    for (let i = 0; i < d.studsX; i++) out.push(stud((i - (d.studsX - 1) / 2) * STUD_MM, hy, hz / 2));
    return out;
  }
  if (p.kind === "slope45_inv") {
    // 倒斜面：前排的底部從後排底邊斜上去，頂面兩排都有 stud
    const hz = d.sz / 2;
    const shape = new THREE.Shape();
    shape.moveTo(hz, -hy);
    shape.lineTo(hz, hy);
    shape.lineTo(-hz, hy);
    shape.lineTo(-hz, hy - 1.6);
    shape.lineTo(0, -hy);
    shape.closePath();
    const body = new THREE.ExtrudeGeometry(shape, { depth: d.sx, bevelEnabled: false });
    body.rotateY(-Math.PI / 2);
    body.translate(d.sx / 2, 0, 0);
    const out: THREE.BufferGeometry[] = [body];
    for (let i = 0; i < d.studsX; i++)
      for (const zz of [hz / 2, -hz / 2]) out.push(stud((i - (d.studsX - 1) / 2) * STUD_MM, hy, zz));
    return out;
  }
  if (p.kind === "round") {
    const r = d.sx / 2;
    const out: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(r, r, d.h, 32)];
    for (let i = 0; i < d.studsX; i++)
      for (let j = 0; j < d.studsZ; j++) out.push(stud((i - (d.studsX - 1) / 2) * STUD_MM, hy, (j - (d.studsZ - 1) / 2) * STUD_MM));
    return out;
  }
  if (p.kind === "cone") {
    const r = d.sx / 2;
    return [new THREE.CylinderGeometry(r * 0.35, r, d.h, 32), stud(0, hy, 0, Math.min(STUD_R, r * 0.35))];
  }
  if (p.kind === "wheel_holder") {
    const out: THREE.BufferGeometry[] = [new THREE.BoxGeometry(d.sx, d.h, d.sz)];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) out.push(stud((i - 0.5) * STUD_MM, hy, (j - 0.5) * STUD_MM));
    // 兩側的輪軸
    const pin = new THREE.CylinderGeometry(1.55, 1.55, 30, 12);
    pin.rotateZ(Math.PI / 2);
    pin.translate(0, hy - 2, 0);
    out.push(pin);
    return out;
  }
  if (p.kind === "wheel" || p.kind === "tyre") {
    const g = new THREE.CylinderGeometry(d.h / 2, d.h / 2, p.kind === "wheel" ? d.sx + 0.4 : d.sx, p.kind === "wheel" ? 24 : 40);
    g.rotateZ(Math.PI / 2);
    return [g];
  }
  return null;
}

/** 磚體加上 stud 的實心幾何。 */
export function brickGeometry(partNum: string): THREE.BufferGeometry {
  const cached = meshCache.get(partNum);
  if (cached) return cached;
  const d = partDims(partNum);
  const special = specialBody(partNum, d);
  const parts: THREE.BufferGeometry[] = special ?? [new THREE.BoxGeometry(d.sx, d.h, d.sz)];
  if (d.hasStuds && !special) {
    for (let i = 0; i < d.studsX; i++)
      for (let j = 0; j < d.studsZ; j++) {
        const stud = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, STUD_SEGMENTS);
        stud.translate((i - (d.studsX - 1) / 2) * STUD_MM, d.h / 2 + STUD_H / 2, (j - (d.studsZ - 1) / 2) * STUD_MM);
        parts.push(stud);
      }
  }
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error(`mergeGeometries failed for ${partNum}`);
  merged.computeVertexNormals();
  meshCache.set(partNum, merged);
  return merged;
}

/** 描邊：磚體 12 條邊加每個 stud 的頂圈，回傳 LineSegments 用的頂點（每兩個點一條線）。特殊外型用夾角大於 35 度的稜線。 */
export function brickEdges(partNum: string): Float32Array {
  const cached = edgeCache.get(partNum);
  if (cached) return cached;
  const d = partDims(partNum);
  if (specialBody(partNum, d)) {
    const edges = new THREE.EdgesGeometry(brickGeometry(partNum), 35);
    const arr = new Float32Array(edges.getAttribute("position").array);
    edges.dispose();
    edgeCache.set(partNum, arr);
    return arr;
  }
  const hx = d.sx / 2, hy = d.h / 2, hz = d.sz / 2;
  const v: number[] = [];
  const line = (a: number[], b: number[]) => v.push(...a, ...b);
  const corners = [-1, 1].flatMap((sx) => [-1, 1].flatMap((sy) => [-1, 1].map((sz) => [sx * hx, sy * hy, sz * hz])));
  // 8 個角，兩兩只差一個軸的就是一條邊
  for (let a = 0; a < 8; a++)
    for (let b = a + 1; b < 8; b++) {
      const diff = [0, 1, 2].filter((k) => corners[a][k] !== corners[b][k]).length;
      if (diff === 1) line(corners[a], corners[b]);
    }
  if (d.hasStuds) {
    for (let i = 0; i < d.studsX; i++)
      for (let j = 0; j < d.studsZ; j++) {
        const cx = (i - (d.studsX - 1) / 2) * STUD_MM, cz = (j - (d.studsZ - 1) / 2) * STUD_MM, y = hy + STUD_H;
        for (let k = 0; k < EDGE_SEGMENTS; k++) {
          const t0 = (k / EDGE_SEGMENTS) * Math.PI * 2, t1 = ((k + 1) / EDGE_SEGMENTS) * Math.PI * 2;
          line([cx + STUD_R * Math.cos(t0), y, cz + STUD_R * Math.sin(t0)], [cx + STUD_R * Math.cos(t1), y, cz + STUD_R * Math.sin(t1)]);
        }
      }
  }
  const arr = new Float32Array(v);
  edgeCache.set(partNum, arr);
  return arr;
}
