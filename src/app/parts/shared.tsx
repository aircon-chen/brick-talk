export function PartPhoto({ src, name, small = false }: { src: string | null; name: string; small?: boolean }) {
  return <div className={`flex items-center justify-center rounded-lg bg-zinc-100 ${small ? "h-16 w-16" : "aspect-square w-full"}`}>
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element -- 目錄使用外部 CDN 原圖，不經 Next Image 代理。
      <img src={src} alt={name} loading="lazy" className="h-full w-full rounded-lg object-contain p-3" />
    ) : <span className="text-xs text-zinc-500">沒有照片</span>}
  </div>;
}
export function DesignerBadge() {
  return <span className="inline-block rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-700">設計器可用</span>;
}
export function years(first: number | null, last: number | null) {
  return `${first ?? "未知"} 至 ${last ?? "未知"}`;
}
