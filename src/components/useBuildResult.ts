"use client";

// 載入模型（示範模型或 localStorage）並做出三個版本（加上有預算時的預算版）。結果頁與列印頁共用。
import { useMemo } from "react";
import type { ModelSpec } from "@/core/spec";
import { buildTier, buildTierClean, CLEAN_STEPS, fitBudget, type TierBuild, type TierKey, TIERS } from "@/core/tiers";
import { getFixture } from "@/fixtures";
import { type SavedBuild, useSavedBuild } from "@/lib/storage";

/** 三個版本加上預算版 */
export type BuildChoice = TierKey | "budget";
export type Builds = Partial<Record<BuildChoice, TierBuild>> & Record<TierKey, TierBuild>;

export type BuildLoad =
  | { status: "loading" }
  | { status: "missing" }
  | {
      status: "ok";
      builds: Builds;
      /** 預算版有沒有在預算內（沒給預算是 null） */
      budgetFits: boolean | null;
      defaultChoice: BuildChoice;
      saved: SavedBuild | null;
      isDemo: boolean;
    };

export function useBuildResult(id: string): BuildLoad {
  const fixture = getFixture(id);
  const saved = useSavedBuild(id, !fixture);
  const savedBuild: SavedBuild | null = saved === "loading" || saved === "missing" ? null : saved;
  const spec: ModelSpec | null = fixture ? fixture.spec : (savedBuild?.spec ?? null);
  const budget = savedBuild?.budget;
  const computed = useMemo(() => {
    if (!spec) return null;
    const builds: Builds = {
      cheap: buildTierClean(spec, "cheap", TIERS.cheap.scale, "both", CLEAN_STEPS.cheap),
      standard: buildTier(spec, "standard"),
      flagship: buildTierClean(spec, "flagship", TIERS.flagship.scale, "both", CLEAN_STEPS.flagship),
    };
    let budgetFits: boolean | null = null;
    if (budget) {
      const r = fitBudget(spec, budget);
      builds.budget = r.build;
      budgetFits = r.fits;
    }
    return { builds, budgetFits };
  }, [spec, budget]);

  if (!fixture && saved === "missing") return { status: "missing" };
  if (!computed) return { status: "loading" };
  return { status: "ok", ...computed, defaultChoice: computed.builds.budget ? "budget" : "standard", saved: savedBuild, isDemo: !!fixture };
}
