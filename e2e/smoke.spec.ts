import { expect, test } from "@playwright/test";

test("首頁可以打開，而且 WebGL 可用", async ({ page }) => {
  await page.goto("/");
  const hasWebgl2 = await page.evaluate(() => document.createElement("canvas").getContext("webgl2") !== null);
  expect(hasWebgl2).toBe(true);
});
