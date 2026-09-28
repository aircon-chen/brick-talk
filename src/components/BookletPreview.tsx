"use client";

// 說明書分頁：產生圖片（顯示進度），然後逐步預覽。
import Link from "next/link";
import type { BuildResult } from "@/core/pipeline";
import StepPage from "./StepPage";
import { useBookletImages } from "./useBookletImages";

export default function BookletPreview({ result, buildId, tier }: { result: BuildResult; buildId: string; tier: string }) {
  const { done, total, images, error } = useBookletImages(result);

  if (error) return <p className="text-red-700">產生說明書圖片失敗：{error}</p>;
  if (!images) {
    return (
      <div className="py-10 text-center text-zinc-600" data-testid="booklet-progress">
        <p>產生說明書圖片 {done} / {total || "…"}</p>
        <div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded bg-zinc-200">
          <div className="h-full bg-red-600 transition-all" style={{ width: total ? `${(done / total) * 100}%` : "0%" }} />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="booklet-preview">
      <div className="flex flex-wrap gap-3">
        <Link href={`/build/${buildId}/print?tier=${tier}`} target="_blank" className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700">列印／存成 PDF</Link>
        <Link href={`/build/${buildId}/print?only=parts&tier=${tier}`} target="_blank" className="rounded-lg border border-zinc-300 bg-white px-4 py-2 font-medium hover:bg-zinc-50">只印零件清單</Link>
      </div>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {result.steps.map((s, i) => (
          <div key={s.index} className="rounded-xl border border-zinc-200 bg-white p-4">
            <StepPage step={s} image={images.steps[i]} thumbs={images.thumbs} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
