import { describe, expect, it } from "vitest";
import { easeOut, stepProgress, stepTiming } from "./animate";
import { brickMatrix, buildBrickScene } from "./scene";
import * as THREE from "three";

describe("組裝時間", () => {
  it.each([0.5, 1, 2, 4])("%sx 同時換算落下與停留時間", (speed) => {
    expect(stepTiming(speed)).toEqual({ fall: 600 / speed, total: 900 / speed });
    expect(stepProgress(600 / speed, speed)).toEqual({ progress: 1, done: false });
    expect(stepProgress(900 / speed, speed).done).toBe(true);
  });
  it("ease-out 與邊界", () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(0.5)).toBe(0.875);
    expect(easeOut(2)).toBe(1);
  });
  it("減少動態效果直接定位，但保留逐步播放節奏", () => {
    expect(stepTiming(2, true)).toEqual({ fall: 0, total: 450 });
    expect(stepProgress(0, 1, true)).toEqual({ progress: 1, done: false });
    expect(stepProgress(900, 1, true).done).toBe(true);
  });
});

it.each([false, true])("只移動當步磚塊，吊掛=%s，落定恢復位置與描邊", (hanging) => {
  const bricks = [0, 1].map((id) => ({ id, partNum: "3005", colorId: 4, x: 0, y: 0, z: id, w: 1, d: 1 }));
  const scene = buildBrickScene(bricks, bricks.map((b) => ({ index: b.id + 1, hanging, brickIds: [b.id], parts: [] })));
  const mesh = scene.root.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
  const edges = scene.root.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
  const matrix = new THREE.Matrix4();
  scene.showThrough(1);
  const firstEdges = edges.geometry.drawRange.count;
  expect(scene.setStepProgress(2, 0)).toBe(2);
  mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[13]).toBeCloseTo(brickMatrix(bricks[0]).elements[13]);
  mesh.getMatrixAt(1, matrix);
  expect(matrix.elements[13]).toBeCloseTo(brickMatrix(bricks[1]).elements[13] + (hanging ? -28.8 : 28.8));
  expect(edges.geometry.drawRange.count).toBe(firstEdges);
  scene.setStepProgress(2, 1);
  mesh.getMatrixAt(1, matrix);
  expect(matrix.elements[13]).toBeCloseTo(brickMatrix(bricks[1]).elements[13]);
  expect(edges.geometry.drawRange.count).toBeGreaterThan(firstEdges);
  const tint = new THREE.Color();
  mesh.getColorAt(1, tint);
  expect(tint.getHex()).toBe(0xffffff);
  expect(scene.showThrough(0)).toBe(0);
  expect(mesh.count).toBe(0);
  scene.dispose();
});
