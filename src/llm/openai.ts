// OpenAI API（要 OPENAI_API_KEY）：直接呼叫 Responses API，用 structured outputs 強制輸出 ModelSpec。
// 不裝 openai 套件，用標準的 fetch。請求只用官方文件確認過的欄位（2026-09-28 查）。
import { toApiSchema } from "@/core/spec";
import type { CallModel, ModelMessage } from "./design";

export function openaiEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

/** 要比較的 OpenAI 模型，逗號分隔；預設用官方文件範例裡的 gpt-6-astra */
export function openaiModels(): string[] {
  // 空字串當成沒設定
  return (process.env.OPENAI_MODELS || "gpt-6-astra").split(",").map((s) => s.trim()).filter(Boolean);
}

type ResponsesBody = {
  status?: string;
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** Responses API 的回應：文字在 type 為 message 的 output 裡（前面可能有 reasoning），拒絕是 refusal，截斷是 status incomplete。 */
export function parseOpenAIResponse(d: ResponsesBody): ModelMessage {
  if (d.status === "failed" || d.error) throw new Error(`OpenAI 回應失敗：${d.error?.code ?? ""} ${d.error?.message ?? ""}`.trim());
  const parts = (d.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const usage = { input_tokens: d.usage?.input_tokens, output_tokens: d.usage?.output_tokens };
  if (parts.some((c) => c.type === "refusal")) return { content: [], stop_reason: "refusal", usage };
  const text = parts.filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
  const truncated = d.status === "incomplete" && d.incomplete_details?.reason === "max_output_tokens";
  return { content: [{ type: "text", text }], stop_reason: truncated ? "max_tokens" : "end_turn", usage };
}

export function openaiCallModel(model: string, fetchImpl: typeof fetch = fetch): CallModel {
  return async ({ system, messages, signal }) => {
    const res = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "developer", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
        text: { format: { type: "json_schema", name: "model_spec", schema: toApiSchema(), strict: true } },
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // 帶上狀態碼，designModel 看到 429、5xx 會回「忙碌」
      throw Object.assign(new Error(`OpenAI API ${res.status}：${body.slice(0, 200)}`), { status: res.status });
    }
    return parseOpenAIResponse((await res.json()) as ResponsesBody);
  };
}
