// GET /api/models：這台電腦設定了哪些模型可以比較。
import { availableModels } from "@/llm/providers";

export function GET() {
  return Response.json({ models: availableModels() });
}
