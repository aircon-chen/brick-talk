import Link from "next/link";
import { notFound } from "next/navigation";
import { designerPartNums, getPart } from "@/lib/catalog";
import { DesignerBadge, PartPhoto, years } from "../shared";

export const runtime = "nodejs";
const relationships: Record<string, string> = { P: "印刷版", M: "模具版本", A: "替代品", B: "子零件", R: "成對零件", T: "圖案" };
export default async function PartPage({ params }: { params: Promise<{ partNum: string }> }) {
  const { partNum } = await params;
  const result = getPart(partNum);
  if (!result.ok) return <main className="mx-auto w-full max-w-5xl p-6"><h1 className="text-2xl font-bold">零件詳細資料</h1><p className="mt-4">{result.message}</p></main>;
  const part = result.data;
  if (!part) notFound();
  const d = part.dimensions;
  return <main className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8">
    <Link href="/parts" className="text-sm text-red-700">回零件總覽</Link>
    <section className="mt-6 grid gap-6 sm:grid-cols-[240px_minmax(0,1fr)]"><PartPhoto src={part.img_url} name={part.name} /><div className="min-w-0"><p className="break-all font-mono text-red-700">{part.part_num}</p><h1 className="my-2 break-words text-2xl font-bold">{part.name}</h1>{designerPartNums().has(partNum) && <DesignerBadge />}<p className="mt-4">分類：{part.category}</p><p className="mt-2">年份：{years(part.y1, part.y2)}</p><p className="mt-2">套組數：{part.num_sets.toLocaleString()}（各色加總，可能重複）</p>
      <h2 className="mt-4 font-bold">規格</h2>{d ? <ul className="mt-2 space-y-1 text-sm">
        {d.studs_w != null && d.studs_l != null && <li>寬 × 長：{d.studs_w} × {d.studs_l} stud</li>}
        {d.width_mm != null && d.length_mm != null && <li>寬 × 長：{d.width_mm} × {d.length_mm} mm</li>}
        {d.height_mm != null && <li>高度：{d.height_mm} mm</li>}
        {d.height_bricks != null && <li>高度：{d.height_bricks} brick</li>}
        {d.height_plates != null && <li>高度：{d.height_plates} plate</li>}
        <li className="text-zinc-500">尺寸由名稱解析；缺少的欄位不顯示。</li>
      </ul> : <p className="mt-2 text-sm">{part.name}</p>}
      <a href={`https://rebrickable.com/parts/${encodeURIComponent(partNum)}/`} className="mt-4 inline-block text-sm text-red-700 underline">在 Rebrickable 查看</a>
    </div></section>
    <section className="mt-10"><h2 className="mb-3 text-xl font-bold">顏色與購買編號</h2><p className="mb-4 text-sm text-zinc-600">Element ID 是在 LEGO Pick a Brick 查找零件的編號。年份來自套組紀錄，不代表現在有貨。</p>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white"><table className="w-full text-left text-sm"><caption className="sr-only">零件顏色表</caption><thead className="bg-zinc-100"><tr>{["顏色", "中文名", "年份", "套組數", "Element ID", "照片"].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{part.colors.map((color) => <tr key={color.color_id} className="border-t border-zinc-200"><td className="p-3"><span className="mb-1 block h-5 w-8 rounded border border-zinc-300" style={{ backgroundColor: `#${color.rgb}` }} />{color.name}</td><td className="p-3">{color.name_zh || "未提供"}</td><td className="p-3">{years(color.y1, color.y2)}</td><td className="p-3">{color.num_sets}</td><td className="max-w-48 break-words p-3 font-mono">{color.element_ids || "未提供"}</td><td className="p-3"><PartPhoto src={color.img_url} name={`${part.name} ${color.name}`} small /></td></tr>)}</tbody></table></div>{part.colors.length === 0 && <p className="mt-3">還沒有顏色資料。</p>}
    </section>
    {part.related.length > 0 && <section className="mt-8"><h2 className="mb-3 text-xl font-bold">相關零件</h2><ul className="grid gap-2 sm:grid-cols-2">{part.related.map((related) => <li key={`${related.rel_type}-${related.part_num}`} className="min-w-0"><Link className="block break-words rounded border border-zinc-200 bg-white p-3 text-sm hover:border-red-400" href={`/parts/${encodeURIComponent(related.part_num)}`}><span className="text-zinc-500">{relationships[related.rel_type] ?? related.rel_type} · </span>{related.part_num} {related.name}</Link></li>)}</ul></section>}
  </main>;
}
