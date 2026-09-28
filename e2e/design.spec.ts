import { expect, test } from "@playwright/test";

test("輸入描述 → 設計 → 結果頁；修改描述會回首頁預填", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("你想做什麼").fill("一隻小鴨");
  await page.getByText("小（約 10 公分寬）").click();
  await page.getByTestId("design-submit").click();
  await expect(page).toHaveURL(/\/build\/b-[0-9a-f]{8}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("黃色小鴨");
  await expect(page.getByTestId("redesign")).toContainText("一隻小鴨");

  // 重新整理之後還在（localStorage）
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("黃色小鴨");

  await page.getByRole("link", { name: "修改描述" }).click();
  await expect(page).toHaveURL(/\/\?prompt=/);
  await expect(page.getByLabel("你想做什麼")).toHaveValue("一隻小鴨");
  await expect(page.getByTestId("recent")).toContainText("黃色小鴨");
});

test("設計失敗時顯示訊息、保留輸入", async ({ page }) => {
  await page.route("**/api/design", (route) =>
    route.fulfill({ status: 502, json: { error: "design_failed", message: "這次沒設計成功，換個說法或選小一點的尺寸再試一次。" } }));
  await page.goto("/");
  await page.getByLabel("你想做什麼").fill("一座城堡");
  await page.getByTestId("design-submit").click();
  await expect(page.getByTestId("design-error")).toContainText("這次沒設計成功");
  await expect(page.getByLabel("你想做什麼")).toHaveValue("一座城堡");
});

test("localStorage 存不進去時還是能打開結果頁，並提示重新整理會不見", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("quota", "QuotaExceededError"); };
  });
  await page.goto("/");
  await page.getByLabel("你想做什麼").fill("一台車");
  await page.getByTestId("design-submit").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("紅色小跑車");
  await expect(page.getByTestId("warnings")).toContainText("重新整理頁面就會不見");
});

test("API 回的品質警告會顯示在結果頁", async ({ page }) => {
  await page.route("**/api/design", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ json: { ...body, warnings: ["模型需要 999 塊磚，超過這個尺寸的上限"] } });
  });
  await page.goto("/");
  await page.getByLabel("你想做什麼").fill("一棵樹");
  await page.getByTestId("design-submit").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("聖誕樹");
  await expect(page.getByTestId("warnings")).toContainText("超過這個尺寸的上限");
});

test("API 驗證輸入", async ({ request }) => {
  expect((await request.post("/api/ideas", { data: "null", headers: { "content-type": "application/json" } })).status()).toBe(422);
  expect((await request.post("/api/design", { data: { prompt: "", size: "M" } })).status()).toBe(422);
  expect((await request.post("/api/design", { data: { prompt: "房子", size: "XXL" } })).status()).toBe(422);
  const ok = await request.post("/api/design", { data: { prompt: "一台車", size: "M" } });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.spec.title).toBe("紅色小跑車");
  expect(Array.isArray(body.specWarnings)).toBe(true);
});

test("給我靈感：3 張點子卡，點了帶進輸入框", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("ideas-button").click();
  const cards = page.getByTestId("idea-card");
  await expect(cards).toHaveCount(3);
  await cards.nth(1).click();
  await expect(page.getByLabel("你想做什麼")).toHaveValue(/^海邊的燈塔：/);
  await expect(page.getByTestId("ideas")).toHaveCount(0);
});
