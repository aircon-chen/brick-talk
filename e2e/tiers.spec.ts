import { expect, test } from "@playwright/test";

const price = (text: string) => Number(text.replace(/[^\d]/g, ""));

test("三個版本：預設平民版，點旗艦版後統計、零件清單、列印連結都換成旗艦版", async ({ page }) => {
  await page.goto("/build/demo-house");
  const cards = page.getByTestId("tier-card");
  await expect(cards).toHaveCount(3);
  await expect(page.locator("[data-tier=standard]")).toHaveAttribute("aria-pressed", "true");

  const prices = await Promise.all(["cheap", "standard", "flagship"].map(async (t) => price(await page.locator(`[data-tier=${t}] .text-lg`).innerText())));
  expect(prices[0]).toBeLessThan(prices[1]);
  expect(prices[1]).toBeLessThan(prices[2]);

  const statsBefore = await page.getByTestId("stats").innerText();
  await page.locator("[data-tier=flagship]").click();
  await expect(page.locator("[data-tier=flagship]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("stats")).not.toHaveText(statsBefore);
  await expect(page.getByTestId("stats")).toContainText(prices[2].toLocaleString());

  await page.getByRole("tab", { name: "組裝說明書" }).click();
  await expect(page.getByRole("link", { name: "列印／存成 PDF" })).toHaveAttribute("href", "/build/demo-house/print?tier=flagship");
});

test("先給預算：多一張「依預算」的卡片並預設選它，價格不超過預算", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("你想做什麼").fill("一棵樹");
  await page.getByTestId("budget-input").fill("400");
  await page.getByTestId("design-submit").click();
  const budgetCard = page.locator("[data-tier=budget]");
  await expect(budgetCard).toBeVisible();
  await expect(budgetCard).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("tier-card")).toHaveCount(4);
  expect(price(await budgetCard.locator(".text-lg").innerText())).toBeLessThanOrEqual(400);
});

test("列印頁可以指定版本：丐版的零件清單頁數照丐版的零件種類算", async ({ page }) => {
  await page.goto("/build/demo-house");
  const cheapTypes = await (async () => {
    await page.locator("[data-tier=cheap]").click();
    const t = await page.getByTestId("stats").innerText();
    return Number(/零件種類\s*(\d+)/.exec(t)![1]);
  })();
  await page.goto("/build/demo-house/print?only=parts&tier=cheap");
  const booklet = page.getByTestId("booklet");
  await expect(booklet).toHaveAttribute("data-ready", "true", { timeout: 240_000 });
  expect(Number(await booklet.getAttribute("data-expected-pages"))).toBe(Math.ceil(cheapTypes / 30));
});
