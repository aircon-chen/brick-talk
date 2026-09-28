import { describe, expect, it } from "vitest";
import { isSizeTier, type ModelSpec, normalizeSpec, parseModelSpec, shapeBounds, SIZE_TIERS, toApiSchema } from "./spec";

const box = (over: Partial<Record<string, unknown>> = {}) => ({
  shape: "box" as const, op: "add" as const, color: "Red", label: "底座", mirror: "none" as const,
  min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 1 }, ...over,
});
const spec = (shapes: unknown[], size = { x: 10, y: 10, z: 6 }, title = "測試") =>
  ({ version: 1, title, summary: "說明", size, shapes }) as unknown as ModelSpec;

describe("parseModelSpec", () => {
  it("接受合法的 spec，色名不分大小寫", () => {
    const r = parseModelSpec(spec([box({ color: "dark bluish gray " })]));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.shapes[0].color).toBe("Dark Bluish Gray");
  });
  it("缺欄位、非 core 色都是結構錯誤", () => {
    const noMirror = box();
    delete (noMirror as Record<string, unknown>).mirror;
    expect(parseModelSpec(spec([noMirror])).ok).toBe(false);
    expect(parseModelSpec(spec([box({ color: "Lavender" })])).ok).toBe(false);
    expect(parseModelSpec(spec([])).ok).toBe(false);
  });
});

describe("normalizeSpec", () => {
  const norm = (s: ModelSpec, tier: "S" | "M" = "M") => normalizeSpec(parseOk(s), tier);
  const parseOk = (s: ModelSpec) => {
    const r = parseModelSpec(s);
    if (!r.ok) throw new Error(r.errors.join("; "));
    return r.spec;
  };

  it("size clamp 到尺寸上限並取整數", () => {
    const r = norm(spec([box()], { x: 30.4, y: 9.6, z: 50 }), "S");
    expect(r.spec.size).toEqual({ x: 12, y: 10, z: 10 });
    expect(r.warnings.some((w) => w.includes("縮成 12×10×10"))).toBe(true);
  });
  it("標題超過 20 字截斷", () => {
    const r = norm(spec([box()], undefined, "一二三四五六七八九十一二三四五六七八九十多出來"));
    expect(Array.from(r.spec.title)).toHaveLength(20);
    expect(r.warnings.some((w) => w.includes("標題太長"))).toBe(true);
  });
  it("形狀超過 80 個截斷", () => {
    const r = norm(spec(Array.from({ length: 85 }, () => box())));
    expect(r.spec.shapes).toHaveLength(80);
    expect(r.warnings.some((w) => w.includes("後面 5 個已刪掉"))).toBe(true);
  });
  it("box 的 min、max 顛倒就對調；體積 0 就刪掉", () => {
    const r = norm(spec([box({ min: { x: 4, y: 0, z: 0 }, max: { x: 0, y: 2, z: 1 } }), box({ label: "扁", max: { x: 4, y: 2, z: 0 } })]));
    expect(r.spec.shapes).toHaveLength(1);
    expect(r.spec.shapes[0]).toMatchObject({ min: { x: 0 }, max: { x: 4 } });
    expect(r.warnings.some((w) => w.includes("顛倒"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("「扁」的體積是 0"))).toBe(true);
  });
  it("cylinder 的 from、to 顛倒就對調；半徑不是正數就刪掉", () => {
    const cyl = { shape: "cylinder", op: "add", color: "Red", label: "柱", mirror: "none", axis: "z",
      center: { x: 5, y: 5, z: 0 }, from: 4, to: 0, radius: 2, radiusEnd: 2 };
    const r = norm(spec([cyl, { ...cyl, label: "壞柱", radius: -1, radiusEnd: 0 }]));
    expect(r.spec.shapes).toHaveLength(1);
    expect(r.spec.shapes[0]).toMatchObject({ from: 0, to: 4 });
    // 半徑跟著對調：原本 from=4 那端的半徑變成新的 radius
    const cone = norm(spec([{ ...cyl, radius: 1, radiusEnd: 3 }])).spec.shapes[0];
    expect(cone).toMatchObject({ from: 0, to: 4, radius: 3, radiusEnd: 1 });
    expect(r.warnings.some((w) => w.includes("「壞柱」的半徑不是正數"))).toBe(true);
  });
  it("radiusEnd = 0 的圓錐要保留，負的半徑 clamp 成 0", () => {
    const cone = { shape: "cylinder", op: "add", color: "Green", label: "樹冠", mirror: "none", axis: "z",
      center: { x: 5, y: 5, z: 0 }, from: 2, to: 6, radius: 3, radiusEnd: -1 };
    const r = norm(spec([cone]));
    expect(r.spec.shapes).toHaveLength(1);
    expect(r.spec.shapes[0]).toMatchObject({ radius: 3, radiusEnd: 0 });
    expect(r.warnings.some((w) => w.includes("半徑是負數"))).toBe(true);
  });
  it("尺寸有小數要警告；標題的換行換成空白", () => {
    const r = norm(spec([box()], { x: 9.6, y: 10, z: 6 }, "第一行\n第二行"));
    expect(r.spec.size.x).toBe(10);
    expect(r.warnings.some((w) => w.includes("取整數"))).toBe(true);
    expect(r.spec.title).toBe("第一行 第二行");
  });
  it("曲面側面被切掉超過 1 格要警告，底部被地面切掉不警告", () => {
    const ball = (cx: number, cz: number) => ({ shape: "ellipsoid", op: "add", color: "Red", label: "球", mirror: "none",
      center: { x: cx, y: 5, z: cz }, radius: { x: 3, y: 3, z: 3 } });
    expect(norm(spec([ball(0, 3)])).warnings.some((w) => w.includes("超出"))).toBe(true);
    expect(norm(spec([ball(5, 1)])).warnings).toEqual([]);
  });
  it("ellipsoid 半徑不是正數就刪掉", () => {
    const e = { shape: "ellipsoid", op: "add", color: "Red", label: "球", mirror: "none",
      center: { x: 5, y: 5, z: 3 }, radius: { x: 2, y: 0, z: 2 } };
    const r = norm(spec([box(), e]));
    expect(r.spec.shapes).toHaveLength(1);
  });
  it("cells 超過 64 截斷、小數取整數", () => {
    const cells = Array.from({ length: 70 }, (_, i) => ({ x: (i % 10) + 0.7, y: 1, z: 1 }));
    const r = norm(spec([box(), { shape: "cells", op: "add", color: "Black", label: "點", mirror: "none", cells }]));
    const c = r.spec.shapes[1];
    expect(c.shape === "cells" && c.cells).toHaveLength(64);
    expect(c.shape === "cells" && c.cells[0]).toEqual({ x: 0, y: 1, z: 1 });
    expect(r.warnings.some((w) => w.includes("超過 64"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("小數"))).toBe(true);
  });
  it("超出宣告的 size 但還在尺寸上限內：範圍撐大、不刪也不警告；超過尺寸上限的才刪或切掉", () => {
    const r = norm(spec([box(), box({ label: "外", min: { x: 50, y: 0, z: 0 }, max: { x: 52, y: 2, z: 1 } }),
      box({ label: "半", min: { x: 8, y: 0, z: 0 }, max: { x: 14, y: 2, z: 1 } })]));
    expect(r.spec.shapes.map((s) => s.label)).toEqual(["底座", "半"]);
    expect(r.spec.size.x).toBe(20); // 撐到「中」的上限
    expect(r.warnings.some((w) => w.includes("「外」完全在模型範圍外"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("「半」"))).toBe(false);
    const grow = norm(spec([box(), box({ label: "高", min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 9 } })]));
    expect(grow.spec.size).toEqual({ x: 10, y: 10, z: 9 });
    expect(grow.warnings).toEqual([]);
  });
  it("空白 label 補上編號", () => {
    const r = norm(spec([box({ label: "  " })]));
    expect(r.spec.shapes[0].label).toBe("形狀 1");
  });
});

describe("尺寸", () => {
  it("小、中、大、不限；不限的格子上限是 48 × 48 × 40", () => {
    expect(SIZE_TIERS).toEqual(["S", "M", "L", "XL"]);
    const big: ModelSpec = { version: 1, title: "t", summary: "", size: { x: 99, y: 99, z: 99 }, shapes: [{ shape: "box", op: "add", color: "Red", label: "a", mirror: "none", min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } }] };
    expect(normalizeSpec(big, "XL").spec.size).toEqual({ x: 48, y: 48, z: 40 });
    expect(normalizeSpec(big, "L").spec.size).toEqual({ x: 32, y: 32, z: 24 });
  });

  it("形狀數上限跟著尺寸：中 80 個、大 120 個", () => {
    const many: ModelSpec = { version: 1, title: "t", summary: "", size: { x: 20, y: 20, z: 10 },
      shapes: Array.from({ length: 100 }, (_, i) => ({ shape: "box" as const, op: "add" as const, color: "Red", label: `塊${i}`, mirror: "none" as const, min: { x: i % 20, y: 0, z: 0 }, max: { x: (i % 20) + 1, y: 1, z: 1 } })) };
    const m = normalizeSpec(many, "M");
    expect(m.spec.shapes).toHaveLength(80);
    expect(m.warnings).toContain("形狀超過 80 個，後面 20 個已刪掉");
    expect(normalizeSpec(many, "L").spec.shapes).toHaveLength(100);
  });

  it("isSizeTier 只認得這四個", () => {
    expect(["S", "M", "L", "XL"].every(isSizeTier)).toBe(true);
    expect(["xl", "toString", "", null, 3].some(isSizeTier)).toBe(false);
  });
});

describe("shapeBounds", () => {
  it("ellipsoid 的 z 範圍用半徑除以 1.2", () => {
    const b = shapeBounds({ shape: "ellipsoid", op: "add", color: "Red", label: "球", mirror: "none",
      center: { x: 5, y: 5, z: 3 }, radius: { x: 3, y: 3, z: 3 } }, { x: 10, y: 10, z: 10 });
    expect(b).toEqual({ lo: { x: 2, y: 2, z: 0 }, hi: { x: 8, y: 8, z: 6 } });
  });
});

describe("toApiSchema", () => {
  const schema = toApiSchema();
  const text = JSON.stringify(schema);

  it("沒有 structured outputs 不支援的關鍵字", () => {
    for (const k of ["$schema", "oneOf", "prefixItems", "maxItems", "minimum", "maximum", "exclusiveMinimum",
      "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern"]) {
      expect(text, k).not.toContain(`"${k}"`);
    }
    for (const m of text.matchAll(/"minItems":(\d+)/g)) expect(["0", "1"]).toContain(m[1]);
  });

  it("每個 object 都有 additionalProperties: false，所有 property 都 required，顏色是 enum", () => {
    let objects = 0, enums = 0;
    const walk = (n: unknown) => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      if (o.type === "object") {
        objects++;
        expect(o.additionalProperties).toBe(false);
        const props = Object.keys((o.properties ?? {}) as object).sort();
        expect([...((o.required as string[]) ?? [])].sort()).toEqual(props);
      }
      if (Array.isArray(o.enum) && (o.enum as string[]).includes("Dark Bluish Gray")) enums++;
      Object.values(o).forEach(walk);
    };
    walk(schema);
    expect(objects).toBeGreaterThan(5);
    expect(enums).toBeGreaterThan(0);
    expect(text).toContain('"anyOf"');
  });
});
