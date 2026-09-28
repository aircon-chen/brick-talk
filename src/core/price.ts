// 零件價格估算（新台幣）。價格表見 price.data.json：沒有的話安裝時從 price.default.json（本專案自訂的粗估）複製，
// 也可以換成自己的抽樣資料。表裡沒有的零件，照同種零件的面積內插。只是估算：顏色越少見通常越貴，也不含運費。
import data from "./price.data.json";
import { getPart, type PartKind } from "./palette";

export type PriceTable = {
  date: string;
  source: string;
  usdToTwd: number;
  rateSource: string;
  samples: Record<string, { usd: number }>;
};

const area = (partNum: string) => getPart(partNum).studs_w * getPart(partNum).studs_l;

/** 每種零件的 (面積, 美元) 曲線用同一條：倒斜面跟斜面同一條 */
const curveKind = (k: PartKind): PartKind => (k === "slope45_inv" ? "slope45" : k);

/** 比最小的樣本小就用最小的價格；比最大的大就照最大那個的每 stud 單價外插；中間線性內插 */
function interp(curve: [number, number][], a: number): number {
  if (a <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (a >= last[0]) return (last[1] * a) / last[0];
  const i = curve.findIndex(([x]) => x >= a);
  const [x0, y0] = curve[i - 1], [x1, y1] = curve[i];
  return y0 + ((y1 - y0) * (a - x0)) / (x1 - x0);
}

export function makePricer(table: PriceTable) {
  const samples = table.samples;
  const curves = new Map<PartKind, [number, number][]>();
  for (const [pn, s] of Object.entries(samples)) {
    const k = curveKind(getPart(pn).kind);
    curves.set(k, [...(curves.get(k) ?? []), [area(pn), s.usd]]);
  }
  for (const c of curves.values()) c.sort((a, b) => a[0] - b[0]);

  /** 一個零件的估計單價（美元）。 */
  function unitPriceUsd(partNum: string): number {
    if (samples[partNum]) return samples[partNum].usd;
    const k = getPart(partNum).kind;
    const a = area(partNum);
    if (k === "tile" && curves.has("tile") && curves.has("plate")) {
      // tile 樣本少：照 plate 的曲線，乘上 tile 比同尺寸 plate 貴的比例
      const plate = curves.get("plate")!;
      const [ta, tu] = curves.get("tile")![0];
      return interp(plate, a) * (tu / interp(plate, ta));
    }
    return interp(curves.get(curveKind(k)) ?? curves.get("brick")!, a);
  }

  return {
    info: { date: table.date, source: table.source, usdToTwd: table.usdToTwd, rateSource: table.rateSource, samples: Object.keys(samples).length },
    unitPriceUsd,
    /** 一個零件的估計單價（新台幣，到小數一位）。 */
    unitPriceTwd: (partNum: string) => Math.round(unitPriceUsd(partNum) * table.usdToTwd * 10) / 10,
    /** 整份零件清單的估計總價（新台幣，四捨五入到元）。 */
    totalPriceTwd: (rows: { partNum: string; qty: number }[]) =>
      Math.round(rows.reduce((sum, r) => sum + unitPriceUsd(r.partNum) * r.qty, 0) * table.usdToTwd),
  };
}

const pricer = makePricer(data as PriceTable);
export const PRICE_INFO = pricer.info;
export const { unitPriceUsd, unitPriceTwd, totalPriceTwd } = pricer;
