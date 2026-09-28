import { afterEach, describe, expect, it, vi } from "vitest";
import { getFixture } from "@/fixtures";
import { codexCallModel, parseCodexJsonl } from "./codex-cli";
import { type CallModel, designModel } from "./design";
import { openaiCallModel, parseOpenAIResponse } from "./openai";
import { availableModels, callModelFor } from "./providers";

const house = getFixture("demo-house")!.spec;
const signal = () => new AbortController().signal;

// codex-cli 0.155.1 實測的事件流（內容換成範例）
const codexOut = (text: string) => [
  { type: "thread.started", thread_id: "t1" },
  { type: "item.completed", item: { id: "item_0", type: "error", message: "clamping SessionEnd hook timeout" } },
  { type: "turn.started" },
  { type: "item.completed", item: { id: "item_1", type: "agent_message", text } },
  { type: "turn.completed", usage: { input_tokens: 31881, cached_input_tokens: 1000, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 0 } },
].map((e) => JSON.stringify(e)).join("\n");

describe("codex-cli", () => {
  it("agent_message 是回答，turn.completed 是用量；hook 的 error 項目不算失敗；cached 不另外加", () => {
    const m = parseCodexJsonl(codexOut('{"a":1}'));
    expect(m.content).toEqual([{ type: "text", text: '{"a":1}' }]);
    expect(m.usage).toEqual({ input_tokens: 31881, output_tokens: 20 });
  });

  it("失敗或沒有正常結束：就算已經有回答也不採用", () => {
    const failed = [{ type: "turn.failed", error: { message: "usage limit reached" } }].map((e) => JSON.stringify(e)).join("\n");
    expect(() => parseCodexJsonl(failed)).toThrow(/usage limit reached/);
    const answeredThenFailed = [
      { type: "item.completed", item: { type: "agent_message", text: "{}" } },
      { type: "turn.failed", error: { message: "stream disconnected" } },
    ].map((e) => JSON.stringify(e)).join("\n");
    expect(() => parseCodexJsonl(answeredThenFailed)).toThrow(/stream disconnected/);
    const cutOff = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "{}" } });
    expect(() => parseCodexJsonl(cutOff)).toThrow(/沒有正常結束/);
  });

  it("參數：只能碰工作目錄、不載入使用者設定、強制 schema、推理 medium；prompt 從 stdin 送（系統提示在前）", async () => {
    let seen: { cmd: string; args: string[]; stdin: string } | null = null;
    const call = codexCallModel("gpt-6-astra", async (cmd, args, stdin) => { seen = { cmd, args, stdin }; return codexOut("{}"); });
    await call({ system: "SYS", messages: [{ role: "user", content: "做一台車" }], signal: signal(), timeoutMs: 1000 });
    const { cmd, args, stdin } = seen!;
    expect(cmd).toBe("codex");
    for (const a of ["exec", "--json", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--output-schema"]) expect(args).toContain(a);
    // -s read-only 會蓋掉權限設定而且擋不住讀取，不能出現
    expect(args).not.toContain("-s");
    expect(args).toContain('default_permissions="workspace-only"');
    expect(args[args.indexOf("-m") + 1]).toBe("gpt-6-astra");
    expect(args.at(-1)).toBe("-");
    expect(stdin.startsWith("SYS\n\n做一台車")).toBe(true);
  });

  it("接上 designModel：回傳合法設計就成功", async () => {
    const r = await designModel({ prompt: "房子", size: "M" }, { callModel: codexCallModel(undefined, async () => codexOut(JSON.stringify(house))) });
    expect(r.ok).toBe(true);
  });
});

describe("openai", () => {
  it("文字在 message 裡（前面的 reasoning 略過），用量照抄", () => {
    const m = parseOpenAIResponse({
      status: "completed",
      output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: '{"a"' }, { type: "output_text", text: ":1}" }] }],
      usage: { input_tokens: 81, output_tokens: 11 },
    });
    expect(m.content).toEqual([{ type: "text", text: '{"a":1}' }]);
    expect(m.stop_reason).toBe("end_turn");
    expect(m.usage).toEqual({ input_tokens: 81, output_tokens: 11 });
  });

  it("status failed：丟錯並帶上原因，不當成空白回答", () => {
    expect(() => parseOpenAIResponse({ status: "failed", error: { code: "server_error", message: "boom" }, output: [] })).toThrow(/server_error boom/);
  });

  it("refusal 與 max_output_tokens 截斷", () => {
    expect(parseOpenAIResponse({ output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] }).stop_reason).toBe("refusal");
    expect(parseOpenAIResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output: [] }).stop_reason).toBe("max_tokens");
  });

  it("請求：developer 放系統提示、strict json_schema；HTTP 錯誤帶狀態碼", async () => {
    let body: Record<string, unknown> = {};
    const ok = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(house) }] }], usage: { input_tokens: 1, output_tokens: 2 } }));
    }) as unknown as typeof fetch;
    const r = await designModel({ prompt: "房子", size: "M" }, { callModel: openaiCallModel("gpt-6-astra", ok) });
    expect(r.ok).toBe(true);
    expect(body.model).toBe("gpt-6-astra");
    expect((body.input as { role: string }[])[0].role).toBe("developer");
    expect(body.text).toMatchObject({ format: { type: "json_schema", strict: true } });

    const busy = (async () => new Response("overloaded", { status: 529 })) as unknown as typeof fetch;
    await expect(openaiCallModel("m", busy)({ system: "", messages: [], signal: signal(), timeoutMs: 1 })).rejects.toMatchObject({ status: 529 });
  });
});

describe("availableModels", () => {
  afterEach(() => vi.unstubAllEnvs());
  const clear = () => {
    for (const k of ["LLM_MOCK", "ANTHROPIC_API_KEY", "LLM_BACKEND", "OPENAI_API_KEY", "OPENAI_MODELS", "CODEX_CLI", "CODEX_MODEL"]) vi.stubEnv(k, "");
  };

  it("什麼都沒設定就沒有模型；未知的 id 回 null", () => {
    clear();
    expect(availableModels()).toEqual([]);
    expect(callModelFor("claude-api:claude-opus-5-5")).toBeNull();
  });

  it("依設定列出：Claude 訂閱兩個、OpenAI 照 OPENAI_MODELS、Codex 標實驗性", () => {
    clear();
    vi.stubEnv("LLM_BACKEND", "claude-cli");
    vi.stubEnv("OPENAI_API_KEY", "test");
    vi.stubEnv("OPENAI_MODELS", "gpt-a, gpt-b");
    vi.stubEnv("CODEX_CLI", "1");
    const ids = availableModels().map((m) => m.id);
    expect(ids).toEqual(["claude-cli:claude-opus-5-5", "claude-cli:claude-sonnet-5", "openai-api:gpt-a", "openai-api:gpt-b", "codex-cli:default"]);
    expect(availableModels().at(-1)!.label).toContain("實驗性");
    expect(callModelFor("openai-api:gpt-b")).not.toBeNull();
  });
});

describe("取消", () => {
  it("外部 signal 取消時（例如使用者離開比較頁），正在跑的模型呼叫會被中止", async () => {
    const outer = new AbortController();
    let aborted = false;
    const callModel: CallModel = ({ signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(Object.assign(new Error("aborted"), { name: "AbortError" })); });
    });
    const pending = designModel({ prompt: "房子", size: "S" }, { callModel, signal: outer.signal });
    outer.abort();
    const r = await pending;
    expect(aborted).toBe(true);
    expect(r.ok).toBe(false);
  });
});
