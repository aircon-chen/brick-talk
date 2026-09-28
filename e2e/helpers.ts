import type { Locator, Page } from "@playwright/test";

/** 元素截圖裡「跟左上角背景色差很多」的像素比例（SUPERPROMPT.md 13.4）。 */
export async function nonBackgroundRatio(page: Page, target: Locator): Promise<{ ratio: number; png: Buffer }> {
  const png = await target.screenshot();
  const ratio = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const [br, bg, bb] = [d[0], d[1], d[2]];
    let diff = 0;
    for (let i = 0; i < d.length; i += 4)
      if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bg) + Math.abs(d[i + 2] - bb) > 60) diff++;
    return diff / (d.length / 4);
  }, png.toString("base64"));
  return { ratio, png };
}
