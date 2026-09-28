import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

async function openBom(page: Page) {
  await page.goto("/build/demo-house");
  await page.getByRole("tab", { name: "零件清單" }).click();
  await expect(page.getByTestId("bom")).toBeVisible();
}

async function downloadText(page: Page, testId: string) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
  return { name: dl.suggestedFilename(), text: readFileSync((await dl.path())!, "utf8") };
}

test("零件清單：表格與三種下載格式", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await openBom(page);
  const rows = page.getByTestId("bom-row");
  expect(await rows.count()).toBeGreaterThan(5);
  await expect(page.getByTestId("how-to-buy")).toContainText("還沒實測");

  const bom = await downloadText(page, "dl-bom");
  expect(bom.name).toBe("bom.csv");
  expect(bom.text.startsWith("﻿零件,零件編號,顏色")).toBe(true);

  const pab = await downloadText(page, "dl-pab");
  expect(pab.text.split("\n")[0]).toBe("elementId,quantity");
  expect(pab.text.trim().split("\n").length - 1).toBe(await rows.count());

  const xml = await downloadText(page, "dl-bricklink");
  expect(xml.text).not.toContain("<?xml");
  expect(xml.text.startsWith("<INVENTORY>")).toBe(true);
  expect(xml.text).toMatch(/<ITEM><ITEMTYPE>P<\/ITEMTYPE><ITEMID>\d+<\/ITEMID><COLOR>\d+<\/COLOR><MINQTY>\d+<\/MINQTY><CONDITION>N<\/CONDITION><\/ITEM>/);

  const ldr = await downloadText(page, "dl-ldraw");
  expect(ldr.text).toContain("0 STEP");

  mkdirSync("artifacts/screenshots", { recursive: true });
  await expect(page.getByTestId("bom-table").locator("img").first()).toBeVisible();
  writeFileSync("artifacts/screenshots/m9-bom-desktop.png", await page.getByTestId("bom-table").screenshot());
});

test("零件清單在 390 px 手機寬度沒有橫向捲動", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBom(page);
  await expect(page.getByTestId("bom-cards")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  writeFileSync("artifacts/screenshots/m9-bom-mobile.png", await page.screenshot({ fullPage: false }));
});
