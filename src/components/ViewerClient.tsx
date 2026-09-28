"use client";

import dynamic from "next/dynamic";

// three.js 只能在瀏覽器跑，所以不做 SSR
const ViewerClient = dynamic(() => import("./Viewer"), {
  ssr: false,
  loading: () => <div className="flex h-[480px] items-center justify-center rounded-xl border border-zinc-200 bg-[#f4f5f7] text-zinc-500">載入 3D 預覽中…</div>,
});

export default ViewerClient;
