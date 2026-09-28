import { describe, expect, it } from "vitest";
import { getFixture } from "@/fixtures";
import { checkCombos } from "./invariants";
import { ldrawLine } from "./ldraw";
import { getPart } from "./palette";
import { runPipeline } from "./pipeline";
import { labelOf, type ModelSpec, normalizeSpec, type Shape, toApiSchema } from "./spec";
import { applyParts, voxelize } from "./voxelize";

const box = (label: string, color: string, min: [number, number, number], max: [number, number, number], top?: Shape["top"]): Shape => ({
  shape: "box", op: "add", color, label, mirror: "none",
  min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] }, ...(top ? { top } : {}),
});
const spec = (size: [number, number, number], shapes: Shape[], parts?: ModelSpec["parts"]): ModelSpec => ({
  version: 1, title: "t", summary: "", size: { x: size[0], y: size[1], z: size[2] }, shapes, ...(parts ? { parts } : {}),
});
const kinds = (s: ModelSpec) => runPipeline(s).bricks.map((b) => getPart(b.partNum).kind);

describe("spec：特殊零件", () => {
  it("零件超出宣告的範圍就撐大範圍；超過尺寸上限就往內移，不刪；小數取整數；沒有零件就不留 parts", () => {
    const { spec: out, warnings } = normalizeSpec(spec([8, 8, 4], [box("底", "Red", [0, 0, 0], [8, 8, 1])], [
      { part: "cone_2x2", color: "Red", label: "尖頂", at: { x: 7, y: 0, z: 0 }, mirror: "none" },
      { part: "round_1x1", color: "Red", label: "燈", at: { x: 1.5, y: 1, z: 1 }, mirror: "none" },
      { part: "cone_1x1", color: "Red", label: "天線", at: { x: 2, y: 2, z: 30 }, mirror: "none" },
    ]), "S");
    expect(out.size).toEqual({ x: 9, y: 8, z: 10 }); // x 撐到 9 放得下尖頂，z 撐到「小」的上限 10
    expect(out.parts?.map((p) => `${p.label}@${p.at.x},${p.at.y},${p.at.z}`)).toEqual(["尖頂@7,0,0", "燈@1,1,1", "天線@2,2,9"]);
    expect(warnings).toEqual(["「燈」的位置有小數，已取整數", "「天線」超出模型範圍，往內移到放得下的位置"]);
    expect(normalizeSpec(spec([4, 4, 2], [box("底", "Red", [0, 0, 0], [4, 4, 1])]), "S").spec).not.toHaveProperty("parts");
  });

  it("給 LLM 的 schema：top、parts、axis 都是必填", () => {
    const s = toApiSchema() as { required: string[]; properties: { parts: { items: { required: string[] } }; shapes: { items: { anyOf: { required: string[] }[] } } } };
    expect(s.required).toContain("parts");
    expect(s.properties.parts.items.required).toContain("axis");
    for (const v of s.properties.shapes.items.anyOf) expect(v.required).toContain("top");
  });
});

describe("applyParts", () => {
  it("輪子：上面沒有車身就不裝", () => {
    const s = spec([8, 8, 4], [box("底", "Red", [0, 0, 0], [8, 8, 1])], [
      { part: "wheels", color: "Light Bluish Gray", label: "前輪", at: { x: 3, y: 3, z: 1 }, axis: "x", mirror: "none" },
    ]);
    const g = voxelize(s);
    expect(applyParts(g, s)).toEqual(["「前輪」上面沒有車身可以扣，輪子沒有裝上"]);
    expect(g.specials).toEqual([]);
  });

  it("輪子：輪軸座占 z 層 2x2 最上面一片，兩側輪拱在 z、z+1 挖空；輪框沒有這個顏色改淺灰色", () => {
    const s = spec([10, 8, 4], [box("車身", "Red", [0, 0, 0], [10, 8, 3])], [
      { part: "wheels", color: "Red", label: "輪", at: { x: 4, y: 3, z: 0 }, axis: "x", mirror: "none" },
    ]);
    const g = voxelize(s);
    expect(applyParts(g, s)).toEqual(["「輪」的輪框沒有紅色，改用淺灰色"]);
    const [W, D] = g.size;
    // z 是 plate：第 L 層是 3L 到 3L+2
    const at = (x: number, y: number, z: number) => g.cells[x + W * (y + D * z)];
    expect(g.specials).toEqual([{ partNum: "67687", colorId: 0, x: 4, y: 3, z: 2, w: 2, d: 2, h: 1, axis: "x", rimColor: 71 }]);
    expect(at(4, 3, 2)).toBe(0); // 輪軸座是黑色，在輪子那層最上面一片
    expect([at(4, 3, 0), at(4, 3, 1)]).toEqual([-1, -1]); // 輪軸座下面空著
    for (let z = 0; z < 6; z++) for (const x of [2, 3, 6, 7]) for (const y of [2, 3, 4, 5]) expect(at(x, y, z)).toBe(-1);
    expect(at(2, 3, 6)).toBe(4); // 第 z+2 層不挖
    expect(at(4, 3, 3)).toBe(4); // 輪軸座正上方的車身留著
  });

  it("錐體上面還有東西就改成圓磚；2x2x2 改成兩塊疊起來", () => {
    const s = spec([4, 4, 4], [box("底", "Red", [0, 0, 0], [4, 4, 1]), box("蓋", "Red", [0, 0, 3], [4, 4, 4])], [
      { part: "cone_2x2", color: "Red", label: "柱", at: { x: 1, y: 1, z: 1 }, mirror: "none" },
    ]);
    const g = voxelize(s);
    expect(applyParts(g, s)).toEqual(["「柱」上面還有東西，錐體頂端接不了，改成圓磚 2x2"]);
    expect(g.specials.map((p) => `${p.partNum}@${p.z}`)).toEqual(["3941@3", "3941@6"]);
  });

  it("這個顏色近期沒有生產：改用一般的磚", () => {
    // 3062b 沒有 Dark Tan
    const s = spec([4, 4, 2], [box("底", "Red", [0, 0, 0], [4, 4, 1])], [
      { part: "round_1x1", color: "Dark Tan", label: "燈", at: { x: 1, y: 1, z: 1 }, mirror: "none" },
    ]);
    const g = voxelize(s);
    expect(applyParts(g, s)).toEqual(["「燈」的圓磚 1x1近期沒有深沙色，改用一般的磚"]);
    expect(g.specials).toEqual([]);
    expect(g.cells[1 + 4 * (1 + 4 * 3)]).toBe(28); // 第 1 層從 plate 3 開始
  });
});

describe("applyParts：審查找到的邊界情況", () => {
  it("輪子放正中間又設 mirror x：鏡射到同一個位置，不會多出一組輪子", () => {
    const r = runPipeline(spec([6, 8, 3], [box("車身", "Red", [0, 0, 1], [6, 8, 3])], [
      { part: "wheels", color: "Light Bluish Gray", label: "輪", at: { x: 2, y: 3, z: 0 }, axis: "x", mirror: "x" },
    ]));
    const count = (k: string) => r.bricks.filter((b) => getPart(b.partNum).kind === k).length;
    expect([count("wheel_holder"), count("wheel"), count("tyre")]).toEqual([1, 2, 2]);
  });

  it("錐體放好之後，後面的零件又疊在它上面：還是要改成圓磚", () => {
    const s = spec([2, 2, 4], [box("底", "White", [0, 0, 0], [2, 2, 1])], [
      { part: "cone_2x2", color: "White", label: "塔", at: { x: 0, y: 0, z: 1 }, mirror: "none" },
      { part: "round_2x2", color: "White", label: "頂", at: { x: 0, y: 0, z: 3 }, mirror: "none" },
    ]);
    const r = runPipeline(s);
    expect(r.bricks.map((b) => b.partNum)).not.toContain("3942c");
    expect(r.warnings).toContain("「塔」上面還有東西，錐體頂端接不了，改成圓磚 2x2");
  });

  it("錐體改圓磚時，圓磚沒有這個顏色就改用一般的磚", () => {
    // 59900 有 Dark Tan，3062b 沒有
    const r = runPipeline(spec([1, 1, 3], [box("柱", "White", [0, 0, 0], [1, 1, 3])], [
      { part: "cone_1x1", color: "Dark Tan", label: "尖", at: { x: 0, y: 0, z: 1 }, mirror: "none" },
    ]));
    expect(checkCombos(r.bricks)).toEqual([]);
    expect(r.warnings).toContain("「尖」上面還有東西，錐體頂端接不了，深沙色又沒有圓磚 1x1，改用一般的磚");
  });
});

describe("頂面處理", () => {
  it("slopes：往內縮一格的屋頂，邊緣換成朝外的斜面", () => {
    const r = runPipeline(spec([4, 4, 2], [box("底", "Red", [0, 0, 0], [4, 4, 1]), box("頂", "Red", [0, 1, 1], [4, 3, 2], "slopes")]));
    const slopes = r.bricks.filter((b) => getPart(b.partNum).kind === "slope45");
    expect(slopes.map((b) => ({ partNum: b.partNum, x: b.x, y: b.y, z: b.z, w: b.w, d: b.d, dir: b.dir }))).toEqual([
      { partNum: "3037", x: 0, y: 1, z: 3, w: 4, d: 2, dir: "-y" },
    ]);
  });

  it("plate：機翼平鋪在機身上往兩側伸出，整片用薄板而且跟機身接在一起", () => {
    const r = runPipeline(spec([6, 6, 3], [box("機身", "White", [2, 0, 0], [4, 6, 2]), box("機翼", "Blue", [0, 2, 2], [6, 4, 3], "plate")]));
    const wing = r.bricks.filter((b) => b.z === 6);
    expect(wing.every((b) => getPart(b.partNum).kind === "plate")).toBe(true);
    expect(wing.reduce((n, b) => n + b.w * b.d, 0)).toBe(12);
    expect(r.stats.components).toBe(1);
  });

  it("plate：上面還有東西的格子照樣用磚", () => {
    const r = runPipeline(spec([2, 2, 3], [box("底", "Red", [0, 0, 0], [2, 2, 1]), box("板", "Red", [0, 0, 1], [2, 2, 2], "plate"), box("柱", "Red", [0, 0, 2], [1, 1, 3])]));
    const layer1 = r.bricks.filter((b) => b.z === 3);
    const cells = (k: string) => layer1.filter((b) => getPart(b.partNum).kind === k).reduce((n, b) => n + b.w * b.d, 0);
    expect([cells("plate"), cells("brick")]).toEqual([3, 1]);
  });

  it("tiles：露出的頂面鋪 tile，放在上一層、接在底下的磚上", () => {
    const r = runPipeline(spec([4, 4, 1], [box("桌面", "White", [0, 0, 0], [4, 4, 1], "tiles")]));
    const tiles = r.bricks.filter((b) => getPart(b.partNum).kind === "tile");
    expect(tiles.reduce((n, b) => n + b.w * b.d, 0)).toBe(16);
    expect(tiles.every((b) => b.z === 3)).toBe(true); // 鋪在第 0 層（plate 0 到 2）上面
    expect(r.stats.layers).toBe(2);
    expect(r.steps.at(-1)!.parts.every((p) => getPart(p.partNum).kind === "tile")).toBe(true);
  });

  it("球的邊緣自動換斜面、懸出來的底面換倒斜面，而且整個還是一塊", () => {
    const r = runPipeline(spec([12, 12, 10], [
      box("底座", "Yellow", [3, 3, 0], [9, 9, 2]),
      { shape: "ellipsoid", op: "add", color: "Yellow", label: "球", mirror: "none", center: { x: 6, y: 6, z: 5 }, radius: { x: 5, y: 5, z: 5 } },
    ]));
    const k = (kind: string) => r.bricks.filter((b) => getPart(b.partNum).kind === kind).length;
    expect(k("slope45")).toBeGreaterThan(0);
    expect(k("slope45_inv")).toBeGreaterThan(0);
    expect(r.stats.components).toBe(1);
    expect(r.stats.supportCellsAdded).toBe(0);
  });

  it("舊的設計（沒有 top、parts）結果不變", () => {
    expect(kinds(spec([4, 4, 2], [box("底", "Red", [0, 0, 0], [4, 4, 2])])).every((k) => k === "brick")).toBe(true);
  });
});

describe("底板 base", () => {
  it("鋪滿整個 x × y、只有一片 plate 高、用大片的 plate；模型墊高一片，全部連成一塊", () => {
    const r = runPipeline({ ...spec([16, 16, 3], [box("塔", "Red", [6, 6, 0], [10, 10, 3])]), base: "Green" });
    const base = r.bricks.filter((b) => b.z === 0);
    expect(base.every((b) => getPart(b.partNum).kind === "plate" && b.colorId === 2)).toBe(true);
    expect(base.reduce((n, b) => n + b.w * b.d, 0)).toBe(16 * 16);
    expect(base.length).toBeLessThanOrEqual(2);
    expect(Math.min(...r.bricks.filter((b) => b.colorId === 4).map((b) => b.z))).toBe(2); // 底板兩片厚
    expect(r.stats.components).toBe(1);
    expect(r.warnings).toEqual([]);
  });

  it.each([[24, 24], [32, 32], [20, 12], [9, 30]])("底板 %i×%i 兩層錯開：底板自己連成一塊，模型不在上面的角落也不會掉", (W, D) => {
    const r = runPipeline({ ...spec([W, D, 2], [box("小塔", "Red", [0, 0, 0], [2, 2, 2])]), base: "Tan" });
    expect(r.stats.components).toBe(1);
    expect(r.warnings).toEqual([]);
    const base = r.bricks.filter((b) => b.z < 2);
    expect(base.every((b) => getPart(b.partNum).kind === "plate")).toBe(true);
    expect(base.reduce((n, b) => n + b.w * b.d, 0)).toBe(W * D * 2);
  });

  it("底板的部位名稱是「底板」", () => {
    const s = { ...spec([8, 8, 2], [box("塔", "Red", [0, 0, 0], [2, 2, 2])]), base: "Green" };
    expect(labelOf(s, 1)).toBe("底板");
  });

  it("有輪子就不鋪底板", () => {
    const { spec: out, warnings } = normalizeSpec({ ...getFixture("demo-car")!.spec, base: "Green" }, "M");
    expect(out.base).toBeUndefined();
    expect(warnings).toContain("有輪子的模型不鋪底板");
  });

  it("給 LLM 的 schema：base 是必填，可以是顏色或 null", () => {
    const s = toApiSchema() as { required: string[]; properties: { base: { anyOf: { type?: string }[] } } };
    expect(s.required).toContain("base");
    expect(s.properties.base.anyOf.some((v) => v.type === "null")).toBe(true);
  });
});

describe("示範跑車的輪子", () => {
  const r = runPipeline(getFixture("demo-car")!.spec);
  const byKind = (k: string) => r.bricks.filter((b) => getPart(b.partNum).kind === k);

  it("2 個輪軸座、4 個輪框、4 個輪胎；輪子在輪軸座那一步的下一步裝", () => {
    expect([byKind("wheel_holder").length, byKind("wheel").length, byKind("tyre").length]).toEqual([2, 4, 4]);
    expect(r.steps[0].parts.map((p) => p.partNum)).toEqual(["67687"]);
    expect(r.steps[1].parts.map((p) => p.partNum).sort()).toEqual(["6014b", "87697"]);
  });

  it("LDraw：輪軸座用 4600.dat，輪框離中心 28 LDU、輪胎 34 LDU，在輪軸高度", () => {
    const holder = byKind("wheel_holder").find((b) => b.x === 3)!;
    expect(ldrawLine(holder)).toBe("1 0 80 -24 80 0 0 1 0 1 0 -1 0 0 4600.dat");
    const lines = r.bricks.filter((b) => b.attachedTo === holder.id).map(ldrawLine);
    expect(lines).toEqual([
      "1 71 80 -19 52 1 0 0 0 1 0 0 0 1 6014b.dat",
      "1 0 80 -19 46 1 0 0 0 1 0 0 0 1 87697.dat",
      "1 71 80 -19 108 -1 0 0 0 1 0 0 0 -1 6014b.dat",
      "1 0 80 -19 114 -1 0 0 0 1 0 0 0 -1 87697.dat",
    ]);
  });
});
