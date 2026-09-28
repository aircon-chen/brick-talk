"use client";

// 零件清單分頁：表格（窄螢幕改卡片）、下載、怎麼買。
import { toBomCsv, toBrickLinkXml, toPickABrickCsv } from "@/core/bom";
import { toLdraw } from "@/core/ldraw";
import type { BuildResult } from "@/core/pipeline";
import { PRICE_INFO } from "@/core/price";
import { useThumbs } from "./useBookletImages";

function download(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BomPanel({ result }: { result: BuildResult }) {
  const thumbs = useThumbs(result);
  const rows = result.bom;
  const total = rows.reduce((a, r) => a + r.qty, 0);
  const pab = toPickABrickCsv(rows);

  return (
    <div data-testid="bom">
      <p className="text-zinc-700">共 <b>{rows.length}</b> 種零件、<b>{total}</b> 塊，估計約 <b>NT$ {result.stats.priceTwd.toLocaleString()}</b>。</p>
      <p className="mt-1 text-xs text-zinc-500" data-testid="price-note">
        價格是估算：{PRICE_INFO.source}（{PRICE_INFO.date}，{PRICE_INFO.samples} 種零件），表裡沒有的零件照同種零件的大小推算，
        美元以 1 : {PRICE_INFO.usdToTwd} 換算。少見的顏色通常比較貴，也不含運費；在台灣的樂高店或網路賣家買，實際價格以店家為準。
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700" data-testid="dl-bom"
          onClick={() => download("bom.csv", toBomCsv(rows), "text/csv;charset=utf-8")}>下載零件清單（CSV）</button>
        <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50" data-testid="dl-pab"
          onClick={() => download("pick-a-brick.csv", pab.text, "text/csv;charset=utf-8")}>下載 Pick a Brick CSV</button>
        <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50" data-testid="dl-bricklink"
          onClick={() => download("bricklink-wanted.xml", toBrickLinkXml(rows), "application/xml")}>下載 BrickLink Wanted List（XML）</button>
        <button className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50" data-testid="dl-ldraw"
          onClick={() => download("model.ldr", toLdraw(result.spec.title, result.bricks, result.steps).text, "text/plain;charset=utf-8")}>下載 LDraw 檔（進階）</button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">LDraw 檔可以用 BrickLink Studio 或 LeoCAD 打開，步驟可能不會保留。</p>
      {pab.warnings.map((w) => <p key={w} className="mt-1 text-sm text-amber-800">{w}</p>)}

      {/* 寬螢幕：表格 */}
      <table className="mt-5 hidden w-full border-collapse text-sm sm:table" data-testid="bom-table">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-zinc-500">
            <th className="py-2 pr-2 font-medium">零件</th>
            <th className="py-2 pr-2 font-medium">顏色</th>
            <th className="whitespace-nowrap py-2 pr-2 text-right font-medium">數量</th>
            <th className="whitespace-nowrap py-2 pr-2 text-right font-medium">估計小計</th>
            <th className="py-2 pr-2 font-medium">Element ID</th>
            <th className="py-2 font-medium">BrickLink</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.partNum}|${r.colorId}`} className="border-b border-zinc-100 align-middle" data-testid="bom-row">
              <td className="py-2 pr-2">
                <div className="flex items-center gap-3">
                  <Thumb src={thumbs?.get(`${r.partNum}|${r.colorId}`)} alt={r.partNameZh} />
                  <div>
                    <div className="font-medium">{r.partNameZh}</div>
                    <div className="text-xs text-zinc-500">{r.partName}（{r.partNum}）</div>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-4 shrink-0 rounded border border-zinc-300" style={{ background: r.rgb }} />
                  <div>
                    <div>{r.colorNameZh}</div>
                    <div className="text-xs text-zinc-500">LEGO：{r.legoColorName}・BrickLink：{r.colorName}</div>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-2 text-right text-base font-semibold tabular-nums">{r.qty}</td>
              <td className="whitespace-nowrap py-2 pr-2 text-right tabular-nums">
                <div>NT$ {Math.round(r.unitPriceTwd * r.qty).toLocaleString()}</div>
                <div className="text-xs text-zinc-500">單價 {r.unitPriceTwd}</div>
              </td>
              <td className="py-2 pr-2 font-mono">
                <div>{r.primaryElementId}</div>
                {r.elementIds.length > 1 && <div className="text-xs text-zinc-500">也可能是 {r.elementIds.slice(1).join("、")}</div>}
              </td>
              <td className="py-2 font-mono text-xs text-zinc-600">{r.bricklinkPartId}／色號 {r.bricklinkColorId}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 窄螢幕：卡片 */}
      <ul className="mt-5 space-y-2 sm:hidden" data-testid="bom-cards">
        {rows.map((r) => (
          <li key={`${r.partNum}|${r.colorId}`} className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-2">
            <Thumb src={thumbs?.get(`${r.partNum}|${r.colorId}`)} alt={r.partNameZh} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{r.partNameZh}</div>
              <div className="flex items-center gap-1.5 text-sm text-zinc-700">
                <span className="inline-block h-3 w-3 shrink-0 rounded border border-zinc-300" style={{ background: r.rgb }} />
                {r.colorNameZh}
              </div>
              <div className="font-mono text-xs text-zinc-500">{r.primaryElementId}</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold tabular-nums">{r.qty}x</div>
              <div className="text-xs tabular-nums text-zinc-500">NT$ {Math.round(r.unitPriceTwd * r.qty).toLocaleString()}</div>
            </div>
          </li>
        ))}
      </ul>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 text-sm leading-relaxed text-zinc-700" data-testid="how-to-buy">
        <h3 className="text-base font-semibold text-zinc-900">怎麼買</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5">
          <li><b>樂高授權店的 Pick a Brick 牆</b>：到「組裝說明書」分頁按「只印零件清單」帶去，照尺寸和顏色挑。牆上的零件種類有限。</li>
          <li><b>LEGO.com Pick a Brick</b>：用 Element ID 搜尋，搜不到代表編號換過，可以去 BrickLink 查新編號。美國、加拿大的 Pick a Brick 有批次上傳功能，這裡匯出的 CSV 照公開資料的格式製作，還沒實測。台灣能不能線上下單還沒確認。</li>
          <li><b>BrickLink</b>：到 Wanted List 上傳頁（<span className="break-all">https://www.bricklink.com/v2/wanted/upload.page</span>）上傳匯出的 XML，再向賣家下單。</li>
        </ul>
        <p className="mt-3 text-zinc-500">「近期有生產」是根據 2024 年以後發行的套組推估，實際能不能買以各通路當下的頁面為準。</p>
      </section>
    </div>
  );
}

function Thumb({ src, alt }: { src: string | undefined; alt: string }) {
  if (!src) return <div className="h-12 w-12 shrink-0 animate-pulse rounded bg-zinc-100" />;
  // eslint-disable-next-line @next/next/no-img-element -- data URL
  return <img src={src} alt={alt} className="h-12 w-12 shrink-0" />;
}
