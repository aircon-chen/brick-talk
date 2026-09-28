"use client";

// 首頁的輸入表單：描述、尺寸、開始設計（進度、取消、錯誤）。
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SIZE_LABELS, SIZE_LIMITS, SIZE_TIERS, type SizeTier } from "@/core/spec";
import { requestDesign } from "@/lib/design-client";

type Idea = { title: string; pitch: string; size: SizeTier; colors: string[] };

export default function DesignForm({ initialPrompt = "", initialSize = "M", initialBudget = "" }: { initialPrompt?: string; initialSize?: SizeTier; initialBudget?: string }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [budget, setBudget] = useState(initialBudget);
  const [size, setSize] = useState<SizeTier>(initialSize);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [startedAt]);

  async function submit() {
    const text = prompt.trim();
    if (!text) return;
    setError(null);
    setElapsed(0);
    setStartedAt(Date.now());
    ctrl.current = new AbortController();
    const b = Number(budget);
    const r = await requestDesign(text, size, ctrl.current.signal, Number.isFinite(b) && b > 0 ? Math.round(b) : undefined);
    setStartedAt(null);
    if (r.ok) router.push(`/build/${r.id}`);
    else setError(r.message);
  }

  async function inspire() {
    setIdeasBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
      const data = (await res.json().catch(() => null)) as { ideas?: Idea[]; message?: string } | null;
      if (res.ok && data?.ideas?.length) setIdeas(data.ideas);
      else setError(data?.message ?? "這次沒想出點子，再試一次看看。");
    } catch {
      setError("連不上伺服器，請稍後再試。");
    } finally {
      setIdeasBusy(false);
    }
  }

  function pick(idea: Idea) {
    setPrompt(`${idea.title}：${idea.pitch}`);
    setSize(idea.size);
    setIdeas(null);
  }

  const busy = startedAt !== null;
  return (
    <form className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm" data-testid="design-form"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={300} rows={3} disabled={busy}
        placeholder="你想用樂高做什麼？例如：一隻紅色的小恐龍" aria-label="你想做什麼"
        className="w-full resize-none rounded-lg border border-zinc-300 p-3 text-lg outline-none focus:border-red-500" />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <fieldset className="flex flex-wrap gap-2" disabled={busy}>
          <legend className="sr-only">尺寸</legend>
          {SIZE_TIERS.map((t) => (
            <label key={t} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${size === t ? "border-red-500 bg-red-50 text-red-800" : "border-zinc-300"}`}>
              <input type="radio" name="size" value={t} checked={size === t} onChange={() => setSize(t)} className="sr-only" />
              {SIZE_LABELS[t]}（{t === "XL" ? "最大" : ""}約 {Math.round(SIZE_LIMITS[t].x * 0.8)} 公分寬）
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-zinc-600">
          預算
          <span className="flex items-center rounded-lg border border-zinc-300 bg-white px-2">
            <span className="text-zinc-500">NT$</span>
            <input type="number" inputMode="numeric" min={0} step={100} value={budget} disabled={busy} data-testid="budget-input"
              onChange={(e) => setBudget(e.target.value)} placeholder="選填" aria-label="預算（新台幣，選填）"
              className="w-24 bg-transparent px-1 py-1.5 outline-none" />
          </span>
        </label>
        <div className="ml-auto flex items-center gap-3">
          {busy && (
            <>
              <span className="text-sm text-zinc-600" data-testid="design-progress">
                {elapsed < 60 ? `設計中… ${elapsed} 秒` : `還在設計中，大概要 1 到 3 分鐘（${elapsed} 秒）`}
              </span>
              <button type="button" onClick={() => ctrl.current?.abort()} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50">取消</button>
            </>
          )}
          <button type="button" onClick={() => void inspire()} disabled={busy || ideasBusy} data-testid="ideas-button"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 disabled:text-zinc-400">
            {ideasBusy ? "想點子中…" : "給我靈感"}
          </button>
          <button type="submit" disabled={busy || !prompt.trim()} data-testid="design-submit"
            className="rounded-lg bg-red-600 px-5 py-2 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-zinc-300">
            開始設計
          </button>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-500" data-testid="budget-hint">
        預算選填。有填的話，結果頁會挑預算內最好的版本。參考（5 個範例、內建粗估）：從丐版到旗艦版大約 NT$ 290 到 2,700。
      </p>
      {ideas && (
        <div className="mt-4" data-testid="ideas">
          <p className="text-sm text-zinc-600">挑一個點子，會帶進上面的輸入框，你可以再改：</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {ideas.map((idea) => (
              <button type="button" key={idea.title} onClick={() => pick(idea)} data-testid="idea-card"
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left hover:border-red-400 hover:bg-white">
                <div className="font-semibold">{idea.title}</div>
                <div className="mt-1 text-sm text-zinc-600">{idea.pitch}</div>
                <div className="mt-2 text-xs text-zinc-500">{SIZE_LABELS[idea.size]}・{idea.colors.join("、")}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="design-error">
          <p>{error}</p>
          <button type="submit" className="mt-2 font-medium underline">再試一次</button>
          <span className="ml-2 text-red-700">或先看看下面的範例。</span>
        </div>
      )}
    </form>
  );
}
