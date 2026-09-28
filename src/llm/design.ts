// 呼叫 LLM 設計模型：驗證、正規化、品質檢查、重試、deadline（SUPERPROMPT.md 9.1、9.2）。
import { runPipeline } from "@/core/pipeline";
import { toLayerCells } from "@/core/pipeline";
import { labelOf, type ModelSpec, normalizeSpec, parseModelSpec, type SizeTier } from "@/core/spec";
import { buildSystemPrompt, buildUserMessage } from "./prompt";

export type ChatMessage = { role: "user" | "assistant"; content: string };
/** 模型回應，只取需要的欄位。content 的第一個 block 可能是 thinking。 */
export type ModelMessage = {
  content: { type: string; text?: string }[];
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
};
export type CallModel = (args: { system: string; messages: ChatMessage[]; signal: AbortSignal; timeoutMs: number }) => Promise<ModelMessage>;

export type DesignInput = { prompt: string; size: SizeTier };
export type DesignSuccess = {
  ok: true;
  spec: ModelSpec;
  specWarnings: string[];
  warnings: string[];
  /** inputTokens 含 cache 寫入與讀取 */
  meta: { attempts: number; seconds: number; inputTokens: number; outputTokens: number };
};
export type DesignFailure = { ok: false; message: string; details: string[] };
export type DesignOutcome = DesignSuccess | DesignFailure;

/** 總時間與第一次呼叫的上限。大尺寸形狀多、輸出長，時間放寬 */
const TIMING: Record<SizeTier, { deadline: number; firstCall: number }> = {
  S: { deadline: 170_000, firstCall: 120_000 },
  M: { deadline: 170_000, firstCall: 120_000 },
  L: { deadline: 280_000, firstCall: 200_000 },
  XL: { deadline: 280_000, firstCall: 200_000 },
};
const MIN_RETRY_MS = 40_000;
const MAX_CALLS = 2;

/** 從回應拿文字：一定要用 type 找，Opus 5.5 的回應開頭可能是 thinking block。 */
export function responseText(msg: ModelMessage): string {
  return msg.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

type Evaluated =
  | { kind: "structural"; feedback: string; details: string[] }
  | { kind: "empty"; feedback: string; details: string[] }
  | { kind: "quality"; spec: ModelSpec; specWarnings: string[]; warnings: string[]; issues: string[] }
  | { kind: "ok"; spec: ModelSpec; specWarnings: string[]; warnings: string[] };

function evaluate(text: string, size: SizeTier): Evaluated {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "structural", feedback: `你的輸出不是合法的 JSON（${msg}）。請只輸出一個 JSON 物件。`, details: [msg] };
  }
  const parsed = parseModelSpec(json);
  if (!parsed.ok) {
    return { kind: "structural", feedback: `你的 JSON 不符合格式：\n${parsed.errors.slice(0, 15).join("\n")}\n請修正後重新輸出完整的 JSON。`, details: parsed.errors };
  }
  const { spec, warnings: specWarnings } = normalizeSpec(parsed.spec, size);
  const r = runPipeline(spec);
  const label = (i: number) => `「${labelOf(spec, i)}」`;
  if (r.diagnostics.filledCells === 0) {
    return { kind: "empty", feedback: "你的設計體素化之後一格都沒有。請確認形狀在 size 範圍內、op 是 add。", details: ["格子數為 0"] };
  }
  const issues: string[] = [];
  const total = r.diagnostics.filledCells + r.stats.floatingCellsRemoved;
  // 格數是 plate（一層 3 格），門檻與訊息都換成層
  if (r.stats.floatingCellsRemoved > total * 0.4) {
    issues.push(`有 ${toLayerCells(r.stats.floatingCellsRemoved)} 格懸在空中、沒有接到地面，被移除了（超過四成）。請讓模型從 z = 0 往上長。`);
  } else if (r.stats.floatingCellsRemoved > Math.max(12, total * 0.02)) {
    // 常見的是兩個橢球沒接上：radius 的 z 是 stud，要除以 1.2 才是層
    const parts = [...new Set(r.diagnostics.floatingShapes.map(label))].join("、") || "有些部位";
    issues.push(`${parts} 懸在空中、沒有接到下面的部位，整塊被移除了（${toLayerCells(r.stats.floatingCellsRemoved)} 格）。請讓它跟下面的部位上下重疊至少 1 層。橢球和圓柱的 radius 在 z 方向是 stud，要除以 1.2 才是層，算邊界時別漏掉。`);
  }
  // 底板是程式鋪的，分開了 LLM 也修不了，只留給使用者看的警告
  const baseLabel = spec.shapes.length + (spec.parts?.length ?? 0);
  const detached = r.diagnostics.detachedShapes.filter((idx) => !(spec.base && idx.every((i) => i === baseLabel)));
  if (r.stats.components > 1 && detached.length) {
    const parts = detached.map((idx) => idx.map(label).join("、")).filter(Boolean);
    issues.push(`組起來會分成 ${r.stats.components} 塊：${parts.join("；") || "有些部位"} 跟主體沒有連在一起。請讓它們跟主體上下重疊至少 1 層，不要只從側面貼上去。`);
  }
  // 補出來的支撐柱通常是細細一根通到地面，很醜；超過 4 格或 2% 就請 LLM 改（代理評估的恐龍補了 35 格，一眼就看得出來）
  const supportHeavy = r.stats.supportCellsAdded > Math.max(12, r.diagnostics.filledCells * 0.02);
  if (supportHeavy || r.stats.ungroundedCellsRemoved > 0) {
    const parts = [...new Set([...r.diagnostics.supportedShapes, ...r.diagnostics.removedShapes])].map(label).join("、");
    issues.push(`${parts || "有些部位"} 懸空、撐不住（補了 ${toLayerCells(r.stats.supportCellsAdded)} 格支撐、移除了 ${toLayerCells(r.stats.ungroundedCellsRemoved)} 格）。請讓它們壓在下面的部位上，或被上面的部位蓋住。`);
  }
  if (issues.length) return { kind: "quality", spec, specWarnings, warnings: r.warnings, issues };
  return { kind: "ok", spec, specWarnings, warnings: r.warnings };
}

function isBusy(e: unknown): boolean {
  const status = (e as { status?: number } | null)?.status;
  return status === 429 || status === 529 || (typeof status === "number" && status >= 500);
}

export async function designModel(
  input: DesignInput,
  deps: { callModel: CallModel; now?: () => number; deadlineMs?: number; firstCallMs?: number; /** 使用者取消（例如離開頁面）時停止 */ signal?: AbortSignal },
): Promise<DesignOutcome> {
  const now = deps.now ?? Date.now;
  const start = now();
  const deadline = start + (deps.deadlineMs ?? TIMING[input.size].deadline);
  const system = buildSystemPrompt(input.size);
  const messages: ChatMessage[] = [{ role: "user", content: buildUserMessage(input.prompt, input.size) }];
  const ctrl = new AbortController();
  deps.signal?.addEventListener("abort", () => ctrl.abort());
  const timer = setTimeout(() => ctrl.abort(), Math.max(0, deadline - now()));
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  let last: Evaluated | null = null;

  try {
    for (let attempt = 1; attempt <= MAX_CALLS; attempt++) {
      const remaining = deadline - now();
      if (attempt > 1 && remaining < MIN_RETRY_MS) break;
      let msg: ModelMessage;
      attempts = attempt;
      // 每次呼叫自己計時，涵蓋到整個串流結束（SDK 的 timeout 收到 response header 就停了），再串到共用 deadline
      const callMs = Math.min(deps.firstCallMs ?? TIMING[input.size].firstCall, remaining);
      const attemptCtrl = new AbortController();
      const onDeadline = () => attemptCtrl.abort();
      ctrl.signal.addEventListener("abort", onDeadline);
      const attemptTimer = setTimeout(() => attemptCtrl.abort(), callMs);
      try {
        msg = await deps.callModel({ system, messages, signal: attemptCtrl.signal, timeoutMs: callMs });
      } catch (e) {
        if (attemptCtrl.signal.aborted) {
          return { ok: false, message: "設計花太久了，請換個簡單一點的說法，或選小一點的尺寸再試一次。", details: ["timeout"] };
        }
        if (isBusy(e)) return { ok: false, message: "Claude 暫時忙碌，請稍後再試。", details: [String((e as Error)?.message ?? e)] };
        if (ctrl.signal.aborted || (e as Error)?.name?.includes("Abort") || (e as Error)?.name?.includes("Timeout")) {
          return { ok: false, message: "設計花太久了，請換個簡單一點的說法，或選小一點的尺寸再試一次。", details: ["deadline"] };
        }
        return { ok: false, message: "設計失敗了，請再試一次。", details: [String((e as Error)?.message ?? e)] };
      } finally {
        clearTimeout(attemptTimer);
        ctrl.signal.removeEventListener("abort", onDeadline);
      }
      const u = msg.usage;
      inputTokens += (u?.input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0);
      outputTokens += u?.output_tokens ?? 0;
      if (msg.stop_reason === "refusal") {
        return { ok: false, message: "這個題目沒辦法設計，換個說法試試看。", details: ["refusal"] };
      }
      const text = responseText(msg);
      if (msg.stop_reason === "max_tokens") {
        last = { kind: "structural", feedback: "", details: ["輸出被截斷（max_tokens）"] };
        messages.push({ role: "assistant", content: text || "（輸出被截斷）" });
        messages.push({ role: "user", content: "你的輸出太長被截斷了。請把形狀數量減半，只保留最重要的部位，重新輸出完整的 JSON。" });
        continue;
      }
      last = evaluate(text, input.size);
      const seconds = Math.round((now() - start) / 100) / 10;
      if (last.kind === "ok") {
        return { ok: true, spec: last.spec, specWarnings: last.specWarnings, warnings: last.warnings, meta: { attempts: attempt, seconds, inputTokens, outputTokens } };
      }
      messages.push({ role: "assistant", content: text });
      messages.push({
        role: "user",
        content: last.kind === "quality"
          ? `你的設計有這些問題，請修正後重新輸出完整的 JSON：\n${last.issues.map((s) => `- ${s}`).join("\n")}`
          : last.feedback,
      });
    }
  } finally {
    clearTimeout(timer);
  }

  const seconds = Math.round((now() - start) / 100) / 10;
  if (last?.kind === "quality") {
    // 只剩品質問題：還是回傳模型，把問題放在警告第一條
    return { ok: true, spec: last.spec, specWarnings: last.specWarnings, warnings: [...last.issues, ...last.warnings], meta: { attempts, seconds, inputTokens, outputTokens } };
  }
  const details = last && (last.kind === "structural" || last.kind === "empty") ? last.details : ["deadline"];
  return { ok: false, message: "這次沒設計成功，換個說法或選小一點的尺寸再試一次。", details };
}
