"use client";

// 首頁的範例卡片，縮圖在瀏覽器用同一個 renderer 依序產生。
import Link from "next/link";
import { useEffect, useState } from "react";
import { runPipeline } from "@/core/pipeline";
import { FIXTURES } from "@/fixtures";
import { Snapshotter } from "@/render/snapshot";

type Demo = { id: string; key: string; name: string; title: string; bricks: number; partTypes: number; steps: number };

export default function DemoGallery({ demos }: { demos: Demo[] }) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const snap = new Snapshotter();
    (async () => {
      for (const f of FIXTURES) {
        if (cancelled) return;
        const url = snap.modelThumb(runPipeline(f.spec));
        setThumbs((t) => ({ ...t, [f.id]: url }));
        await new Promise((r) => setTimeout(r, 0));
      }
    })().finally(() => snap.dispose());
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {demos.map((d) => (
        <Link key={d.id} href={`/build/${d.id}`} data-testid={`demo-${d.key}`}
          className="overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:border-red-400 hover:shadow-sm">
          <div className="aspect-[4/3] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
            {thumbs[d.id] ? <img src={thumbs[d.id]} alt={d.title} className="h-full w-full object-contain" /> : <div className="h-full w-full animate-pulse bg-zinc-100" />}
          </div>
          <div className="p-3">
            <div className="text-lg font-semibold">{d.name}</div>
            <div className="text-sm text-zinc-600">{d.title}</div>
            <div className="mt-2 text-xs text-zinc-500">{d.bricks} 塊・{d.partTypes} 種零件・{d.steps} 步</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
