import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brick Talk｜用真實零件組出你的點子",
  description: "說出你想做的東西，用真實存在、近期有生產的 LEGO® 零件設計出來，附零件清單與組裝說明書。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white print:hidden">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <span className="inline-block h-5 w-7 rounded-sm bg-red-600 shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]" aria-hidden />
              Brick Talk
            </Link>
            <Link href="/parts" className="shrink-0 text-sm font-medium text-red-700 hover:underline">零件總覽</Link>
            <Link href="/compare" className="shrink-0 text-sm font-medium text-red-700 hover:underline">模型比較</Link>
            <span className="text-sm text-zinc-500">用真實零件組出你的點子</span>
          </div>
        </header>
        {children}
        <footer className="mt-auto border-t border-zinc-200 bg-white px-4 py-4 text-center text-xs text-zinc-500 print:hidden">
          零件資料來自 Rebrickable；零件尺寸參考 The LDraw Parts Library（CC BY 4.0）。
          LEGO® is a trademark of the LEGO Group of companies which does not sponsor, authorize or endorse this site.
        </footer>
      </body>
    </html>
  );
}
