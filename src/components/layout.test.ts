import { describe, expect, it } from "vitest";
import type { Step } from "@/core/steps";
import { bookletPageCount, layoutStepPages } from "./PrintBooklet";

const step = (index: number, n: number): Step => ({ index, hanging: false, brickIds: Array.from({ length: n }, (_, i) => i), parts: [] });

describe("說明書排版", () => {
  it("新零件 3 塊以內的連續兩步排一頁", () => {
    expect(layoutStepPages([step(1, 2), step(2, 3), step(3, 8), step(4, 1), step(5, 5), step(6, 2)])).toEqual([[0, 1], [2], [3], [4], [5]]);
  });
  it("頁數公式", () => {
    expect(bookletPageCount(28, 20, false)).toBe(1 + 1 + 20 + 1);
    expect(bookletPageCount(31, 20, true)).toBe(2);
  });
});
