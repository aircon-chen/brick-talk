// 安裝時執行（package.json 的 postinstall）：src/core/price.data.json 不在版控裡，
// 沒有的話從 price.default.json（本專案自訂的粗估）複製一份。已經有就不動，想用自己的價格表直接覆蓋那個檔。
import { copyFileSync, existsSync } from "node:fs";

const target = new URL("../src/core/price.data.json", import.meta.url);
const fallback = new URL("../src/core/price.default.json", import.meta.url);

if (existsSync(target)) {
  console.log("price.data.json 已經存在，沿用。");
} else {
  copyFileSync(fallback, target);
  console.log("建立 price.data.json（內建的粗估價格）。");
}
