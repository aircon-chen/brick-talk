// POST /api/design：{ prompt, size, model? } → { spec, specWarnings, warnings, meta }（SUPERPROMPT.md 9.2）。model 是 /api/models 列出的 id，不給就用預設。
import { isSizeTier } from "@/core/spec";
import { claudeCliEnabled, cliDesignCallModel } from "@/llm/claude-cli";
import { designModel } from "@/llm/design";
import { mockDesign } from "@/llm/mock";
import { availableModels, callModelFor } from "@/llm/providers";
import { hasApiKey, sdkCallModel } from "@/llm/sdk";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_input", message: "請求格式不對" }, { status: 422 });
  }
  const { prompt, size, model } = (body ?? {}) as { prompt?: unknown; size?: unknown; model?: unknown };
  const text = typeof prompt === "string" ? prompt.trim() : "";
  if (!text || Array.from(text).length > 300 || !isSizeTier(size)) {
    return Response.json({ error: "invalid_input", message: "請輸入 1 到 300 字的描述，並選擇尺寸" }, { status: 422 });
  }

  if (model !== undefined && (typeof model !== "string" || !availableModels().some((o) => o.id === model))) {
    return Response.json({ error: "unknown_model", message: "這台電腦沒有設定這個模型（見 README 的模型比較）" }, { status: 422 });
  }

  if (process.env.LLM_MOCK === "1") {
    const r = mockDesign(text, size);
    return Response.json({ spec: r.spec, specWarnings: r.specWarnings, warnings: r.warnings, meta: r.meta });
  }
  // 有 API key 優先用 SDK；沒有的話，明確開了 LLM_BACKEND=claude-cli 才走本機 claude
  const callModel = typeof model === "string" ? callModelFor(model) : hasApiKey() ? sdkCallModel : claudeCliEnabled() ? cliDesignCallModel : null;
  if (!callModel) {
    return Response.json({ error: "no_api_key", message: "還沒設定 AI（API key 或 Claude 訂閱，見 README），可以先看範例模型" }, { status: 503 });
  }

  // 比較頁指定模型時放寬時間：模型速度差很多（實測 Sonnet 5 比 Opus 5.5 慢一倍），所有模型用同一個上限才公平
  const timing = typeof model === "string" ? { firstCallMs: 240_000, deadlineMs: 300_000 } : {};
  const r = await designModel({ prompt: text, size }, { callModel, ...timing, signal: req.signal });
  if (!r.ok) {
    console.error("[design] failed:", r.details.slice(0, 3).join(" | "));
    return Response.json({ error: "design_failed", message: r.message, details: r.details.slice(0, 10) }, { status: 502 });
  }
  console.info(`[design] ${typeof model === "string" ? model : "default"} ok in ${r.meta.seconds}s, ${r.meta.attempts} call(s), ${r.meta.inputTokens} input / ${r.meta.outputTokens} output tokens`);
  return Response.json({ spec: r.spec, specWarnings: r.specWarnings, warnings: r.warnings, meta: r.meta });
}
