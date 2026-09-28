import { describe, expect, it } from "vitest";
import { buildBom, colorLabel, sortElementIds, toBomCsv, toBrickLinkXml, toPickABrickCsv } from "./bom";
import type { Brick } from "./legolize";
import { ldrawLine, toLdraw } from "./ldraw";

const brick = (id: number, partNum: string, colorId: number, x = 0, y = 0, z = 0, w = 4, d = 2): Brick =>
  ({ id, partNum, colorId, x, y, z, w, d });

describe("buildBom", () => {
  const bricks = [
    brick(0, "3001", 4), brick(1, "3001", 4, 4), brick(2, "3005", 4, 0, 0, 1, 1, 1),
    brick(3, "3001", 0, 0, 2), brick(4, "3070b", 15, 0, 0, 2, 1, 1),
  ];
  const rows = buildBom(bricks);

  it("依零件加顏色分組，數量加總等於磚數", () => {
    expect(rows.reduce((a, r) => a + r.qty, 0)).toBe(bricks.length);
    expect(rows.find((r) => r.partNum === "3001" && r.colorId === 4)?.qty).toBe(2);
  });

  it("排序：kind → 面積大到小 → 色名", () => {
    expect(rows.map((r) => `${r.partNum}|${r.colorName}`)).toEqual(["3001|Black", "3001|Red", "3005|Red", "3070b|White"]);
  });

  it("中文名、色號對照、BrickLink 編號", () => {
    const red = rows.find((r) => r.partNum === "3001" && r.colorId === 4)!;
    expect(red).toMatchObject({ partNameZh: "磚 2x4", colorNameZh: "紅色", legoColorName: "Bright Red", bricklinkColorId: 5, ldrawColor: 4, primaryElementId: "300121" });
    expect(rows.find((r) => r.partNum === "3070b")?.bricklinkPartId).toBe("3070");
    expect(colorLabel(2)).toBe("綠色（LEGO：Dark Green）");
  });

  it("同 kind、同面積時照色名排", () => {
    const r = buildBom([brick(0, "3003", 4, 0, 0, 0, 2, 2), brick(1, "3010", 0, 2, 0, 0, 4, 1)]);
    expect(r.map((x) => `${x.partNum}|${x.colorName}`)).toEqual(["3010|Black", "3003|Red"]);
  });

  it("primaryElementId 用數值比，不是字串比", () => {
    expect(sortElementIds(["99999", "300121", "6552094"])).toEqual(["6552094", "300121", "99999"]);
  });
});

describe("匯出", () => {
  const rows = buildBom([brick(0, "3001", 4), brick(1, "3001", 4, 4), brick(2, "3070b", 15, 0, 0, 1, 1, 1)]);

  it("BOM CSV 有 UTF-8 BOM 與中文標題", () => {
    const csv = toBomCsv(rows);
    expect(csv.startsWith("﻿零件,零件編號,顏色")).toBe(true);
    expect(csv).toContain("磚 2x4,3001,紅色,Bright Red,2,300121");
  });

  it("Pick a Brick CSV 第一行是 elementId,quantity", () => {
    const { text, warnings } = toPickABrickCsv(rows);
    expect(text.split("\n")[0]).toBe("elementId,quantity");
    expect(text).toContain("300121,2");
    expect(warnings).toEqual([]);
  });

  it("BrickLink XML 沒有宣告行，用 BrickLink 零件編號與色號", () => {
    const xml = toBrickLinkXml(rows);
    expect(xml).not.toContain("<?xml");
    expect(xml.startsWith("<INVENTORY>")).toBe(true);
    expect(xml).toContain("<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>3001</ITEMID><COLOR>5</COLOR><MINQTY>2</MINQTY><CONDITION>N</CONDITION></ITEM>");
    expect(xml).toContain("<ITEMID>3070</ITEMID><COLOR>1</COLOR>");
  });
});

describe("LDraw", () => {
  it("紅色 3001 放在原點沿 x（w=4、d=2）", () => {
    expect(ldrawLine(brick(0, "3001", 4, 0, 0, 0, 4, 2))).toBe("1 4 40 -24 20 1 0 0 0 1 0 0 0 1 3001.dat");
  });
  it("同一塊沿 y 放（w=2、d=4）", () => {
    expect(ldrawLine(brick(0, "3001", 4, 0, 0, 0, 2, 4))).toBe("1 4 20 -24 40 0 0 1 0 1 0 -1 0 0 3001.dat");
  });
  it("標題的換行不會變成 LDraw 指令", () => {
    const { text } = toLdraw("模型\n0 STEP", [brick(0, "3001", 4)], [{ index: 1, hanging: false, brickIds: [0], parts: [] }]);
    expect(text.split("\r\n").filter((l) => l === "0 STEP")).toHaveLength(1);
  });
  it("每一步後面接 0 STEP", () => {
    // z 是 plate：第二塊疊在第一塊上面，z = 3
    const bricks = [brick(0, "3001", 4), brick(1, "3001", 4, 0, 0, 3)];
    const { text } = toLdraw("測試", bricks, [
      { index: 1, hanging: false, brickIds: [0], parts: [] },
      { index: 2, hanging: false, brickIds: [1], parts: [] },
    ]);
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("0 測試");
    expect(lines.filter((l) => l === "0 STEP")).toHaveLength(2);
    expect(lines[5]).toBe("1 4 40 -48 20 1 0 0 0 1 0 0 0 1 3001.dat");
  });
});
