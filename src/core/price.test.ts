import { describe, expect, it } from "vitest";
import { PARTS } from "./palette";
import { makePricer, PRICE_INFO, type PriceTable, totalPriceTwd, unitPriceTwd, unitPriceUsd } from "./price";

describe("價格估算（內建的粗估價格表）", () => {
  it("2x4 磚：固定 0.03 加 8 stud × 0.02 = 0.19 美元，× 31.76 ≈ 6.0 元", () => {
    expect(PRICE_INFO.usdToTwd).toBe(31.76);
    expect(PRICE_INFO.source).toContain("自訂");
    expect(unitPriceUsd("3001")).toBe(0.19);
    expect(unitPriceTwd("3001")).toBe(6);
  });

  it("每一種零件都有正的價格", () => {
    for (const p of PARTS) expect(unitPriceUsd(p.part_num), p.part_num).toBeGreaterThan(0);
  });

  it("總價：數量乘單價加總後換算，四捨五入到元", () => {
    expect(totalPriceTwd([{ partNum: "3001", qty: 10 }, { partNum: "3024", qty: 5 }])).toBe(Math.round((0.19 * 10 + 0.04 * 5) * 31.76));
  });
});

describe("makePricer：只有部分零件的價格表", () => {
  const table: PriceTable = {
    date: "test", source: "test", usdToTwd: 30, rateSource: "test",
    samples: { "3005": { usd: 0.05 }, "3001": { usd: 0.2 }, "3023": { usd: 0.06 }, "3020": { usd: 0.1 }, "3036": { usd: 0.5 }, "3069b": { usd: 0.08 } },
  };
  const p = makePricer(table);

  it("表裡沒有的照同種零件的面積內插：2x2 磚介於 1x1 與 2x4；2x10 plate 介於 2x4 與 6x8", () => {
    expect(p.unitPriceUsd("3003")).toBeCloseTo(0.05 + (0.15 * 3) / 7, 5);
    expect(p.unitPriceUsd("3832")).toBeCloseTo(0.1 + (0.4 * 12) / 40, 5);
  });

  it("tile 照 plate 的曲線，乘上 tile 比同尺寸 plate 貴的比例", () => {
    expect(p.unitPriceUsd("87079")).toBeCloseTo(0.1 * (0.08 / 0.06), 5);
  });

  it("表裡沒有的種類退回 brick 的曲線", () => {
    expect(p.unitPriceUsd("3062b")).toBe(0.05);
  });
});
