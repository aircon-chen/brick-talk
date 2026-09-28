"use client";

// 結果頁：載入 spec（示範模型或 localStorage）、做出三個版本、選一個版本看統計與分頁。
import Link from "next/link";
import { useState } from "react";
import BomPanel from "./BomPanel";
import BookletPreview from "./BookletPreview";
import RedesignButtons from "./RedesignButtons";
import { type BuildChoice, type Builds, useBuildResult } from "./useBuildResult";
import AssemblyPlayer from "./AssemblyPlayer";

type Tab = "3d" | "bom" | "booklet" | "animation";

export default function BuildView({ id }: { id: string }) {
  const load = useBuildResult(id);
  const [tab, setTab] = useState<Tab>("3d");
  const [choice, setChoice] = useState<BuildChoice | null>(null);

  if (load.status === "missing") return <Missing />;
  if (load.status === "loading") return <main className="mx-auto max-w-5xl px-4 py-16 text-zinc-500">載入中…</main>;
  const { builds, saved } = load;
  const current = choice ?? load.defaultChoice;
  const result = (builds[current] ?? builds.standard).result;
  const s = result.stats;
  const warnings = [...new Set([...(saved?.apiWarnings ?? []), ...(saved?.specWarnings ?? []), ...result.warnings])];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">{result.spec.title}</h1>
      {result.spec.summary && <p className="mt-2 text-zinc-600">{result.spec.summary}</p>}
      {saved && <RedesignButtons prompt={saved.prompt} size={saved.size} budget={saved.budget} />}

      <TierPicker builds={builds} current={current} onPick={setChoice} budget={saved?.budget} budgetFits={load.budgetFits} />

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="stats">
        <Stat label="零件總數" value={`${s.bricks} 塊`} />
        <Stat label="估計價格" value={`約 NT$ ${s.priceTwd.toLocaleString()}`} />
        <Stat label="零件種類" value={`${s.partTypes} 種`} />
        <Stat label="成品尺寸" value={`${s.sizeCm[0]} × ${s.sizeCm[1]} × ${s.sizeCm[2]} 公分`} />
        <Stat label="層數" value={`${s.layers} 層`} />
        <Stat label="步驟" value={`${s.steps} 步`} />
      </dl>

      {s.hiddenBricks > 0 && (
        <p className="mt-2 text-sm text-zinc-500">模型是實心的，其中約 {s.hiddenBricks} 塊在內部、從外面看不到。</p>
      )}

      {warnings.length > 0 && (
        <ul className="mt-5 space-y-1" data-testid="warnings">
          {warnings.map((w, i) => (
            <li key={w} className={i === 0 ? "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-medium text-amber-900" : "px-3 text-sm text-amber-800"}>{w}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap gap-1 border-b border-zinc-200" role="tablist">
        {([["3d", "3D 預覽"], ["bom", "零件清單"], ["booklet", "組裝說明書"], ["animation", "動畫說明書"]] as const).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 font-medium ${tab === key ? "border-red-600 text-red-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}>
            {label}
          </button>
        ))}
      </div>

      <section className="mt-5">
        {/* key 帶版本：切換版本時播放器重設，才不會停在上一版的步數、只畫出一部分 */}
        {tab === "3d" && <AssemblyPlayer key={`${id}-${current}-preview`} result={result} />}
        {tab === "animation" && <AssemblyPlayer key={`${id}-${current}-animation`} result={result} booklet />}
        {tab === "bom" && <BomPanel result={result} />}
        {tab === "booklet" && <BookletPreview result={result} buildId={id} tier={current} />}
      </section>
    </main>
  );
}

export function Missing() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">找不到這個模型</h1>
      <p className="mt-3 text-zinc-600">它可能是在別的瀏覽器做的，或是瀏覽器資料被清掉了。</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-red-600 px-5 py-2.5 font-medium text-white hover:bg-red-700">回首頁</Link>
    </main>
  );
}

const scaleText = (s: number) => (s === 1 ? "原尺寸" : `${Number(s.toFixed(2))} 倍`);

/** 版本卡片：丐版、平民版、旗艦版，有預算時多一張預算版放最前面。 */
function TierPicker({ builds, current, onPick, budget, budgetFits }: {
  builds: Builds; current: BuildChoice; onPick: (c: BuildChoice) => void; budget?: number; budgetFits: boolean | null;
}) {
  const order: BuildChoice[] = [...(builds.budget ? (["budget"] as const) : []), "cheap", "standard", "flagship"];
  return (
    <section className="mt-5" data-testid="tiers">
      <h2 className="text-sm font-medium text-zinc-600">選一個版本（同一個模型，差在大小與做工，價格是估算）</h2>
      <div className={`mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 ${builds.budget ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {order.map((c) => {
          const b = builds[c]!;
          const s = b.result.stats;
          const same = c === "cheap" && b.scale >= 1 && s.priceTwd >= builds.standard.result.stats.priceTwd;
          const detail = same ? "模型不大，再縮小就認不出來；也沒有底板、斜面可以拿掉，所以跟平民版一樣"
            : c === "cheap" && b.scale >= 1 ? "模型不大，再縮小就認不出來，丐版不縮小，只拿掉底板、斜面與細階梯"
            : c !== "budget" ? `${b.note}（${scaleText(b.scale)}）`
            : budgetFits ? `預算 NT$ ${budget?.toLocaleString()} 內最好的版本（${scaleText(b.scale)}）`
            : `預算 NT$ ${budget?.toLocaleString()} 不夠，最便宜的版本要 NT$ ${s.priceTwd.toLocaleString()}`;
          return (
            <button key={c} type="button" data-testid="tier-card" data-tier={c} aria-pressed={current === c} onClick={() => onPick(c)}
              className={`rounded-xl border p-3 text-left ${current === c ? "border-red-500 bg-red-50" : "border-zinc-200 bg-white hover:border-zinc-400"}`}>
              <div className="font-semibold">{c === "budget" ? `依預算：${b.label}` : b.label}</div>
              <div className="mt-1 text-lg font-bold tabular-nums">約 NT$ {s.priceTwd.toLocaleString()}</div>
              <div className="text-sm text-zinc-600">{s.bricks} 塊・{s.sizeCm[0]} × {s.sizeCm[1]} × {s.sizeCm[2]} 公分</div>
              <div className="mt-1 text-xs text-zinc-500">{detail}</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
