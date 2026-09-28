import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { nonBackgroundRatio } from "./helpers";

const KEYS = ["house", "duck", "car", "tree", "robot"];

for (const key of KEYS) {
  test(`${key}：3D 有畫出東西，截圖存檔`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(`/build/demo-${key}`);
    const total = Number((await page.getByTestId("stats").getByText(/ 塊$/).first().textContent())?.replace(/\D/g, ""));
    await expect.poll(() => page.evaluate(() => window.__legoStats?.bricksRendered)).toBe(total);
    const viewer = page.getByTestId("viewer");
    const { ratio, png } = await nonBackgroundRatio(page, viewer);
    mkdirSync("artifacts/screenshots", { recursive: true });
    writeFileSync(`artifacts/screenshots/m6-${key}.png`, png);
    expect(ratio).toBeGreaterThanOrEqual(0.05);
  });
}

test("步驟滑桿拉到 1 只顯示第一步的磚", async ({ page }) => {
  await page.goto("/build/demo-house");
  const total = Number((await page.getByTestId("stats").getByText(/ 塊$/).first().textContent())?.replace(/\D/g, ""));
  await expect.poll(() => page.evaluate(() => window.__legoStats?.bricksRendered)).toBe(total);
  const viewer = page.getByTestId("viewer");
  const full = await nonBackgroundRatio(page, viewer);
  await page.getByTestId("step-slider").fill("1");
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBe(1);
  const first = await page.evaluate(() => window.__legoStats?.bricksRendered ?? 0);
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(total);
  const one = await nonBackgroundRatio(page, viewer);
  writeFileSync("artifacts/screenshots/m6-house-step1.png", one.png);
  expect(one.ratio).toBeLessThan(full.ratio);
});
