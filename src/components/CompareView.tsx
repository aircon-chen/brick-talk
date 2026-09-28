"use client";

// 模型比較頁：同一句話同時交給勾選的模型，結果都用同一套程式轉成零件，再並排比較。
import { useEffect, useRef, useState } from "react";
import { type BuildResult, runPipeline, toLayerCells } from "@/core/pipeline";
import { SIZE_LABELS, SIZE_TIERS, type SizeTier } from "@/core/spec";
import { type DesignResponse, fetchDesign, saveDesign } from "@/lib/design-client";
import type { ModelOption } from "@/llm/providers";
import ViewerClient from "./ViewerClient";

type Run =
  | { status: "running"; started: number }
  | { status: "ok"; data: DesignResponse; result: BuildResult }
  | { status: "error"; message: string };

const usd = (n: number) => `約 US$ ${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

export default function CompareView() {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("一隻坐著的橘色小貓");
  const [size, setSize] = useState<SizeTier>("M");
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [asked, setAsked] = useState<{ prompt: string; size: SizeTier; ids: string[] } | null>(null);
  // 經過秒數：計時器每秒更新「現在時間」，渲染時只讀這個狀態
  const [now, setNow] = useState(0);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/models").then((r) => r.json()).then((d: { models: ModelOption[] }) => {
      setModels(d.models);
      setSelected(d.models.slice(0, 3).map((m) => m.id));
    }).catch(() => setModels([]));
  }, []);

  // 離開頁面時取消還在跑的設計，伺服器端的模型呼叫也會跟著停
  useEffect(() => () => ctrl.current?.abort(), []);

  const running = Object.values(runs).some((r) => r.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    const text = prompt.trim();
    if (!text || !selected.length) return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    const signal = ctrl.current.signal;
    const ids = [...selected];
    setNow(Date.now());
    setAsked({ prompt: text, size, ids });
    setRuns(Object.fromEntries(ids.map((id) => [id, { status: "running", started: Date.now() }])));
    await Promise.all(ids.map(async (id) => {
      const r = await fetchDesign(text, size, { model: id, signal });
      const run: Run = r.ok ? { status: "ok", data: r.data, result: runPipeline(r.data.spec) } : { status: "error", message: r.message };
      setRuns((prev) => ({ ...prev, [id]: run }));
    }));
  }

  function open(id: string) {
    const run = runs[id];
    if (run?.status !== "ok" || !asked) return;
    window.open(`/build/${saveDesign(run.data, asked.prompt, asked.size)}`, "_blank");
  }

  if (models === null) return <p className="text-zinc-500">讀取可用的模型…</p>;
  if (!models.length) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900" data-testid="compare-empty">
        這台電腦還沒有設定任何模型。設定 Anthropic API key、Claude 訂閱、OpenAI API key 或 Codex 其中一種，做法見 README 的「模型比較」。
      </p>
    );
  }

  const byId = new Map(models.map((m) => [m.id, m]));
  const cols = asked?.ids ?? [];

  return (
    <div className="space-y-6">
      <form onSubmit={start} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="compare-form">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} maxLength={300} aria-label="要比較的描述"
          className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-lg outline-none focus:border-red-500" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SIZE_TIERS.map((t) => (
            <label key={t} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${size === t ? "border-red-500 bg-red-50 text-red-800" : "border-zinc-300"}`}>
              <input type="radio" name="size" value={t} checked={size === t} onChange={() => setSize(t)} className="sr-only" />
              {SIZE_LABELS[t]}
            </label>
          ))}
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-medium text-zinc-700">要比較的模型</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {models.map((m) => (
              <label key={m.id} data-testid="compare-model" className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${selected.includes(m.id) ? "border-red-500 bg-red-50 text-red-800" : "border-zinc-300"}`}>
                <input type="checkbox" className="mr-1.5 accent-red-600" checked={selected.includes(m.id)}
                  onChange={(e) => setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))} />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex items-center justify-end gap-3">
          {running && <span className="text-sm text-zinc-600">設計中，每個模型各自計時，最多等 5 分鐘</span>}
          <button type="submit" disabled={running || !prompt.trim() || !selected.length} data-testid="compare-submit"
            className="rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700 disabled:bg-zinc-300">開始比較</button>
        </div>
      </form>

      {cols.length > 0 && (
        <>
          <div className={`grid gap-4 ${cols.length > 1 ? "md:grid-cols-2" : ""} ${cols.length > 2 ? "xl:grid-cols-3" : ""}`}>
            {cols.map((id) => {
              const run = runs[id];
              const m = byId.get(id);
              return (
                <section key={id} data-testid="compare-card" data-model={id} className="min-w-0 rounded-xl border border-zinc-200 bg-white p-3">
                  <h2 className="font-semibold">{m?.label ?? id}</h2>
                  {m?.note && <p className="mt-0.5 text-xs text-zinc-500">{m.note}</p>}
                  <div className="mt-2">
                    {run?.status === "running" && (
                      <div className="flex h-[480px] items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
                        設計中… {Math.max(0, Math.round((now - run.started) / 1000))} 秒
                      </div>
                    )}
                    {run?.status === "error" && <div className="flex h-[480px] items-center justify-center rounded-xl bg-red-50 p-4 text-center text-red-700">{run.message}</div>}
                    {run?.status === "ok" && (
                      <>
                        <p className="mb-2 text-sm text-zinc-700">{run.result.spec.title}</p>
                        <ViewerClient result={run.result} step={run.result.steps.length} />
                        <button type="button" onClick={() => open(id)} className="mt-2 text-sm font-medium text-red-700 hover:underline">開啟完整結果（零件清單、說明書、三個版本）</button>
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
          <MetricsTable cols={cols} runs={runs} byId={byId} />
        </>
      )}
    </div>
  );
}

/** 跟結果頁一樣：正規化、API、pipeline 的警告合併去重 */
const allWarnings = (r: Extract<Run, { status: "ok" }>) => new Set([...r.data.specWarnings, ...r.data.warnings, ...r.result.warnings]);

function MetricsTable({ cols, runs, byId }: { cols: string[]; runs: Record<string, Run>; byId: Map<string, ModelOption> }) {
  const cell = (id: string, f: (r: Extract<Run, { status: "ok" }>, m?: ModelOption) => string) => {
    const r = runs[id];
    return r?.status === "ok" ? f(r, byId.get(id)) : r?.status === "error" ? "失敗" : "…";
  };
  const rows: [string, (r: Extract<Run, { status: "ok" }>, m?: ModelOption) => string][] = [
    ["結果", (r) => (allWarnings(r).size ? "完成，有警告" : "完成")],
    ["花費時間", (r) => (r.data.meta ? `${r.data.meta.seconds} 秒` : "—")],
    ["呼叫次數", (r) => (r.data.meta ? `${r.data.meta.attempts} 次` : "—")],
    ["輸入／輸出 token", (r) => (r.data.meta ? `${r.data.meta.inputTokens.toLocaleString()}／${r.data.meta.outputTokens.toLocaleString()}` : "—")],
    ["API 成本", (r, m) => {
      const p = m?.priceUsdPerMTok, meta = r.data.meta;
      if (!p || !meta) return "—";
      const cost = usd((meta.inputTokens * p.input + meta.outputTokens * p.output) / 1e6);
      return m?.provider === "claude-cli" ? `${cost}（訂閱，換算參考）` : cost;
    }],
    ["零件數", (r) => `${r.result.stats.bricks} 塊`],
    ["零件種類", (r) => `${r.result.stats.partTypes} 種`],
    ["層數", (r) => `${r.result.stats.layers} 層`],
    ["組起來分成幾塊", (r) => `${r.result.stats.components} 塊`],
    ["補支撐", (r) => `${toLayerCells(r.result.stats.supportCellsAdded)} 格`],
    ["移除的懸空部分", (r) => `${toLayerCells(r.result.stats.floatingCellsRemoved + r.result.stats.ungroundedCellsRemoved)} 格`],
    ["警告", (r) => `${allWarnings(r).size} 條`],
    ["估計價格", (r) => `約 NT$ ${r.result.stats.priceTwd.toLocaleString()}`],
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white" data-testid="compare-metrics">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium text-zinc-600">指標</th>
            {cols.map((id) => <th key={id} className="px-3 py-2 font-medium">{byId.get(id)?.label ?? id}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, f]) => (
            <tr key={name} className="border-t border-zinc-100">
              <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{name}</td>
              {cols.map((id) => <td key={id} className="px-3 py-2 tabular-nums">{cell(id, f)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500">
        所有模型的設計都用同一套程式轉成零件、檢查結構，所以零件數、分成幾塊、補支撐可以直接比較。花費時間與 token 是伺服器量到的；API 成本照牌價換算，Codex 與 OpenAI 模型沒有內建價格。
      </p>
    </div>
  );
}
