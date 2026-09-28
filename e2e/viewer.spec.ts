import { expect, test } from "@playwright/test";

test("首頁點房子，3D 預覽畫出全部的磚", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("demo-house").click();
  await expect(page).toHaveURL(/\/build\/demo-house$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("紅屋頂小房子");
  const total = Number((await page.getByTestId("stats").getByText(/ 塊$/).first().textContent())?.replace(/\D/g, ""));
  expect(total).toBeGreaterThan(50);
  await expect(page.locator("[data-testid=viewer] canvas")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__legoStats?.bricksRendered)).toBe(total);
});

test("找不到的模型顯示提示", async ({ page }) => {
  await page.goto("/build/b-notexist");
  await expect(page.getByRole("heading", { name: "找不到這個模型" })).toBeVisible();
});
