// 評估用：把 EVAL_SPECS/layers/*.spec.json 放進 localStorage，截 3D 圖。平常跳過。
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const dir = process.env.EVAL_SPECS ?? "";
const specs = dir && existsSync(join(dir, "layers")) ? readdirSync(join(dir, "layers")).filter((f) => f.endsWith(".spec.json")) : [];

test.skip(specs.length === 0, "沒有設定 EVAL_SPECS");

for (const f of specs) {
  const key = f.replace(/\.spec\.json$/, "");
  test(`截圖 ${key}`, async ({ page }) => {
    const spec = JSON.parse(readFileSync(join(dir, "layers", f), "utf8"));
    const id = `eval-${key}`;
    await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [
      `lego-builder:build:${id}`,
      JSON.stringify({ spec, prompt: key, size: "M", specWarnings: [], createdAt: "" }),
    ] as const);
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.goto(`/build/${id}`);
    await expect.poll(() => page.evaluate(() => window.__legoStats?.bricksRendered ?? 0)).toBeGreaterThan(0);
    writeFileSync(join(dir, "layers", `${key}.png`), await page.getByTestId("viewer").screenshot());
  });
}
