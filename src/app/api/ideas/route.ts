// POST /api/ideas：{ prompt } → { ideas }（SUPERPROMPT.md 9.5）。
import { claudeCliEnabled, cliIdeasCallModel } from "@/llm/claude-cli";
import { MOCK_IDEAS, suggestIdeas } from "@/llm/ideas";
import { hasApiKey, sdkIdeasCallModel } from "@/llm/sdk";

export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => ({}));
  if (!body || typeof body !== "object") {
    return Response.json({ error: "invalid_input", message: "請求格式不對" }, { status: 422 });
  }
  const prompt = (body as { prompt?: unknown }).prompt;
  const theme = typeof prompt === "string" ? prompt.slice(0, 300) : "";
  if (process.env.LLM_MOCK === "1") return Response.json({ ideas: MOCK_IDEAS });
  const callModel = hasApiKey() ? sdkIdeasCallModel : claudeCliEnabled() ? cliIdeasCallModel : null;
  if (!callModel) return Response.json({ error: "no_api_key", message: "還沒設定 AI（API key 或 Claude 訂閱，見 README），可以先看範例模型" }, { status: 503 });
  const ideas = await suggestIdeas(theme, callModel);
  if (!ideas) return Response.json({ error: "ideas_failed", message: "這次沒想出點子，再試一次看看。" }, { status: 502 });
  return Response.json({ ideas });
}
