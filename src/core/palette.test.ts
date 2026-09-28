import { describe, expect, it } from "vitest";
import { brickSizesForColor, CORE_COLORS, elementIdsOf, findColorByName, getColor, hasCombo, PARTS } from "./palette";

describe("palette", () => {
  it("有 22 個 core 色、41 種基本零件、7 種特殊零件、15 種大片 plate", () => {
    expect(CORE_COLORS).toHaveLength(22);
    expect(PARTS).toHaveLength(63);
    expect(PARTS.slice(48).every((p) => p.kind === "plate" && p.bricklink_part_id === p.part_num)).toBe(true);
    expect(PARTS.slice(48).map((p) => `${p.studs_w}x${p.studs_l}`)).toContain("16x16");
    expect(PARTS.slice(41, 48).map((p) => `${p.part_num}:${p.kind}:${p.bricklink_part_id}`)).toEqual([
      "67687:wheel_holder:4600", "6014b:wheel:6014b", "87697:tyre:87697",
      "3062b:round:3062", "3941:round:3941", "59900:cone:4589b", "3942c:cone:3942c",
    ]);
    // LDraw 官方庫沒有 67687，用同模具的 4600
    expect(PARTS[41].ldraw_file).toBe("4600.dat");
  });

  it("core 色四套編號都有值", () => {
    for (const c of CORE_COLORS) {
      expect(c.bricklink_id, c.name).not.toBeNull();
      expect(c.ldraw_code, c.name).not.toBeNull();
      expect(c.lego_color_name, c.name).not.toBeNull();
    }
    expect(getColor(0)).toMatchObject({ name: "Black", bricklink_id: 11, ldraw_code: 0 });
  });

  it("色名查詢不分大小寫", () => {
    expect(findColorByName("  light BLUISH gray ")?.rebrickable_id).toBe(71);
    expect(findColorByName("不存在")).toBeUndefined();
  });

  it("每個 core 色都有近期生產的 1x1 磚", () => {
    for (const c of CORE_COLORS) expect(hasCombo("3005", c.rebrickable_id), c.name).toBe(true);
  });

  it("紅色 2x4 磚的 element ID 是 300121", () => {
    expect(elementIdsOf("3001", 4)).toContain("300121");
  });

  it("brick 尺寸順序跟參考實作一致：面積大到小，同面積照 palette 順序，長邊沿 x 先", () => {
    const red = brickSizesForColor(4).map((s) => `${s.partNum}:${s.w}x${s.d}`);
    expect(red.slice(0, 6)).toEqual(["3007:8x2", "3007:2x8", "2456:6x2", "2456:2x6", "3008:8x1", "3008:1x8"]);
    expect(red.at(-1)).toBe("3005:1x1");
    // Green 沒有近期生產的 2x8
    expect(brickSizesForColor(2).some((s) => s.partNum === "3007")).toBe(false);
  });
});
