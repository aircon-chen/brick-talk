// 點子模式：依主題給 3 個適合用 LEGO 做的點子（SUPERPROMPT.md 9.5）。
import { z } from "zod";
import { CORE_COLORS } from "@/core/palette";
import { SIZE_LIMITS } from "@/core/spec";
import { type CallModel, responseText } from "./design";

export const IdeaSchema = z.object({
  title: z.string(),
  pitch: z.string(),
  size: z.enum(["S", "M"]),
  colors: z.array(z.string()),
});
export const IdeasSchema = z.object({ ideas: z.array(IdeaSchema).min(1) });
export type Idea = z.infer<typeof IdeaSchema>;

export function ideasSystemPrompt(): string {
  const colors = CORE_COLORS.map((c) => c.name_zh).join("、");
  return `你幫使用者想「適合用 LEGO 磚做出來」的點子。模型主要用方方正正的 brick 堆出來（像像素畫的立體版），可以加上斜面屋頂、圓磚、錐體和輪子。點子只有小、中兩種尺寸，中最大 ${SIZE_LIMITS.M.x} × ${SIZE_LIMITS.M.y} × ${SIZE_LIMITS.M.z} 格，所以題目要輪廓清楚、有代表性的顏色、不需要細小零件。
給 3 個彼此不同的點子，每個有：title（繁中 12 字內）、pitch（一句話，說它長什麼樣子、用什麼顏色）、size（S 小或 M 中）、colors（2 到 4 個顏色，從這些選：${colors}）。`;
}

export function ideasUserMessage(theme: string): string {
  return theme.trim() ? `主題：${theme.trim()}` : "沒有指定主題，給我三個有趣、適合送禮或擺在桌上的點子。";
}

export async function suggestIdeas(theme: string, callModel: CallModel): Promise<Idea[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const msg = await callModel({
      system: ideasSystemPrompt(),
      messages: [{ role: "user", content: ideasUserMessage(theme) }],
      signal: ctrl.signal,
      timeoutMs: 60_000,
    });
    const parsed = IdeasSchema.safeParse(JSON.parse(responseText(msg)));
    return parsed.success ? parsed.data.ideas.slice(0, 3) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const MOCK_IDEAS: Idea[] = [
  { title: "紅色小恐龍", pitch: "圓圓的紅色恐龍，背上一排黃色尖刺，站在綠色草地上。", size: "M", colors: ["紅色", "黃色", "綠色"] },
  { title: "海邊的燈塔", pitch: "紅白相間的燈塔，頂端有一圈黃色的燈，站在灰色岩石上。", size: "M", colors: ["紅色", "白色", "黃色", "深灰色"] },
  { title: "盆栽仙人掌", pitch: "咖啡色花盆裡的綠色仙人掌，頂端開一朵粉紅色的小花。", size: "S", colors: ["綠色", "紅棕色", "亮粉紅"] },
];
