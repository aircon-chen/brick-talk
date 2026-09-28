import { expect, test } from "@playwright/test";

test("播放、暫停、速度與手動跳步", async ({ page }) => {
  await page.goto("/build/demo-house");
  await expect(page.locator("[data-testid=viewer] canvas")).toBeVisible();
  await page.getByRole("button", { name: "回到開頭", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBeGreaterThan(1);
  await page.getByRole("button", { name: "暫停", exact: true }).click();
  const paused = await page.evaluate(() => window.__legoStats?.step);
  await page.waitForTimeout(1100);
  expect(await page.evaluate(() => window.__legoStats?.step)).toBe(paused);

  const durations: number[] = [];
  for (const speed of ["1", "4"]) {
    await page.getByRole("button", { name: "回到開頭", exact: true }).click();
    await page.getByLabel("播放速度").selectOption(speed);
    const start = Date.now();
    await page.getByRole("button", { name: "播放", exact: true }).click();
    await page.waitForFunction(() => (window.__legoStats?.step ?? 0) >= 4);
    durations.push(Date.now() - start);
    await page.getByRole("button", { name: "暫停", exact: true }).click();
  }
  expect(durations[1]).toBeLessThan(durations[0] * 0.65);
  await page.getByTestId("step-slider").fill("2");
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBe(2);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__legoStats?.step)).toBe(2);
  const last = Number(await page.getByTestId("step-slider").getAttribute("max"));
  await page.getByTestId("step-slider").fill(String(last - 1));
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBe(last);
  await expect(page.getByRole("button", { name: "播放", exact: true })).toBeVisible();
});

test("動畫說明書零件、換步、重播、鍵盤與手機寬度", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/build/demo-house");
  await page.getByRole("tab", { name: "動畫說明書", exact: true }).click();
  await expect(page.getByRole("heading", { name: "第 1 步", exact: true })).toBeVisible();
  await expect(page.getByTestId("animation-parts").locator("li").first()).toContainText(/× \d+/);
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBe(1);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByRole("heading", { name: "第 2 步", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBe(2);
  await page.getByRole("button", { name: "再播一次", exact: true }).click();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("heading", { name: "第 1 步", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("tab", { name: "3D 預覽", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("減少動態效果仍可逐步播放", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/build/demo-house");
  await page.getByRole("button", { name: "回到開頭", exact: true }).click();
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__legoStats?.step)).toBeGreaterThan(1);
});
