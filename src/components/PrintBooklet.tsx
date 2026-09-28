"use client";

// 列印頁：A4 說明書。封面、零件總表（每頁 24 格）、每步一頁、完成頁。onlyParts 只印零件總表。
import Link from "next/link";
import { colorLabel } from "@/core/bom";
import type { BuildResult } from "@/core/pipeline";
import type { Step } from "@/core/steps";
import { Missing } from "./BuildView";
import StepPage from "./StepPage";
import { type BookletState, useBookletImages } from "./useBookletImages";
import { type BuildChoice, useBuildResult } from "./useBuildResult";

/** 零件總表每頁 3 欄 × 10 排。卡片是橫式（縮圖在左），才放得進 A4 的高度。 */
export const PARTS_PER_PAGE = 30;
const SMALL_STEP = 3;

/** 步驟頁排版：新零件 3 塊以內的連續兩步排在同一頁。回傳每一頁放哪幾步（steps 的索引）。 */
export function layoutStepPages(steps: Step[]): number[][] {
  const pages: number[][] = [];
  for (let i = 0; i < steps.length; i++) {
    const small = (k: number) => k < steps.length && steps[k].brickIds.length <= SMALL_STEP;
    if (small(i) && small(i + 1)) {
      pages.push([i, i + 1]);
      i++;
    } else {
      pages.push([i]);
    }
  }
  return pages;
}

/** 總頁數 = 1（封面）+ 零件總表頁數 + 步驟頁數 + 1（完成頁）；只印零件就是零件總表頁數。 */
export function bookletPageCount(partTypes: number, stepPages: number, onlyParts: boolean): number {
  const partPages = Math.ceil(partTypes / PARTS_PER_PAGE);
  return onlyParts ? partPages : 1 + partPages + stepPages + 1;
}

export default function PrintBooklet({ id, onlyParts, tier }: { id: string; onlyParts: boolean; tier?: string }) {
  const load = useBuildResult(id);
  if (load.status === "missing") return <Missing />;
  if (load.status === "loading") return <main className="p-8 text-zinc-500">載入中…</main>;
  // 網址的 ?tier= 決定印哪個版本，沒給或不認得就用結果頁預設的那一版
  const build = (tier && load.builds[tier as BuildChoice]) || load.builds[load.defaultChoice] || load.builds.standard;
  return <Booklet id={id} result={build.result} onlyParts={onlyParts} />;
}

function Booklet({ id, result, onlyParts }: { id: string; result: BuildResult; onlyParts: boolean }) {
  const state: BookletState = useBookletImages(result);
  const { images } = state;
  const stepPages = layoutStepPages(result.steps);
  const expected = bookletPageCount(result.bom.length, stepPages.length, onlyParts);

  return (
    <main className="booklet mx-auto py-6 print:py-0" data-testid="booklet" data-ready={images ? "true" : "false"} data-expected-pages={expected}>
      <div className="mx-auto mb-6 flex w-[190mm] max-w-full flex-wrap items-center gap-3 print:hidden">
        <Link href={`/build/${id}`} className="text-sm text-zinc-600 hover:underline">← 回到模型</Link>
        {images ? (
          <button onClick={() => window.print()} className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700" data-testid="print-button">
            列印／存成 PDF
          </button>
        ) : (
          <span className="text-zinc-600">{state.error ? `產生圖片失敗：${state.error}` : `產生說明書圖片 ${state.done} / ${state.total || "…"}`}</span>
        )}
        <span className="text-sm text-zinc-500">共 {expected} 頁，A4 直式</span>
      </div>

      {images && (
        <>
          {!onlyParts && (
            <section className="page flex flex-col items-center justify-center text-center">
              <h1 className="text-4xl font-black">{result.spec.title}</h1>
              {result.spec.summary && <p className="mt-3 max-w-[150mm] text-zinc-600">{result.spec.summary}</p>}
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={images.finals[0]} alt="完成圖" className="mt-6 max-h-[170mm] w-full object-contain" />
              <p className="mt-6 text-lg">
                {result.stats.bricks} 塊零件・{result.stats.sizeCm[0]} × {result.stats.sizeCm[1]} × {result.stats.sizeCm[2]} 公分
              </p>
              <p className="mt-2 text-sm text-zinc-500">{new Date().toLocaleDateString("zh-TW")}・由 Brick Talk 產生</p>
            </section>
          )}

          {chunk(result.bom, PARTS_PER_PAGE).map((rows, pi) => (
            <section key={`parts-${pi}`} className="page">
              <h2 className="text-2xl font-bold">零件清單{pi > 0 ? `（續）` : ""}</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {rows.map((r) => (
                  <div key={`${r.partNum}|${r.colorId}`} className="flex h-[23mm] items-center gap-2 overflow-hidden rounded-lg border border-zinc-200 px-1.5" data-testid="parts-card">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
                    <img src={images.thumbs.get(`${r.partNum}|${r.colorId}`)} alt={r.partNameZh} className="h-16 w-16 shrink-0" />
                    <div className="min-w-0 leading-tight">
                      <div className="text-base font-bold">{r.qty}x <span className="text-sm font-medium">{r.partNameZh}</span></div>
                      <div className="text-[11px] text-zinc-700">{colorLabel(r.colorId)}</div>
                      <div className="font-mono text-[11px] text-zinc-500">{r.primaryElementId}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {!onlyParts && stepPages.map((group) => (
            <section key={`steps-${group.join("-")}`} className="page flex flex-col gap-4">
              {group.map((i) => (
                <div key={i} className={group.length > 1 ? "min-h-0 flex-1 border-b border-zinc-200 pb-3 last:border-b-0" : "min-h-0 flex-1"}>
                  <StepPage step={result.steps[i]} image={images.steps[i]} thumbs={images.thumbs} compact={group.length > 1} />
                </div>
              ))}
            </section>
          ))}

          {!onlyParts && (
            <section className="page flex flex-col">
              <h2 className="text-2xl font-bold">完成！</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={images.finals[0]} alt="完成圖（正面）" className="mt-2 min-h-0 w-full flex-1 object-contain" />
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL */}
              <img src={images.finals[1]} alt="完成圖（背面）" className="min-h-0 w-full flex-1 object-contain" />
            </section>
          )}
        </>
      )}
    </main>
  );
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}
