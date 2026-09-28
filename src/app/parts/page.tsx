import Link from "next/link";
import { designerPartNums, listParts } from "@/lib/catalog";
import { DesignerBadge, PartPhoto } from "./shared";

export const runtime = "nodejs";
export default async function PartsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const q = value("q");
  const category = /^\d+$/.test(value("category")) ? Number(value("category")) : undefined;
  const recent = value("recent") === "1";
  const result = listParts({ q, category, recent, page: Number(value("page") || 1) });
  if (!result.ok) return <main className="mx-auto w-full max-w-5xl p-6"><h1 className="text-2xl font-bold">零件總覽</h1><p className="mt-4">{result.message}</p></main>;
  const { parts, total, page, pages, categories } = result.data;
  const designer = designerPartNums();
  function href(nextCategory: number | undefined, nextPage = 1) {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (nextCategory !== undefined) query.set("category", String(nextCategory));
    if (recent) query.set("recent", "1");
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/parts?${query}`;
  }
  return <main className="mx-auto w-full max-w-7xl px-4 py-8">
    <div className="mb-6 border-l-4 border-red-600 pl-4"><h1 className="text-3xl font-bold">零件總覽</h1><p className="mt-2 text-sm text-zinc-600">從形狀找到零件，再看看有哪些顏色。</p></div>
    <form action="/parts" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      {category !== undefined && <input type="hidden" name="category" value={category} />}
      <label className="min-w-0 flex-1 basis-60 text-sm font-medium">名稱或零件編號<input name="q" defaultValue={q} placeholder="例如 wheel 或 3001" className="mt-2 block w-full rounded border border-zinc-300 px-3 py-2" /></label>
      <button className="rounded bg-red-600 px-5 py-2 text-white hover:bg-red-700">搜尋</button>
      <label className="flex w-full items-center gap-2 text-sm"><input type="checkbox" name="recent" value="1" defaultChecked={recent} />只看 2024 年以後還有生產</label>
      <p className="text-xs text-zinc-500">依套組出現年份推估，實際生產與供貨狀態未確認。勾選後按搜尋套用。</p>
    </form>
    <div className="grid min-w-0 gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside><h2 className="mb-2 font-bold">分類</h2><nav aria-label="零件分類" className="max-h-64 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 md:max-h-[70vh]">
        <Link href={href(undefined)} aria-current={category === undefined ? "page" : undefined} className="block rounded p-2 text-sm aria-[current=page]:bg-red-50 aria-[current=page]:text-red-700">全部分類（{categories.reduce((sum, c) => sum + c.count, 0).toLocaleString()}）</Link>
        {categories.map((c) => <Link key={c.id} href={href(c.id)} aria-current={category === c.id ? "page" : undefined} className="flex gap-2 rounded p-2 text-sm hover:bg-zinc-50 aria-[current=page]:bg-red-50 aria-[current=page]:text-red-700"><span className="min-w-0 flex-1 break-words">{c.name}</span><span className="text-zinc-500">{c.count}</span></Link>)}
      </nav></aside>
      <section className="min-w-0" aria-label="零件列表"><p className="mb-4 text-sm text-zinc-600">共 {total.toLocaleString()} 筆 · 依熱門度排序 · 每頁 60 筆</p>
        {parts.length === 0 && <p className="rounded-lg border border-dashed border-zinc-300 p-8">找不到符合的零件，試試其他名稱或分類。</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">{parts.map((part) => <Link data-testid="part-card" key={part.part_num} href={`/parts/${encodeURIComponent(part.part_num)}`} className="min-w-0 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-red-400 hover:shadow-sm">
          <PartPhoto src={part.img_url} name={part.name} /><p className="mt-3 break-all font-mono text-sm text-red-700">{part.part_num}</p><h2 className="mt-1 break-words text-sm font-semibold">{part.name}</h2><p className="mt-2 break-words text-xs text-zinc-500">{part.category}</p><p className="my-2 text-xs text-zinc-600">{part.num_colors} 色 · 最後生產 {part.y2 ?? "未知"}</p>{designer.has(part.part_num) && <DesignerBadge />}
        </Link>)}</div>
        <nav aria-label="分頁" className="mt-6 flex items-center justify-between gap-2 text-sm">{page > 1 ? <Link href={href(category, page - 1)} className="rounded border px-3 py-2">上一頁</Link> : <span className="text-zinc-400">上一頁</span>}<span>第 {page} / {pages} 頁</span>{page < pages ? <Link href={href(category, page + 1)} className="rounded border px-3 py-2">下一頁</Link> : <span className="text-zinc-400">下一頁</span>}</nav>
      </section>
    </div>
  </main>;
}
