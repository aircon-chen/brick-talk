"use client";

// 首頁：最近做過的模型（存在這台電腦的瀏覽器裡）。
import Link from "next/link";
import { useHistory } from "@/lib/storage";

export default function RecentBuilds() {
  const history = useHistory();
  if (history.length === 0) return null;
  return (
    <section className="mt-10" data-testid="recent">
      <h2 className="text-xl font-semibold">最近做過的</h2>
      <ul className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {history.map((h) => (
          <li key={h.id}>
            <Link href={`/build/${h.id}`} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-zinc-50">
              <span className="font-medium">{h.title}</span>
              <span className="truncate text-sm text-zinc-500">「{h.prompt}」</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-500">只存在這個瀏覽器裡，換電腦或清除瀏覽資料就不見了。</p>
    </section>
  );
}
