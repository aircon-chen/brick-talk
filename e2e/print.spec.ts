import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const countPdfPages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

test("列印頁產生 A4 PDF，頁數符合公式", async ({ page }) => {
  await page.goto("/build/demo-house/print");
  const booklet = page.getByTestId("booklet");
  await expect(booklet).toHaveAttribute("data-ready", "true", { timeout: 240_000 });
  const expected = Number(await booklet.getAttribute("data-expected-pages"));
  // 房子 34 種零件（每頁 30 格，2 頁）、28 步；新零件 3 塊以內的連續兩步會排在同一頁，所以步驟頁在 14 到 28 頁之間
  expect(expected).toBeGreaterThanOrEqual(1 + 2 + 14 + 1);
  expect(expected).toBeLessThanOrEqual(1 + 2 + 28 + 1);
  await expect(page.locator(".booklet .page")).toHaveCount(expected);

  mkdirSync("artifacts/screenshots", { recursive: true });
  writeFileSync("artifacts/screenshots/m8-cover.png", await page.locator(".booklet .page").nth(0).screenshot());
  writeFileSync("artifacts/screenshots/m8-parts.png", await page.locator(".booklet .page").nth(1).screenshot());
  writeFileSync("artifacts/screenshots/m8-step.png", await page.locator(".booklet .page").nth(4).screenshot());

  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  writeFileSync("artifacts/booklet-house.pdf", pdf);
  expect(countPdfPages(pdf)).toBe(expected);

  // 頁數對不代表內容沒被裁掉：列印樣式下，每張零件卡片都要完整落在自己那一頁裡
  await page.emulateMedia({ media: "print" });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll(".booklet .page")].flatMap((p) => {
      const pb = p.getBoundingClientRect().bottom;
      return [...p.querySelectorAll("[data-testid=parts-card]")].filter((c) => c.getBoundingClientRect().bottom > pb + 0.5).length;
    }).reduce((a, n) => a + n, 0));
  expect(overflow).toBe(0);
});

test("只印零件清單", async ({ page }) => {
  await page.goto("/build/demo-house/print?only=parts");
  const booklet = page.getByTestId("booklet");
  await expect(booklet).toHaveAttribute("data-ready", "true", { timeout: 240_000 });
  const expected = Number(await booklet.getAttribute("data-expected-pages"));
  // 房子 34 種零件（屋頂 2 種斜面、底板 2 種大 plate），一頁 30 種
  expect(expected).toBe(Math.ceil(34 / 30));
  const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  writeFileSync("artifacts/booklet-house-parts.pdf", pdf);
  expect(countPdfPages(pdf)).toBe(expected);
});
