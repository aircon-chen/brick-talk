// 說明書用的截圖：整頁只用一個 WebGLRenderer，每次 render 完立刻 toDataURL。
// 瀏覽器同時能開的 WebGL context 只有 8 到 16 個，每張圖開一個會壞掉（SUPERPROMPT.md 8.3）。
import * as THREE from "three";
import type { Brick } from "../core/legolize";
import type { BuildResult } from "../core/pipeline";
import { brickEdges, brickGeometry, partDims } from "./brickGeometry";
import { brickBounds, brickMatrix, buildBrickScene, colorMaterial } from "./scene";

const STEP_W = 1200, STEP_H = 900, THUMB = 256;
const OUTLINE_MM = 1.5;
const STUD_H = 1.7;
const HIGHLIGHT = 0xe3000b;

function lights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(0.6, 1, 0.8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-0.8, 0.4, -0.6);
  scene.add(fill);
}

/** 從方位角 az、仰角 el 看的方向（相機在 target + dir）。 */
function viewDir(azDeg: number, elDeg: number) {
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * 正交相機，讓 box 的 8 個角都落在畫面裡（留 margin 比例的邊）。
 * focus 有給的話，縮放照 box 算（每一步比例一致），但畫面中心對準 focus（已經放上去的磚），圖才不會擠在下面。
 */
function orthoFor(box: THREE.Box3, aspect: number, azDeg: number, elDeg: number, margin = 0.08, focus?: THREE.Box3) {
  const center = box.getCenter(new THREE.Vector3());
  const dir = viewDir(azDeg, elDeg);
  const radius = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 10);
  cam.position.copy(center).addScaledVector(dir, radius * 3);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;
  let maxX = 0, maxY = 0;
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
        const c = center.clone().applyMatrix4(inv);
        maxX = Math.max(maxX, Math.abs(p.x - c.x));
        maxY = Math.max(maxY, Math.abs(p.y - c.y));
      }
  let halfW = maxX * (1 + margin), halfH = maxY * (1 + margin);
  if (halfW / halfH > aspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;
  cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
  if (focus && !focus.isEmpty()) {
    const f = focus.getCenter(new THREE.Vector3());
    cam.position.copy(f).addScaledVector(dir, radius * 3);
    cam.lookAt(f);
    cam.updateMatrixWorld();
  }
  cam.updateProjectionMatrix();
  return cam;
}

/** 新磚的紅框：每邊固定外擴 1.5 mm、涵蓋磚體加 stud 高度的方盒，BackSide 只畫出外緣。 */
function outlineMesh(bricks: Brick[]): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, side: THREE.BackSide });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(bricks.length, 1));
  mesh.count = bricks.length;
  bricks.forEach((b, i) => {
    const d = partDims(b.partNum);
    const base = brickMatrix(b);
    const shift = new THREE.Matrix4().makeTranslation(0, d.hasStuds ? STUD_H / 2 : 0, 0);
    const scale = new THREE.Matrix4().makeScale(d.sx + OUTLINE_MM * 2, d.h + (d.hasStuds ? STUD_H : 0) + OUTLINE_MM * 2, d.sz + OUTLINE_MM * 2);
    mesh.setMatrixAt(i, base.clone().multiply(shift).multiply(scale));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * 新磚頂面的紅色框線，永遠畫在最上層（不做深度測試）。
 * 埋在平面中間的 plate 四周都是同樣高的零件，外擴的紅框會被擋住，只剩這圈框線看得出新零件的範圍。
 */
function topFrameMesh(bricks: Brick[]): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: HIGHLIGHT, depthTest: false, depthWrite: false });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(bricks.length * 4, 1));
  const T = 1.2; // 框線寬（mm）
  let n = 0;
  for (const b of bricks) {
    const d = partDims(b.partNum);
    const base = brickMatrix(b);
    const y = d.h / 2 + (d.hasStuds ? STUD_H : 0) + 0.3;
    const bars: [number, number, number, number][] = [
      // 中心 x、中心 z、長（x 方向）、寬（z 方向）
      [0, d.sz / 2, d.sx + T, T], [0, -d.sz / 2, d.sx + T, T],
      [d.sx / 2, 0, T, d.sz + T], [-d.sx / 2, 0, T, d.sz + T],
    ];
    for (const [cx, cz, lx, lz] of bars) {
      const local = new THREE.Matrix4().compose(new THREE.Vector3(cx, y, cz), new THREE.Quaternion(), new THREE.Vector3(lx, 0.6, lz));
      mesh.setMatrixAt(n++, base.clone().multiply(local));
    }
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  return mesh;
}

export type BookletImages = {
  /** steps[i] 是第 i+1 步的圖 */
  steps: string[];
  /** 完成圖：正面偏右、背面偏左 */
  finals: string[];
  /** key 是 `${partNum}|${colorId}` */
  thumbs: Map<string, string>;
};

export class Snapshotter {
  private renderer: THREE.WebGLRenderer;

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0xffffff, 1);
  }

  private shot(scene: THREE.Scene, cam: THREE.Camera, w: number, h: number): string {
    this.renderer.setSize(w, h, false);
    this.renderer.render(scene, cam);
    return this.renderer.domElement.toDataURL("image/png");
  }

  /** 產生全部步驟圖、完成圖、零件縮圖。每張之間 await 一次，不卡住主執行緒。 */
  async bookletImages(result: BuildResult, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<BookletImages> {
    const keys = result.bom.map((r) => `${r.partNum}|${r.colorId}`);
    const total = result.steps.length + 2 + keys.length;
    let done = 0;
    const tick = async () => {
      done++;
      onProgress?.(done, total);
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    };

    const scene = new THREE.Scene();
    lights(scene);
    const bricks = buildBrickScene(result.bricks, result.steps);
    scene.add(bricks.root);
    const steps: string[] = [];
    const placed: Brick[] = [];
    try {
      for (let i = 0; i < result.steps.length; i++) {
        bricks.showThrough(i + 1);
        for (const id of result.steps[i].brickIds) placed.push(result.bricks[id]);
        const cam = orthoFor(bricks.bounds, STEP_W / STEP_H, 45, 30, 0.08, brickBounds(placed));
        const newBricks = result.steps[i].brickIds.map((id) => result.bricks[id]);
        const outline = outlineMesh(newBricks);
        const frame = topFrameMesh(newBricks);
        scene.add(outline, frame);
        steps.push(this.shot(scene, cam, STEP_W, STEP_H));
        scene.remove(outline, frame);
        for (const m of [outline, frame]) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
          m.dispose();
        }
        await tick();
      }
      bricks.showThrough(result.steps.length);
      const finals = [];
      for (const az of [45, 225]) {
        finals.push(this.shot(scene, orthoFor(bricks.bounds, STEP_W / STEP_H, az, 30), STEP_W, STEP_H));
        await tick();
      }
      const thumbs = new Map<string, string>();
      for (const r of result.bom) {
        thumbs.set(`${r.partNum}|${r.colorId}`, this.partThumb(r.partNum, r.colorId));
        await tick();
      }
      return { steps, finals, thumbs };
    } finally {
      bricks.dispose();
    }
  }

  /** 完整模型的小圖（首頁卡片用），正面偏右上。 */
  modelThumb(result: BuildResult, w = 480, h = 360): string {
    const scene = new THREE.Scene();
    lights(scene);
    const bricks = buildBrickScene(result.bricks, result.steps);
    scene.add(bricks.root);
    const url = this.shot(scene, orthoFor(bricks.bounds, w / h, 45, 30), w, h);
    bricks.dispose();
    return url;
  }

  /** 零件縮圖：所有縮圖共用同一個比例（2x8 磚剛好框滿），小零件留白，長短看得出來。 */
  partThumb(partNum: string, colorId: number): string {
    const scene = new THREE.Scene();
    lights(scene);
    const d = partDims(partNum);
    const mesh = new THREE.Mesh(brickGeometry(partNum), colorMaterial(colorId));
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(brickEdges(partNum), 3));
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.55 });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    // 以磚體加 stud 的中心為原點
    const lift = d.hasStuds ? -STUD_H / 2 : 0;
    mesh.position.y = lift;
    edges.position.y = lift;
    scene.add(mesh, edges);
    // 比 2x8 磚大的零件（大片 plate）縮小到框得住，不然會被裁掉
    const geo = brickGeometry(partNum);
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box = referenceBox().union(geo.boundingBox!.clone().translate(new THREE.Vector3(0, lift, 0)));
    const cam = orthoFor(box, 1, 45, 30, 0.04);
    const url = this.shot(scene, cam, THUMB, THUMB);
    edgeGeo.dispose();
    edgeMat.dispose();
    return url;
  }

  dispose() {
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** 縮圖的共同比例：2x8 磚（含 stud）以原點為中心的範圍。 */
function referenceBox(): THREE.Box3 {
  const hx = (8 * 8 - 0.2) / 2, hz = (2 * 8 - 0.2) / 2, hy = (9.6 + STUD_H) / 2;
  return new THREE.Box3(new THREE.Vector3(-hx, -hy, -hz), new THREE.Vector3(hx, hy, hz));
}
