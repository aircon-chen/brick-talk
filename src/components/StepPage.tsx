// 說明書的一步：步驟編號、零件 callout（縮圖、數量、尺寸與顏色）、組裝圖。預覽與列印共用。
import { partNameZh } from "@/core/bom";
import { getColor } from "@/core/palette";
import type { Step } from "@/core/steps";

export default function StepPage({ step, image, thumbs, compact = false }: {
  step: Step; image: string; thumbs: Map<string, string>; compact?: boolean;
}) {
  return (
    <article className="flex h-full flex-col" data-testid={`step-${step.index}`}>
      <div className="flex items-start gap-4">
        <div className={`font-black leading-none tabular-nums ${compact ? "text-4xl" : "text-6xl"}`}>{step.index}</div>
        <div className="flex flex-wrap gap-2 rounded-lg bg-[#D6EAF8] p-2" data-testid="callout">
          {step.parts.map((p) => {
            const c = getColor(p.colorId);
            return (
              <div key={`${p.partNum}|${p.colorId}`} className="flex w-24 flex-col items-center text-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL，不需要最佳化 */}
                <img src={thumbs.get(`${p.partNum}|${p.colorId}`)} alt={`${partNameZh(p.partNum)} ${c.name_zh ?? c.name}`} className="h-20 w-20" />
                <div className="text-base font-bold">{p.qty}x</div>
                <div className="text-[11px] leading-tight text-zinc-700">{partNameZh(p.partNum)}・{c.name_zh ?? c.name}</div>
              </div>
            );
          })}
        </div>
      </div>
      {step.hanging && <p className="mt-2 text-sm font-medium text-red-700">這一步的零件從下方扣上</p>}
      {/* eslint-disable-next-line @next/next/no-img-element -- data URL，不需要最佳化 */}
      <img src={image} alt={`第 ${step.index} 步`} className="mt-2 min-h-0 w-full flex-1 object-contain" />
    </article>
  );
}
