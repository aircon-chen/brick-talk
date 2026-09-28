// LLM_MOCK=1 時不呼叫 API，依關鍵字回示範模型。e2e 一律用這個，測試過程不打外部網路。
import { runPipeline } from "@/core/pipeline";
import { normalizeSpec, type SizeTier } from "@/core/spec";
import { getFixture } from "@/fixtures";
import type { DesignSuccess } from "./design";

const KEYWORDS: [RegExp, string][] = [
  [/鴨|duck/i, "demo-duck"],
  [/車|car/i, "demo-car"],
  [/樹|tree/i, "demo-tree"],
  [/機器人|robot/i, "demo-robot"],
  [/房|屋|house/i, "demo-house"],
];

export function mockDesign(prompt: string, size: SizeTier): DesignSuccess {
  const id = KEYWORDS.find(([re]) => re.test(prompt))?.[1] ?? "demo-house";
  const { spec, warnings: specWarnings } = normalizeSpec(getFixture(id)!.spec, size);
  return { ok: true, spec, specWarnings, warnings: runPipeline(spec).warnings, meta: { attempts: 0, seconds: 0, inputTokens: 0, outputTokens: 0 } };
}
