// Brick[] + Step[] → LDraw .ldr 文字（SUPERPROMPT.md 7.6）。LDraw 是 -Y 朝上，單位 LDU（1 stud = 20、1 brick 高 = 24）。
import type { Brick, Dir } from "./legolize";
import { getColor, getPart } from "./palette";
import type { Step } from "./steps";

const IDENTITY = "1 0 0 0 1 0 0 0 1";
/** 繞 Y 轉 90 度：零件原生的 X 方向轉到世界的 -Z 方向 */
const ROT_Y90 = "0 0 1 0 1 0 -1 0 0";
/** 繞 Y 轉：把零件原生的 -Z 方向轉到 dir（斜面原生往 -Z 下坡，也就是格子的 -y） */
const TO_DIR: Record<Dir, string> = {
  "-y": IDENTITY,
  "+y": "-1 0 0 0 1 0 0 0 -1",
  "+x": "0 0 -1 0 1 0 1 0 0",
  "-x": ROT_Y90,
};
/** 輪框、輪胎原生的 +Z 朝向輪軸座。dir 是在輪軸座的哪一側，要把 +Z 轉成朝向 -dir */
const WHEEL_ROT: Record<Dir, string> = {
  "+x": "0 0 -1 0 1 0 1 0 0",
  "-x": ROT_Y90,
  "+y": "-1 0 0 0 1 0 0 0 -1",
  "-y": IDENTITY,
};
/** 輪框原點離輪軸座中心 28 LDU、輪胎 34 LDU；輪軸在輪軸座頂面下方 5 LDU（由 LDraw 幾何推算） */
const RIM_OFFSET = 28, TYRE_OFFSET = 34, AXLE_DROP = 5;

/**
 * 一塊磚的 LDraw line type 1。LDraw 是 -Y 朝上；零件原點在頂面中心（斜面在有 stud 那一排的中心）。
 * 格子 x → X，y → Z，每 stud 20 LDU；z 的單位是 plate，一格 8 LDU。
 */
export function ldrawLine(b: Brick): string | null {
  const code = getColor(b.colorId).ldraw_code;
  if (code === null) return null;
  const part = getPart(b.partNum);
  const file = part.ldraw_file;
  const top = -(b.z + part.height_plates) * 8;
  let X = (b.x + b.w / 2) * 20, Z = (b.y + b.d / 2) * 20, Y = top;
  let matrix = IDENTITY;

  if ((part.kind === "slope45" || part.kind === "slope45_inv") && b.dir) {
    // 原點在後排（有 stud 那排）的中心，前排是下坡那一側
    if (b.dir === "-y") Z = (b.y + 1.5) * 20;
    else if (b.dir === "+y") Z = (b.y + 0.5) * 20;
    else if (b.dir === "-x") X = (b.x + 1.5) * 20;
    else X = (b.x + 0.5) * 20;
    matrix = TO_DIR[b.dir];
  } else if (part.kind === "wheel_holder") {
    Y = -(b.z + 1) * 8;
    matrix = b.dir === "+y" ? ROT_Y90 : IDENTITY;
  } else if ((part.kind === "wheel" || part.kind === "tyre") && b.dir) {
    const off = part.kind === "wheel" ? RIM_OFFSET : TYRE_OFFSET;
    const s = b.dir[0] === "+" ? 1 : -1;
    Y = -(b.z + 1) * 8 + AXLE_DROP;
    if (b.dir[1] === "x") X += s * off;
    else Z += s * off;
    matrix = WHEEL_ROT[b.dir];
  } else if (part.kind === "brick" || part.kind === "plate" || part.kind === "tile") {
    matrix = b.w === part.ldraw.studs_x ? IDENTITY : ROT_Y90;
  }
  return `1 ${code} ${round(X)} ${round(Y)} ${round(Z)} ${matrix} ${file}`;
}

const round = (v: number) => Math.round(v * 100) / 100;

export function toLdraw(title: string, bricks: Brick[], steps: Step[]): { text: string; warnings: string[] } {
  // 標題只能占一行，不然換行後面的字會被當成 LDraw 指令
  const lines = [`0 ${title.replace(/[\r\n]+/g, " ")}`, "0 Name: model.ldr", "0 Author: Brick Talk"];
  let skipped = 0;
  for (const step of steps) {
    for (const id of step.brickIds) {
      const line = ldrawLine(bricks[id]);
      if (line) lines.push(line);
      else skipped++;
    }
    lines.push("0 STEP");
  }
  const warnings = skipped ? [`有 ${skipped} 塊磚的顏色沒有 LDraw 色碼，沒有匯出`] : [];
  return { text: lines.join("\r\n") + "\r\n", warnings };
}
