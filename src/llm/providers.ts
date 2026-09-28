// 比較頁能選的模型：依這台電腦設定了哪些 key 或登入決定。只在 server 端用。
import { toApiSchema } from "@/core/spec";
import { claudeCliEnabled, cliCallModel } from "./claude-cli";
import { codexCallModel, codexCliEnabled } from "./codex-cli";
import type { CallModel } from "./design";
import { openaiCallModel, openaiEnabled, openaiModels } from "./openai";
import { hasApiKey, sdkCallModelFor } from "./sdk";

export type Provider = "claude-api" | "claude-cli" | "openai-api" | "codex-cli" | "mock";

export type ModelOption = {
  /** 送給 /api/design 的 model，格式是「provider:模型名稱」 */
  id: string;
  label: string;
  provider: Provider;
  /** 比較頁要特別提醒的地方 */
  note?: string;
  /** API 牌價（美元／每百萬 token），拿來換算成本；不知道就不給 */
  priceUsdPerMTok?: { input: number; output: number };
};

// Claude Haiku 4.5 不支援 effort 參數，設計呼叫會直接報錯，所以不列
const CLAUDE = [
  { model: "claude-opus-5-5", label: "Claude Opus 5.5", price: { input: 4, output: 20 } },
  { model: "claude-sonnet-5", label: "Claude Sonnet 5", price: { input: 2, output: 10 } },
];

export function availableModels(): ModelOption[] {
  if (process.env.LLM_MOCK === "1") {
    return [{ id: "mock:a", label: "Mock A", provider: "mock" }, { id: "mock:b", label: "Mock B", provider: "mock" }];
  }
  const out: ModelOption[] = [];
  if (hasApiKey()) {
    for (const c of CLAUDE) out.push({ id: `claude-api:${c.model}`, label: c.label, provider: "claude-api", priceUsdPerMTok: c.price });
  }
  if (claudeCliEnabled()) {
    for (const c of CLAUDE) {
      out.push({ id: `claude-cli:${c.model}`, label: `${c.label}（Claude 訂閱）`, provider: "claude-cli", priceUsdPerMTok: c.price,
        note: "用訂閱額度，成本是照 API 牌價換算的參考值" });
    }
  }
  if (openaiEnabled()) {
    for (const m of openaiModels()) out.push({ id: `openai-api:${m}`, label: `OpenAI ${m}`, provider: "openai-api" });
  }
  if (codexCliEnabled()) {
    const m = process.env.CODEX_MODEL || undefined; // 空字串當成沒設定
    out.push({ id: `codex-cli:${m ?? "default"}`, label: `Codex ${m ?? "預設模型"}（ChatGPT 訂閱，實驗性）`, provider: "codex-cli",
      note: "Codex 是 coding agent，每次多帶約 3 萬個輸入 token 的系統提示；OpenAI 建議程式化使用改用 API key" });
  }
  return out;
}

/** 模型 id 對應到設計呼叫；沒有設定這個模型就回 null。 */
export function callModelFor(id: string): CallModel | null {
  const opt = availableModels().find((o) => o.id === id);
  if (!opt) return null;
  const model = id.slice(id.indexOf(":") + 1);
  switch (opt.provider) {
    case "claude-api": return sdkCallModelFor(model);
    case "claude-cli": return cliCallModel({ model, effort: "medium", schema: toApiSchema() });
    case "openai-api": return openaiCallModel(model);
    case "codex-cli": return codexCallModel(process.env.CODEX_MODEL || undefined);
    default: return null;
  }
}
