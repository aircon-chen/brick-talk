// Brick[] → BomRow[] 與三種匯出（SUPERPROMPT.md 7.9）。
import type { Brick } from "./legolize";
import { getColor, getPart, elementIdsOf, type PartKind } from "./palette";
import { unitPriceTwd } from "./price";

export type BomRow = {
  partNum: string;
  bricklinkPartId: string;
  partName: string;
  partNameZh: string;
  colorId: number;
  colorName: string;
  colorNameZh: string;
  legoColorName: string;
  rgb: string;
  /** core 色一定有值；對不上時是 -1 */
  bricklinkColorId: number;
  /** core 色一定有值；對不上時是 -1 */
  ldrawColor: number;
  /** 依數值由大到小 */
  elementIds: string[];
  primaryElementId: string;
  qty: number;
  /** 估計單價（新台幣），見 price.ts */
  unitPriceTwd: number;
};

const KIND_ORDER: Record<PartKind, number> = {
  brick: 0, plate: 1, tile: 2, slope45: 3, slope45_inv: 4, round: 5, cone: 6, wheel_holder: 7, wheel: 8, tyre: 9,
};
const KIND_ZH: Record<PartKind, string> = {
  brick: "磚", plate: "薄板", tile: "平滑板", slope45: "45 度斜面磚", slope45_inv: "45 度倒斜面磚",
  round: "圓磚", cone: "錐體", wheel_holder: "輪軸座", wheel: "輪框", tyre: "輪胎",
};

/** 例如「磚 2x4」。尺寸照英文名稱的順序；比一層高的加上高度，輪框、輪胎用 mm。 */
export function partNameZh(partNum: string): string {
  const p = getPart(partNum);
  if (p.kind === "wheel") return `${KIND_ZH.wheel} 11x12 mm`;
  if (p.kind === "tyre") return `${KIND_ZH.tyre} 21x12 mm`;
  const tall = p.height_plates > 3 ? `x${p.height_plates / 3}` : "";
  return `${KIND_ZH[p.kind]} ${p.studs_w}x${p.studs_l}${tall}`;
}

/** 例如「綠色（LEGO：Dark Green）」。 */
export function colorLabel(colorId: number): string {
  const c = getColor(colorId);
  const zh = c.name_zh ?? c.name;
  return c.lego_color_name ? `${zh}（LEGO：${c.lego_color_name}）` : zh;
}

/** 數值最大的 element ID。一定要用數字比：palette 裡 5、6、7 碼混在一起，字串比會選錯。 */
export function sortElementIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => Number(b) - Number(a));
}

export function buildBom(bricks: Brick[]): BomRow[] {
  const qty = new Map<string, number>();
  for (const b of bricks) {
    const key = `${b.partNum}|${b.colorId}`;
    qty.set(key, (qty.get(key) ?? 0) + 1);
  }
  const rows: BomRow[] = [...qty].map(([key, n]) => {
    const [partNum, c] = key.split("|");
    const colorId = Number(c);
    const part = getPart(partNum);
    const color = getColor(colorId);
    const elementIds = sortElementIds(elementIdsOf(partNum, colorId));
    return {
      partNum,
      bricklinkPartId: part.bricklink_part_id,
      partName: part.name,
      partNameZh: partNameZh(partNum),
      colorId,
      colorName: color.name,
      colorNameZh: color.name_zh ?? color.name,
      legoColorName: color.lego_color_name ?? "",
      rgb: color.rgb,
      bricklinkColorId: color.bricklink_id ?? -1,
      ldrawColor: color.ldraw_code ?? -1,
      elementIds,
      primaryElementId: elementIds[0] ?? "",
      qty: n,
      unitPriceTwd: unitPriceTwd(partNum),
    };
  });
  const area = (r: BomRow) => {
    const p = getPart(r.partNum);
    return p.studs_w * p.studs_l;
  };
  return rows.sort((a, b) =>
    KIND_ORDER[getPart(a.partNum).kind] - KIND_ORDER[getPart(b.partNum).kind] ||
    area(b) - area(a) ||
    a.colorName.localeCompare(b.colorName) ||
    a.partNum.localeCompare(b.partNum));
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 給人看的零件清單。UTF-8 加 BOM，Excel 開才不會亂碼。 */
export function toBomCsv(rows: BomRow[]): string {
  const header = ["零件", "零件編號", "顏色", "LEGO 色名", "數量", "Element ID", "其他 Element ID", "BrickLink 零件編號", "BrickLink 色號", "估計單價（新台幣）", "估計小計（新台幣）"];
  const lines = rows.map((r) => [
    r.partNameZh, r.partNum, r.colorNameZh, r.legoColorName, r.qty, r.primaryElementId,
    r.elementIds.slice(1).join(" / "), r.bricklinkPartId, r.bricklinkColorId, r.unitPriceTwd, Math.round(r.unitPriceTwd * r.qty),
  ].map(csvCell).join(","));
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}

/** LEGO Pick a Brick 批次上傳格式：elementId,quantity。一次最多 400 種。 */
export function toPickABrickCsv(rows: BomRow[]): { text: string; warnings: string[] } {
  const warnings = rows.length > 400 ? [`零件有 ${rows.length} 種，Pick a Brick 一次最多上傳 400 種，要分批`] : [];
  const lines = rows.filter((r) => r.primaryElementId).map((r) => `${r.primaryElementId},${r.qty}`);
  return { text: ["elementId,quantity", ...lines].join("\n") + "\n", warnings };
}

/** BrickLink Wanted List XML。不能有 <?xml ?> 宣告行，否則上傳會失敗。 */
export function toBrickLinkXml(rows: BomRow[]): string {
  const items = rows
    .filter((r) => r.bricklinkColorId >= 0)
    .map((r) =>
      `<ITEM><ITEMTYPE>P</ITEMTYPE><ITEMID>${r.bricklinkPartId}</ITEMID><COLOR>${r.bricklinkColorId}</COLOR><MINQTY>${r.qty}</MINQTY><CONDITION>N</CONDITION></ITEM>`);
  return ["<INVENTORY>", ...items, "</INVENTORY>"].join("\n") + "\n";
}
