import type { Metadata } from "next";
import CompareView from "@/components/CompareView";

export const metadata: Metadata = { title: "模型比較｜Brick Talk" };

export default function ComparePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">模型比較</h1>
      <p className="mt-2 text-zinc-600">
        同一句話交給不同的 AI 模型設計，設計結果都用同一套程式轉成真實零件，並排比較誰做得比較像、比較穩、比較快。
      </p>
      <div className="mt-6">
        <CompareView />
      </div>
    </main>
  );
}
