"use client";

// 3D 預覽：可以旋轉縮放，只顯示到第 step 步。只在瀏覽器載入（見 ViewerClient）。
import { useEffect, useEffectEvent, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BuildResult } from "@/core/pipeline";
import { stepProgress } from "@/render/animate";
import { type BrickScene, buildBrickScene } from "@/render/scene";

declare global {
  interface Window {
    __legoStats?: { bricksRendered: number; step: number };
  }
}

/** 從方位角 az、仰角 el（度）看向 box 的相機位置，距離剛好框住整個模型。 */
export function fitCamera(camera: THREE.PerspectiveCamera, box: THREE.Box3, azDeg = 45, elDeg = 30) {
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1);
  // 垂直與水平視角取比較窄的那個，窄螢幕左右才不會被裁掉
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const dist = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  camera.position.set(
    center.x + dist * Math.sin(az) * Math.cos(el),
    center.y + dist * Math.sin(el),
    center.z + dist * Math.cos(az) * Math.cos(el),
  );
  camera.near = dist / 100;
  camera.far = dist * 10;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return center;
}

export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(0.6, 1, 0.8);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-0.8, 0.4, -0.6);
  scene.add(fill);
}

export type ViewerProps = {
  result: BuildResult;
  step: number;
  animation?: number;
  paused?: boolean;
  speed?: number;
  view?: "angle" | "front" | "top";
  autoRotate?: boolean;
  onComplete?: () => void;
};

export default function Viewer({ result, step, animation = 0, paused = false, speed = 1, view = "angle", autoRotate = false, onComplete }: ViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{ bricks: BrickScene; render: () => void; camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null);
  const elapsed = useRef(0);
  const complete = useEffectEvent(() => onComplete?.());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0xf4f5f7);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    addLights(scene);
    const bricks = buildBrickScene(result.bricks, result.steps);
    scene.add(bricks.root);

    const camera = new THREE.PerspectiveCamera(35, host.clientWidth / Math.max(host.clientHeight, 1) || 1, 1, 1000);
    const target = fitCamera(camera, bricks.bounds);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.update();

    let visible = bricks.showThrough(result.steps.length);
    let currentStep = result.steps.length;
    const render = () => {
      renderer.render(scene, camera);
      window.__legoStats = { bricksRendered: visible, step: currentStep };
    };
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, true);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    controls.addEventListener("change", render);
    resize();

    stateRef.current = {
      camera, controls,
      bricks: {
        ...bricks,
        setStepProgress: (n: number, t: number) => {
          currentStep = n;
          visible = bricks.setStepProgress(n, t);
          return visible;
        },
        showThrough: (n: number) => {
          currentStep = n;
          visible = bricks.showThrough(n);
          return visible;
        },
      },
      render,
    };

    return () => {
      ro.disconnect();
      controls.dispose();
      bricks.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stateRef.current = null;
    };
  }, [result]);

  useEffect(() => {
    elapsed.current = 0;
    const s = stateRef.current;
    if (!s) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    s.bricks.setStepProgress(step, animation && !reduced ? 0 : 1);
    s.render();
  }, [step, animation, result]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s || !animation || paused) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      elapsed.current += (now - previous) * speed;
      previous = now;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const { progress, done } = stepProgress(elapsed.current, 1, reduced);
      s.bricks.setStepProgress(step, progress);
      s.render();
      if (done) complete();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, animation, paused, speed, result]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.controls.target.copy(fitCamera(s.camera, s.bricks.bounds, view === "angle" ? 45 : 0, view === "top" ? 89.9 : view === "front" ? 0 : 30));
    s.controls.update();
    s.render();
  }, [view, result]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s) return;
    s.controls.autoRotate = autoRotate;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      s.controls.update((now - previous) / 1000);
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    if (autoRotate) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoRotate, result]);

  return <div ref={hostRef} data-testid="viewer" className="h-[480px] w-full overflow-hidden rounded-xl border border-zinc-200 bg-[#f4f5f7]" />;
}
