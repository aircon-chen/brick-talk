// 特殊零件：輪子組、圓磚、錐體。ModelSpec.parts 用 key 指定，這裡對到真實零件。
// 零件、顏色、BrickLink 編號的來源見 scripts/build_catalog.py 的 PALETTE_PARTS。

export const PART_KEYS = ["wheels", "round_1x1", "round_2x2", "cone_1x1", "cone_2x2"] as const;
export type PartKey = (typeof PART_KEYS)[number];

/** 占格子的特殊零件。closedTop：頂端不能再接東西。 */
export const CELL_PARTS: Record<Exclude<PartKey, "wheels">, { partNum: string; size: number; layers: number; closedTop: boolean; nameZh: string }> = {
  round_1x1: { partNum: "3062b", size: 1, layers: 1, closedTop: false, nameZh: "圓磚 1x1" },
  round_2x2: { partNum: "3941", size: 2, layers: 1, closedTop: false, nameZh: "圓磚 2x2" },
  cone_1x1: { partNum: "59900", size: 1, layers: 1, closedTop: true, nameZh: "錐體 1x1" },
  cone_2x2: { partNum: "3942c", size: 2, layers: 2, closedTop: true, nameZh: "錐體 2x2x2" },
};

/**
 * 輪子組：67687 輪軸座（2x2 plate，掛在車身底下）加 2 個 6014b 輪框、2 個 87697 輪胎。
 * 格子上：輪軸座占 z 層那 2x2 的最上面一個 plate；輪子沿輪軸往兩側各伸出 2 格，
 * 在 z 和 z+1 兩層、沿行進方向 4 格的範圍要空著（輪拱）。
 */
export const WHEELS = {
  holder: "67687",
  rim: "6014b",
  tyre: "87697",
  /** Rebrickable 色號：Black、Light Bluish Gray */
  holderColor: 0,
  tyreColor: 0,
  fallbackRimColor: 71,
  /** 輪子（輪框、輪胎）中心離輪軸座中心多遠，mm。由 LDraw 幾何推算：輪框 28 LDU、再往外 6 LDU 是中心 */
  wheelOffsetMm: 13.6,
  /** 輪軸在輪軸座頂面下方幾 mm（LDraw 4600.dat 的 wpin2 在 y = 5 LDU） */
  axleDropMm: 2,
} as const;

export type Axis = "x" | "y";

/** 輪子組要挖空的格子（相對 at 的位移），兩層都要。 */
export function wheelArchOffsets(axis: Axis): [number, number][] {
  const out: [number, number][] = [];
  for (const a of [-2, -1, 2, 3])
    for (let t = -1; t <= 2; t++) out.push(axis === "x" ? [a, t] : [t, a]);
  return out;
}
