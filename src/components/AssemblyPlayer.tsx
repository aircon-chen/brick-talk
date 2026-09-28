"use client";

import { useEffect, useEffectEvent, useState } from "react";
import type { BuildResult } from "@/core/pipeline";
import { partNameZh } from "@/core/bom";
import { getColor } from "@/core/palette";
import ViewerClient from "./ViewerClient";

const button = "rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-40";

export default function AssemblyPlayer({ result, booklet = false }: { result: BuildResult; booklet?: boolean }) {
  const total = result.steps.length;
  const [step, setStep] = useState(booklet ? 1 : total);
  const [animation, setAnimation] = useState(booklet ? 1 : 0);
  const [playing, setPlaying] = useState(booklet);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<"angle" | "front" | "top">("angle");
  const [autoRotate, setAutoRotate] = useState(false);
  const current = result.steps[step - 1];
  const placed = result.steps.slice(0, step).reduce((sum, s) => sum + s.brickIds.length, 0);

  function jump(n: number) {
    setStep(Math.max(booklet ? 1 : 0, Math.min(total, n)));
    setPlaying(booklet);
    setAnimation(booklet ? animation + 1 : 0);
  }

  const keyboard = useEffectEvent((event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && (event.target.closest("input, select, textarea") || event.target.isContentEditable)) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      jump(step + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });
  useEffect(() => {
    if (!booklet) return;
    const listener = (event: KeyboardEvent) => keyboard(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [booklet]);

  function play() {
    if (playing) { setPlaying(false); return; }
    if (!animation) {
      setStep(step >= total ? 1 : step + 1);
      setAnimation(1);
    }
    setPlaying(true);
  }

  return (
    <div className="min-w-0 space-y-4">
      {booklet && current && (
        <div>
          <h2 className="text-3xl font-black">第 {step} 步</h2>
          <ul className="mt-3 flex flex-wrap gap-2" data-testid="animation-parts">
            {current.parts.map((part) => {
              const color = getColor(part.colorId);
              return <li key={`${part.partNum}|${part.colorId}`} className="flex items-center gap-2 rounded-lg bg-sky-50 p-3 text-sm">
                <span className="h-5 w-5 shrink-0 rounded border border-zinc-300" style={{ backgroundColor: color.rgb }} />
                <span>{partNameZh(part.partNum)}・{color.name_zh ?? color.name} × {part.qty}</span>
              </li>;
            })}
          </ul>
          {current.hanging && <p className="mt-2 text-sm font-medium text-red-700">這一步的零件從下方扣上</p>}
        </div>
      )}
      <ViewerClient result={result} step={step} animation={animation} paused={!playing} speed={speed} view={view} autoRotate={autoRotate}
        onComplete={() => {
          if (booklet || step === total) { setPlaying(false); setAnimation(0); }
          else setStep(step + 1);
        }} />
      <div className="flex flex-wrap items-center gap-2">
        {!booklet && <button className={button} onClick={() => jump(0)}>回到開頭</button>}
        <button className={button} disabled={step <= (booklet ? 1 : 0)} onClick={() => jump(step - 1)}>上一步</button>
        {booklet ? <button className={button} onClick={() => { setAnimation(animation + 1); setPlaying(true); }}>再播一次</button>
          : <button className={`${button} bg-red-600 text-white`} onClick={play}>{playing ? "暫停" : "播放"}</button>}
        <button className={button} disabled={step >= total} onClick={() => jump(step + 1)}>下一步</button>
        {!booklet && <button className={button} onClick={() => jump(total)}>跳到完成</button>}
        <label className="text-sm">速度 <select aria-label="播放速度" className={button} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
          {[0.5, 1, 2, 4].map((n) => <option key={n} value={n}>{n}x</option>)}
        </select></label>
      </div>
      {booklet ? <label className="block text-sm">選擇步驟 <select className={button} value={step} onChange={(e) => jump(Number(e.target.value))}>
        {result.steps.map((s, i) => <option key={s.index} value={i + 1}>第 {i + 1} 步</option>)}
      </select></label> : <input aria-label="步驟" type="range" min={0} max={total} value={step} data-testid="step-slider"
        onChange={(e) => jump(Number(e.target.value))} className="block w-full accent-red-600" />}
      <p className="text-sm tabular-nums text-zinc-700">第 {step} 步／共 {total} 步・已放 {placed} 塊</p>
      <div className="flex flex-wrap items-center gap-2">
        {([["angle", "斜 45 度"], ["front", "正面"], ["top", "俯視"]] as const).map(([key, label]) =>
          <button key={key} className={button} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
        <label className="text-sm"><input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} /> 自動旋轉</label>
      </div>
    </div>
  );
}
