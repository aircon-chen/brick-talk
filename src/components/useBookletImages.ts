"use client";

import { useEffect, useState } from "react";
import type { BuildResult } from "@/core/pipeline";
import { type BookletImages, Snapshotter } from "@/render/snapshot";

// 同一個模型產過的圖留著，切換分頁或進列印頁不用重產
const cache = new WeakMap<BuildResult, BookletImages>();

export type BookletState = { done: number; total: number; images: BookletImages | null; error: string | null };

export function useBookletImages(result: BuildResult): BookletState {
  const [state, setState] = useState<BookletState>(() => ({ done: 0, total: 0, images: cache.get(result) ?? null, error: null }));

  useEffect(() => {
    if (cache.has(result)) return;
    const ctrl = new AbortController();
    const snap = new Snapshotter();
    snap
      .bookletImages(result, (done, total) => setState((s) => ({ ...s, done, total })), ctrl.signal)
      .then((images) => {
        cache.set(result, images);
        setState((s) => ({ ...s, images }));
      })
      .catch((e: unknown) => {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e) }));
      })
      .finally(() => snap.dispose());
    return () => ctrl.abort();
  }, [result]);

  return state;
}

const thumbCache = new WeakMap<BuildResult, Map<string, string>>();

/** 只產零件縮圖（零件清單分頁用）。說明書的圖產過的話直接共用。 */
export function useThumbs(result: BuildResult): Map<string, string> | null {
  const [thumbs, setThumbs] = useState<Map<string, string> | null>(() => cache.get(result)?.thumbs ?? thumbCache.get(result) ?? null);

  useEffect(() => {
    if (cache.has(result) || thumbCache.has(result)) return;
    let cancelled = false;
    const snap = new Snapshotter();
    const run = async () => {
      const out = new Map<string, string>();
      for (const r of result.bom) {
        if (cancelled) return;
        out.set(`${r.partNum}|${r.colorId}`, snap.partThumb(r.partNum, r.colorId));
        await new Promise((res) => setTimeout(res, 0));
      }
      thumbCache.set(result, out);
      if (!cancelled) setThumbs(out);
    };
    run().finally(() => snap.dispose());
    return () => { cancelled = true; };
  }, [result]);

  return thumbs;
}
