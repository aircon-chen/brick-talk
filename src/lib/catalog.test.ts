import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DB_PATH, designerPartNums, getPart, listParts } from "./catalog";

// 零件目錄資料庫是本機產生的（約 30 MB，不在版控裡），沒有就略過
describe.skipIf(!existsSync(DB_PATH))("零件目錄", () => {
  it("wheel 搜尋找得到 4624，且不分大小寫", () => {
    const result = listParts({ q: "WHEEL" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.parts.map((p) => p.part_num)).toContain("4624");
  });
  it("分類 29 共 425 筆", () => {
    const result = listParts({ category: 29 });
    expect(result.ok && result.data.total).toBe(425);
  });
  it("每頁 60 筆，第二頁不重複", () => {
    const first = listParts();
    const second = listParts({ page: 2 });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.data.parts).toHaveLength(60);
      expect(second.data.parts).toHaveLength(60);
      const nums = new Set(first.data.parts.map((p) => p.part_num));
      expect(second.data.parts.some((p) => nums.has(p.part_num))).toBe(false);
      expect(first.data.parts[59].num_sets).toBeGreaterThanOrEqual(second.data.parts[0].num_sets);
    }
  });
  it("other 不回傳誤解析的尺寸", () => {
    const result = getPart("4624");
    expect(result.ok && result.data?.dimensions).toBeNull();
    if (result.ok) expect(result.data).not.toHaveProperty("width_mm");
  });
  it("正常磚塊有尺寸、色碼與購買編號", () => {
    const result = getPart("3001");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data?.dimensions?.studs_w).toBe(2);
      expect(result.data?.colors.find((c) => c.name === "Red")?.element_ids).toContain("300121");
      expect(result.data?.colors[0].rgb).toMatch(/^[0-9A-Fa-f]{6}$/);
    }
    expect(designerPartNums().has("3001")).toBe(true);
  });
  it("不存在的零件回傳 null，SQL 字串與萬用字元不擴大搜尋", () => {
    expect(getPart("does-not-exist")).toEqual({ ok: true, data: null });
    for (const q of ["' OR 1=1 --", "%", "_"]) {
      const result = listParts({ q });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.parts.every((p) => p.name.includes(q) || p.part_num.startsWith(q))).toBe(true);
    }
  });
  it("近期篩選與分頁參數有效", () => {
    const result = listParts({ recent: true, page: -5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.page).toBe(1);
      expect(result.data.parts.every((p) => p.y2 !== null && p.y2 >= 2024)).toBe(true);
    }
  });
});

describe("零件目錄不存在", () => {
  it("不存在的 DB 回傳可辨識錯誤", () => {
    for (const result of [listParts({}, "/missing-catalog.sqlite"), getPart("4624", "/missing-catalog.sqlite")]) {
      expect(result).toMatchObject({ ok: false, error: "missing_catalog" });
    }
  });
});
