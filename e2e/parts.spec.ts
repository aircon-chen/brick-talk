import { existsSync } from "node:fs";
import { test, expect } from "@playwright/test";

// 零件目錄資料庫是本機產生的（約 30 MB，不在版控裡），沒有就略過
test.skip(!existsSync("data/catalog/lego_catalog.sqlite"), "沒有 data/catalog/lego_catalog.sqlite，產生方式見 data/catalog/README.md");

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? route.continue() : route.abort();
  });
});
test("零件列表、搜尋、詳細顏色與 Element ID", async ({ page }) => {
  await page.goto("/parts");
  await expect(page.getByTestId("part-card")).toHaveCount(60);
  await page.getByRole("textbox", { name: "名稱或零件編號" }).fill("wheel");
  await page.getByRole("button", { name: "搜尋", exact: true }).click();
  const wheel = page.getByTestId("part-card").filter({ has: page.getByText("4624", { exact: true }) });
  await expect(wheel).toBeVisible();
  await wheel.click();
  await expect(page.getByRole("heading", { name: "Wheel 8 x 6", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "零件顏色表" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Element ID" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "4114681", exact: true })).toBeVisible();
  await expect(page.getByText("63.8", { exact: false })).toHaveCount(0);
});
test("390px 手機列表與詳細頁不超出畫面", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/parts", "/parts/4624", "/parts/3001"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
