import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkBom, checkCombos, checkCoverage, checkGrounded, checkSteps } from "../core/invariants";
import { renderLayers } from "../core/layers";
import { brickCellIndices } from "../core/legolize";
import { runPipeline } from "../core/pipeline";
import { labelOf, normalizeSpec, parseModelSpec } from "../core/spec";
import { adjacency } from "../core/support";
import { voxelize } from "../core/voxelize";
import { FIXTURES } from "./index";

describe.each(FIXTURES)("示範模型 $key", (f) => {
  it("是合法而且已經正規化的 spec", () => {
    const parsed = parseModelSpec(f.spec);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { warnings } = normalizeSpec(parsed.spec, f.tier);
    expect(warnings).toEqual([]);
  });

  it("不變條件 1 到 6 全部成立，並輸出俯視圖", () => {
    const r = runPipeline(f.spec);
    const owner = new Int32Array(r.grid.cells.length).fill(-1);
    for (const b of r.bricks) for (const i of brickCellIndices(b, r.grid.size)) owner[i] = b.id;
    const adj = adjacency(r.bricks, owner, r.grid.size);
    expect([
      ...checkCoverage(r.grid, r.bricks), ...checkCombos(r.bricks), ...checkGrounded(r.bricks, adj),
      ...checkSteps(r.bricks, adj, r.steps), ...checkBom(r.bricks, r.bom),
    ]).toEqual([]);
    expect(JSON.stringify(runPipeline(f.spec).bricks)).toBe(JSON.stringify(r.bricks));
    // 範例要拿得起來：一整塊、不靠補支撐
    expect(r.stats.components).toBe(1);
    expect(r.stats.supportCellsAdded).toBe(0);

    mkdirSync("artifacts/layers", { recursive: true });
    writeFileSync(`artifacts/layers/${f.key}.txt`, renderLayers(voxelize(f.spec), f.spec.title));
    const s = r.stats;
    const labels = (idx: number[]) => idx.map((i) => labelOf(f.spec, i)).join("、");
    console.log(`[${f.key}] 磚 ${s.bricks}、種類 ${s.partTypes}、層 ${s.layers}、步驟 ${s.steps}、元件 ${s.components}、補支撐 ${s.supportCellsAdded}、移除 ${s.ungroundedCellsRemoved}` +
      (r.diagnostics.detachedShapes.length ? `；分開的部位：${r.diagnostics.detachedShapes.map(labels).join(" / ")}` : "") +
      (r.diagnostics.supportedShapes.length ? `；補支撐的部位：${labels(r.diagnostics.supportedShapes)}` : ""));
  });
});
