import { expect, test } from "@playwright/test";

test("模型比較：同一句話交給兩個模型，並排 3D 與指標，可以開啟完整結果", async ({ page, context }) => {
  await page.goto("/compare");
  const models = page.getByTestId("compare-model");
  await expect(models).toHaveCount(2); // mock 模式列出 Mock A、Mock B，預設都勾選
  await page.getByLabel("要比較的描述").fill("一隻小鴨");
  await page.getByTestId("compare-submit").click();

  const cards = page.getByTestId("compare-card");
  await expect(cards).toHaveCount(2);
  for (const card of await cards.all()) {
    await expect(card.locator("canvas")).toBeVisible({ timeout: 60_000 });
    await expect(card).toContainText("黃色小鴨");
  }
  const metrics = page.getByTestId("compare-metrics");
  await expect(metrics).toContainText("零件數");
  await expect(metrics).toContainText("186 塊");
  await expect(metrics).toContainText("組起來分成幾塊");

  const [result] = await Promise.all([context.waitForEvent("page"), cards.first().getByRole("button", { name: /開啟完整結果/ }).click()]);
  await expect(result).toHaveURL(/\/build\/b-[0-9a-f]{8}$/);
  await expect(result.getByRole("heading", { level: 1 })).toHaveText("黃色小鴨");
});

test("指定沒有設定的模型：回 422", async ({ request }) => {
  const r = await request.post("/api/design", { data: { prompt: "房子", size: "M", model: "claude-api:claude-opus-5-5" } });
  expect(r.status()).toBe(422);
  expect((await r.json()).error).toBe("unknown_model");
});
