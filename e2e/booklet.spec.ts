import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test("說明書分頁：產生步驟圖，縮圖比例一致", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto("/build/demo-house");
  await page.getByRole("tab", { name: "組裝說明書" }).click();
  await expect(page.getByTestId("booklet-preview")).toBeVisible({ timeout: 240_000 });
  const first = page.getByTestId("step-1");
  await expect(first.locator("img").last()).toBeVisible();
  mkdirSync("artifacts/screenshots", { recursive: true });
  writeFileSync("artifacts/screenshots/m7-step1.png", await first.screenshot());
  const five = page.getByTestId("step-5");
  await five.scrollIntoViewIfNeeded();
  writeFileSync("artifacts/screenshots/m7-step5.png", await five.screenshot());

  // 量縮圖裡非白色像素的寬度：同一個比例下，1x4 要比 1x2 寬
  const widths = await page.evaluate(async () => {
    const measure = async (alt: string) => {
      const img = [...document.querySelectorAll<HTMLImageElement>("[data-testid=callout] img")].find((i) => i.alt.startsWith(alt));
      if (!img) return -1;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let min = c.width, max = -1;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) { min = Math.min(min, x); max = Math.max(max, x); }
        }
      return max - min;
    };
    return { w12: await measure("磚 1x2"), w14: await measure("磚 1x4") };
  });
  expect(widths.w12).toBeGreaterThan(0);
  expect(widths.w14).toBeGreaterThan(widths.w12);
});
