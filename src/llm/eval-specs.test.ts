// 評估一批 LLM 產出的 ModelSpec（prompt 調整用）。平常跳過；EVAL_SPECS=<資料夾> 才跑。
// 資料夾裡每個 <key>.json 是 { prompt, size, spec_json }。結果寫到同一個資料夾的 summary.json 與 layers/。
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLayers } from "@/core/layers";
import { runPipeline } from "@/core/pipeline";
import { normalizeSpec, parseModelSpec, type SizeTier } from "@/core/spec";
import { voxelize } from "@/core/voxelize";
import { type CallModel, designModel } from "./design";

const dir = process.env.EVAL_SPECS ?? "";

describe.skipIf(!dir || !existsSync(dir))("評估 LLM 產出的 ModelSpec", () => {
  it("逐一跑 designModel 的驗證與品質檢查", async () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "summary.json");
    mkdirSync(join(dir, "layers"), { recursive: true });
    const summary = [];
    for (const f of files) {
      const item = JSON.parse(readFileSync(join(dir, f), "utf8")) as { prompt: string; size: SizeTier; spec_json: string };
      let feedback: string | null = null;
      const callModel: CallModel = async ({ messages }) => {
        if (messages.length > 1) {
          feedback = messages.at(-1)!.content;
          throw Object.assign(new Error("stop after first attempt"), { status: 400 });
        }
        return { content: [{ type: "text", text: item.spec_json }], stop_reason: "end_turn" };
      };
      const r = await designModel({ prompt: item.prompt, size: item.size }, { callModel });
      const row: Record<string, unknown> = { key: f.replace(/\.json$/, ""), prompt: item.prompt, size: item.size, firstAttemptOk: r.ok && feedback === null, feedback };
      // 統計另外算：第一次品質不過時 designModel 會停在第二次呼叫，拿不到結果
      let json: unknown = null;
      try { json = JSON.parse(item.spec_json); } catch (e) { row.error = `JSON：${String(e)}`; }
      const parsed = json ? parseModelSpec(json) : null;
      if (parsed && !parsed.ok) row.error = parsed.errors.slice(0, 5);
      if (parsed?.ok) {
        const { spec, warnings: specWarnings } = normalizeSpec(parsed.spec, item.size);
        const res = runPipeline(spec);
        Object.assign(row, { title: spec.title, shapes: spec.shapes.length, specWarnings, stats: res.stats, warnings: res.warnings });
        writeFileSync(join(dir, "layers", `${row.key}.txt`), renderLayers(voxelize(spec), spec.title));
        writeFileSync(join(dir, "layers", `${row.key}.spec.json`), JSON.stringify(spec));
      }
      summary.push(row);
    }
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary, null, 1));
    expect(summary.length).toBe(files.length);
  });
});
