// 預設的 callModel：包 @anthropic-ai/sdk。只在 server 端用，API key 只從環境變數讀。
import Anthropic from "@anthropic-ai/sdk";
import { toApiSchema, toStructuredSchema } from "@/core/spec";
import type { CallModel } from "./design";
import { IdeasSchema } from "./ideas";
import { DESIGN_MODEL, IDEAS_MODEL } from "./models";

let client: Anthropic | null = null;

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** 指定模型的設計呼叫（比較頁用）；預設的 sdkCallModel 用 DESIGN_MODEL。 */
export const sdkCallModelFor = (model: string): CallModel => async ({ system, messages, signal, timeoutMs }) => {
  // 重試只由 designModel 控制，SDK 自己不重試
  client ??= new Anthropic({ maxRetries: 0 });
  const stream = client.messages.stream(
    {
      model,
      max_tokens: 32000, // thinking 也算在裡面
      system,
      messages,
      output_config: { effort: "medium", format: { type: "json_schema", schema: toApiSchema() } },
    },
    { signal, timeout: timeoutMs },
  );
  return await stream.finalMessage();
};

export const sdkCallModel = sdkCallModelFor(DESIGN_MODEL);

/** 點子模式用 Sonnet 5、effort low，求快。 */
export const sdkIdeasCallModel: CallModel = async ({ system, messages, signal, timeoutMs }) => {
  client ??= new Anthropic({ maxRetries: 0 });
  const schema = toStructuredSchema(IdeasSchema);
  const stream = client.messages.stream(
    {
      model: IDEAS_MODEL,
      max_tokens: 4000,
      system,
      messages,
      output_config: { effort: "low", format: { type: "json_schema", schema } },
    },
    { signal, timeout: timeoutMs },
  );
  return await stream.finalMessage();
};
