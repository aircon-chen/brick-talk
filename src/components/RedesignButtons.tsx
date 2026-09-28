"use client";

// 結果頁：用同一句話再設計一次、修改描述。只有 LLM 生成的模型才有。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SizeTier } from "@/core/spec";
import { requestDesign } from "@/lib/design-client";

export default function RedesignButtons({ prompt, size, budget }: { prompt: string; size: SizeTier; budget?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function again() {
    setBusy(true);
    setError(null);
    const r = await requestDesign(prompt, size, undefined, budget);
    setBusy(false);
    if (r.ok) router.push(`/build/${r.id}`);
    else setError(r.message);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm" data-testid="redesign">
      <span className="text-zinc-500">你的描述：「{prompt}」</span>
      <button onClick={() => void again()} disabled={busy} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50 disabled:text-zinc-400">
        {busy ? "設計中…" : "用同一句話再設計一次"}
      </button>
      <Link href={`/?prompt=${encodeURIComponent(prompt)}&size=${size}${budget ? `&budget=${budget}` : ""}`} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50">修改描述</Link>
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
