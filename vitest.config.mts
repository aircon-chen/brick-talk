import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
      // 測試固定用內建的粗估價格，不受本機 price.data.json 影響
      { find: /^\.\/price\.data\.json$/, replacement: fileURLToPath(new URL("./src/core/price.default.json", import.meta.url)) },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
