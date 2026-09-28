// localStorage 裡存 LLM 生成的模型。示範模型不存。
import { useMemo, useSyncExternalStore } from "react";
import type { ModelSpec, SizeTier } from "@/core/spec";

export type SavedBuild = {
  spec: ModelSpec; prompt: string; size: SizeTier; specWarnings: string[];
  /** API 回的品質警告（例如磚數超過上限），pipeline 重算不會重建這些 */
  apiWarnings?: string[];
  /** 使用者給的預算（新台幣），有的話結果頁會多一個「預算版」 */
  budget?: number;
  createdAt: string;
};

// localStorage 存不進去（無痕模式、空間滿）時的備援：只活在這個分頁，重新整理就不見
const memory = new Map<string, string>();

const key = (id: string) => `lego-builder:build:${id}`;

export type HistoryEntry = { id: string; title: string; prompt: string; createdAt: string };
const HISTORY_KEY = "lego-builder:history";
const HISTORY_MAX = 20;

/** 回傳 true 代表存進 localStorage；false 代表只存在記憶體（重新整理就不見）。 */
export function saveBuild(id: string, build: SavedBuild): boolean {
  memory.set(key(id), JSON.stringify(build));
  try {
    window.localStorage.setItem(key(id), JSON.stringify(build));
    const prev = readHistory().filter((h) => h.id !== id);
    const next = [{ id, title: build.spec.title, prompt: build.prompt, createdAt: build.createdAt }, ...prev].slice(0, HISTORY_MAX);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

const noopSubscribe = () => () => {};

/** 讀 localStorage 裡的模型。server 端與 hydration 階段回 "loading"，之後回 "missing" 或模型。 */
export function useSavedBuild(id: string, enabled: boolean): SavedBuild | "loading" | "missing" {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => (enabled ? readRaw(id) : null),
    () => null,
  );
  return useMemo(() => {
    if (!enabled || !hydrated) return "loading";
    if (!raw) return "missing";
    try {
      return JSON.parse(raw) as SavedBuild;
    } catch {
      return "missing";
    }
  }, [enabled, hydrated, raw]);
}

function readRaw(id: string): string | null {
  try {
    return window.localStorage.getItem(key(id)) ?? memory.get(key(id)) ?? null;
  } catch {
    return memory.get(key(id)) ?? null;
  }
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** 最近做過的模型（新的在前）。server 端回空陣列。 */
export function useHistory(): HistoryEntry[] {
  const raw = useSyncExternalStore(
    noopSubscribe,
    () => {
      try { return window.localStorage.getItem(HISTORY_KEY); } catch { return null; }
    },
    () => null,
  );
  return useMemo(() => {
    if (!raw) return [];
    try { return JSON.parse(raw) as HistoryEntry[]; } catch { return []; }
  }, [raw]);
}
