// Brick[] → three.js 場景。instance 與描邊都依步驟排序，可以只顯示到第 N 步。
// 座標：three.js Y 朝上、+Z 朝向觀看者；格子 (x, y, z) → X = x·8、Y = z·9.6、Z = −y·8（mm）。
import * as THREE from "three";
import type { Brick, Dir } from "../core/legolize";
import { getColor, getPart } from "../core/palette";
import { WHEELS } from "../core/special";
import type { Step } from "../core/steps";
import { brickEdges, brickGeometry, PLATE_MM, partDims, STUD_MM } from "./brickGeometry";

const LAYER_MM = 9.6;
const UP = new THREE.Vector3(0, 1, 0);
/** 斜面幾何往 -Z 下坡（格子的 +y），轉到 dir 要繞 Y 轉幾度 */
const SLOPE_ANGLE: Record<Dir, number> = { "+y": 0, "-y": Math.PI, "+x": -Math.PI / 2, "-x": Math.PI / 2 };

/**
 * 一塊磚的變換矩陣：磚體中心。一般磚 w 不等於零件原生的 studs_x 就繞 Y 轉 90 度；
 * 斜面照下坡方向轉；輪框、輪胎放在輪軸座兩側、輪軸的高度。
 */
export function brickMatrix(b: Brick): THREE.Matrix4 {
  const p = getPart(b.partNum);
  const d = partDims(b.partNum);
  const rot = new THREE.Quaternion();
  let pos: THREE.Vector3;
  if ((p.kind === "wheel" || p.kind === "tyre") && b.dir) {
    const s = b.dir[0] === "+" ? 1 : -1;
    const cx = (b.x + 1) * STUD_MM, cz = -(b.y + 1) * STUD_MM;
    // b.z 是輪軸座那一格 plate，輪軸在它頂面下方
    const axleY = (b.z + 1) * PLATE_MM - WHEELS.axleDropMm;
    if (b.dir[1] === "x") pos = new THREE.Vector3(cx + s * WHEELS.wheelOffsetMm, axleY, cz);
    else {
      pos = new THREE.Vector3(cx, axleY, cz - s * WHEELS.wheelOffsetMm);
      rot.setFromAxisAngle(UP, Math.PI / 2);
    }
  } else {
    pos = new THREE.Vector3((b.x + b.w / 2) * STUD_MM, b.z * PLATE_MM + d.h / 2, -(b.y + b.d / 2) * STUD_MM);
    if ((p.kind === "slope45" || p.kind === "slope45_inv") && b.dir) rot.setFromAxisAngle(UP, SLOPE_ANGLE[b.dir]);
    else if (p.kind === "wheel_holder") { if (b.dir === "+y") rot.setFromAxisAngle(UP, Math.PI / 2); }
    else if (b.w !== d.studsX) rot.setFromAxisAngle(UP, Math.PI / 2);
  }
  return new THREE.Matrix4().compose(pos, rot, new THREE.Vector3(1, 1, 1));
}

/** 用實際幾何算範圍，輪子這種伸出格子外的零件也算得到。 */
export function brickBounds(bricks: Brick[]): THREE.Box3 {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const b of bricks) {
    const g = brickGeometry(b.partNum);
    if (!g.boundingBox) g.computeBoundingBox();
    box.union(tmp.copy(g.boundingBox!).applyMatrix4(brickMatrix(b)));
  }
  return box;
}

const materialCache = new Map<number, THREE.MeshStandardMaterial>();
export function colorMaterial(colorId: number): THREE.MeshStandardMaterial {
  let m = materialCache.get(colorId);
  if (!m) {
    const c = getColor(colorId);
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(c.rgb), roughness: 0.45, metalness: 0.0 });
    if (c.is_trans) { m.transparent = true; m.opacity = 0.6; }
    materialCache.set(colorId, m);
  }
  return m;
}

export type BrickScene = {
  root: THREE.Group;
  stepCount: number;
  /** 完整模型的範圍（mm） */
  bounds: THREE.Box3;
  /** 只顯示第 1 到 N 步的磚，回傳顯示的磚數。N = stepCount 就是完整模型。 */
  showThrough(step: number): number;
  setStepProgress(step: number, progress: number): number;
  dispose(): void;
};

export function buildBrickScene(bricks: Brick[], steps: Step[]): BrickScene {
  const root = new THREE.Group();
  const order: Brick[] = steps.flatMap((s) => s.brickIds.map((id) => bricks[id]));
  const stepEnd = [0];
  for (const s of steps) stepEnd.push(stepEnd[stepEnd.length - 1] + s.brickIds.length);

  // 依「零件加顏色」分組，每組一個 InstancedMesh，instance 依步驟順序
  const groups = new Map<string, { partNum: string; colorId: number; globalIdx: number[]; matrices: THREE.Matrix4[] }>();
  order.forEach((b, gi) => {
    const key = `${b.partNum}|${b.colorId}`;
    let g = groups.get(key);
    if (!g) { g = { partNum: b.partNum, colorId: b.colorId, globalIdx: [], matrices: [] }; groups.set(key, g); }
    g.globalIdx.push(gi);
    g.matrices.push(brickMatrix(b));
  });
  const meshes: { mesh: THREE.InstancedMesh; globalIdx: number[]; matrices: THREE.Matrix4[] }[] = [];
  for (const g of groups.values()) {
    const mesh = new THREE.InstancedMesh(brickGeometry(g.partNum), colorMaterial(g.colorId), g.matrices.length);
    g.matrices.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, new THREE.Color(0xffffff)); });
    mesh.frustumCulled = false;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    meshes.push({ mesh, globalIdx: g.globalIdx, matrices: g.matrices });
  }

  // 描邊合成一條 LineSegments，也依步驟順序
  const chunks: Float32Array[] = [];
  const edgeEndByBrick: number[] = [0];
  const v = new THREE.Vector3();
  for (const b of order) {
    const src = brickEdges(b.partNum);
    const m = brickMatrix(b);
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(m);
      out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
    }
    chunks.push(out);
    edgeEndByBrick.push(edgeEndByBrick[edgeEndByBrick.length - 1] + out.length / 3);
  }
  const all = new Float32Array(edgeEndByBrick[edgeEndByBrick.length - 1] * 3);
  let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.length; }
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute("position", new THREE.BufferAttribute(all, 3));
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.55 });
  const edges = new THREE.LineSegments(edgeGeo, edgeMat);
  edges.frustumCulled = false;
  root.add(edges);

  const showThrough = (step: number) => {
    const n = Math.max(0, Math.min(steps.length, Math.round(step)));
    const visible = stepEnd[n];
    for (const { mesh, globalIdx } of meshes) {
      let count = 0;
      while (count < globalIdx.length && globalIdx[count] < visible) count++;
      mesh.count = count;
      mesh.visible = count > 0;
    }
    edgeGeo.setDrawRange(0, edgeEndByBrick[visible]);
    return visible;
  };
  showThrough(steps.length);

  return {
    root,
    stepCount: steps.length,
    bounds: brickBounds(bricks),
    showThrough,
    setStepProgress(step, progress) {
      const n = Math.max(0, Math.min(steps.length, Math.round(step)));
      const t = Math.max(0, Math.min(1, progress));
      const visible = showThrough(n);
      const matrix = new THREE.Matrix4();
      const tint = new THREE.Color();
      for (const { mesh, globalIdx, matrices } of meshes) {
        globalIdx.forEach((gi, i) => {
          const moving = n > 0 && gi >= stepEnd[n - 1] && gi < stepEnd[n];
          matrix.copy(matrices[i]);
          if (moving) matrix.elements[13] += (steps[n - 1].hanging ? -1 : 1) * LAYER_MM * 3 * (1 - t);
          mesh.setMatrixAt(i, matrix);
          tint.setRGB(1, moving ? 0.5 + t * 0.5 : 1, moving ? 0.5 + t * 0.5 : 1);
          mesh.setColorAt(i, tint);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      if (n > 0 && t < 1) edgeGeo.setDrawRange(0, edgeEndByBrick[stepEnd[n - 1]]);
      return visible;
    },
    dispose() {
      for (const { mesh } of meshes) mesh.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
    },
  };
}

