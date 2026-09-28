// 瀏覽器端呼叫 /api/design，成功就存進 localStorage 並回傳 build id。
import type { ModelSpec, SizeTier } from "@/core/spec";
import { saveBuild } from "./storage";

/** FNV-1a 32 位元，當 build id 用。同一個 spec 會得到同一個 id。 */
export function hashId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "b-" + (h >>> 0).toString(16).padStart(8, "0");
}

export type DesignResult = { ok: true; id: string } | { ok: false; message: string };

export type DesignMeta = { attempts: number; seconds: number; inputTokens: number; outputTokens: number };
export type DesignResponse = { spec: ModelSpec; specWarnings: string[]; warnings: string[]; meta?: DesignMeta };

/** 呼叫 /api/design，不存檔。model 是 /api/models 列出的 id，不給就用伺服器的預設。 */
export async function fetchDesign(prompt: string, size: SizeTier, opts: { signal?: AbortSignal; model?: string } = {}): Promise<
  { ok: true; data: DesignResponse } | { ok: false; message: string }
> {
  let res: Response;
  try {
    res = await fetch("/api/design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, size, ...(opts.model ? { model: opts.model } : {}) }),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) return { ok: false, message: "已取消。" };
    return { ok: false, message: `連不上伺服器：${e instanceof Error ? e.message : String(e)}` };
  }
  const data = (await res.json().catch(() => null)) as (Partial<DesignResponse> & { message?: string }) | null;
  if (!res.ok || !data?.spec) return { ok: false, message: data?.message ?? `設計失敗（HTTP ${res.status}）` };
  return { ok: true, data: { spec: data.spec, specWarnings: data.specWarnings ?? [], warnings: data.warnings ?? [], meta: data.meta } };
}

/** 把設計存進 localStorage，回傳 build id。 */
export function saveDesign(data: DesignResponse, prompt: string, size: SizeTier, budget?: number): string {
  const id = hashId(JSON.stringify(data.spec));
  const persisted = saveBuild(id, {
    spec: data.spec, prompt, size, specWarnings: data.specWarnings, apiWarnings: data.warnings,
    createdAt: new Date().toISOString(), ...(budget ? { budget } : {}),
  });
  if (!persisted) {
    saveBuild(id, {
      spec: data.spec, prompt, size, createdAt: new Date().toISOString(), specWarnings: data.specWarnings, ...(budget ? { budget } : {}),
      apiWarnings: ["瀏覽器沒辦法儲存這個模型（可能是無痕模式或空間滿了），重新整理頁面就會不見。", ...data.warnings],
    });
  }
  return id;
}

export async function requestDesign(prompt: string, size: SizeTier, signal?: AbortSignal, budget?: number): Promise<DesignResult> {
  const r = await fetchDesign(prompt, size, { signal });
  if (!r.ok) return r;
  return { ok: true, id: saveDesign(r.data, prompt, size, budget) };
}
