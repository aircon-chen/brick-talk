// VoxelGrid → 逐層文字俯視圖，除錯與示範模型目視用。
import { CORE_COLORS, getColor } from "./palette";
import type { VoxelGrid } from "./voxelize";

/** 每個 core 色一個好認的字元。不在表上的顏色印成「?」。 */
const CHAR_BY_NAME: Record<string, string> = {
  Black: "K", "Dark Bluish Gray": "D", Blue: "B", Red: "R", White: "W", Tan: "t", "Light Bluish Gray": "L",
  "Dark Blue": "N", Green: "G", "Reddish Brown": "M", Yellow: "Y", Lime: "I", "Medium Azure": "A",
  "Bright Light Orange": "O", "Dark Red": "r", "Dark Orange": "Q", Orange: "o", "Medium Nougat": "n",
  "Dark Azure": "a", "Dark Turquoise": "T", "Dark Tan": "d", "Bright Pink": "P",
};

function buildLegend(): Map<number, string> {
  return new Map(CORE_COLORS.map((c) => [c.rebrickable_id, CHAR_BY_NAME[c.name] ?? "?"]));
}

const LEGEND = buildLegend();

export function colorChar(colorId: number): string {
  return colorId === -1 ? "." : (LEGEND.get(colorId) ?? "?");
}

/** 由下往上一層一層印。每層最上面一列是後排（y 最大），最下面一列是正面（y = 0）。 */
export function renderLayers(grid: VoxelGrid, title = ""): string {
  const [W, D, H] = grid.size;
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  lines.push(`# 尺寸 ${W}×${D}×${H}（x 向右、y 向後、z 向上；每層最下面一列是正面）`);
  const present = new Set<number>();
  for (const v of grid.cells) if (v !== -1) present.add(v);
  lines.push(`# 圖例：${[...present].map((id) => `${colorChar(id)}=${getColor(id).name_zh ?? getColor(id).name}`).join("  ")}  .=空`);
  for (let z = 0; z < H; z++) {
    lines.push("", `z=${z}`);
    for (let y = D - 1; y >= 0; y--) {
      let row = "";
      for (let x = 0; x < W; x++) row += colorChar(grid.cells[x + W * (y + D * z)]);
      lines.push(row);
    }
  }
  return lines.join("\n") + "\n";
}
