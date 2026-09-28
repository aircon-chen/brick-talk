import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getFixture } from "@/fixtures";
import { cliCallModel, flattenMessages, parseCliOutput, type RunClaude, runClaude } from "./claude-cli";
import { designModel } from "./design";

const house = getFixture("demo-house")!.spec;
// `claude -p --output-format json` 實際回來的欄位（2.1.283 實測）
const cliJson = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "", stop_reason: "end_turn", usage: { output_tokens: 387 }, ...over });

describe("parseCliOutput", () => {
  it("有 structured_output 就用它，轉成 text block", () => {
    const m = parseCliOutput(cliJson({ structured_output: { a: 1 }, result: "說明文字" }));
    expect(m.content).toEqual([{ type: "text", text: '{"a":1}' }]);
    expect(m.stop_reason).toBe("end_turn");
    expect(m.usage?.output_tokens).toBe(387);
  });

  it("is_error：丟錯，帶上 API 狀態碼，designModel 才會回「忙碌」", () => {
    const run = () => parseCliOutput(cliJson({ is_error: true, subtype: "success", result: "API Error: 529 overloaded", api_error_status: 529 }));
    expect(run).toThrow(/overloaded/);
    try { run(); } catch (e) { expect((e as { status?: number }).status).toBe(529); }
  });

  it("不是 JSON：丟錯", () => {
    expect(() => parseCliOutput("Not logged in")).toThrow(/不是 JSON/);
  });
});

describe("cliCallModel", () => {
  it("參數：不用 --bare、關掉工具與設定、帶 model／effort／schema；對話從 stdin 送", async () => {
    let seen: { args: string[]; stdin: string } | null = null;
    const run: RunClaude = async (args, stdin) => { seen = { args, stdin }; return cliJson({ structured_output: { ok: true } }); };
    const call = cliCallModel({ model: "claude-opus-5-5", effort: "medium", schema: { type: "object" }, run });
    await call({ system: "SYS", messages: [{ role: "user", content: "做一台車" }], signal: new AbortController().signal, timeoutMs: 1000 });
    const a = seen!.args;
    expect(a).not.toContain("--bare");
    expect(a.slice(a.indexOf("--tools"), a.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
    expect(a.slice(a.indexOf("--setting-sources"), a.indexOf("--setting-sources") + 2)).toEqual(["--setting-sources", ""]);
    // 不帶 --mcp-config 的 strict 模式：不載入這台電腦設定的 MCP 工具（實測每次多約 6.4 萬個輸入 token）
    expect(a).toContain("--strict-mcp-config");
    expect(a[a.indexOf("--model") + 1]).toBe("claude-opus-5-5");
    expect(a[a.indexOf("--effort") + 1]).toBe("medium");
    expect(a[a.indexOf("--system-prompt") + 1]).toBe("SYS");
    expect(a[a.indexOf("--json-schema") + 1]).toBe('{"type":"object"}');
    expect(seen!.stdin).toBe("做一台車");
  });

  it("重試時把前一輪輸出和回饋攤平送進去", () => {
    const s = flattenMessages([
      { role: "user", content: "做一台車" },
      { role: "assistant", content: '{"version":1}' },
      { role: "user", content: "你的 JSON 不符合格式" },
    ]);
    expect(s).toContain("【使用者】\n做一台車");
    expect(s).toContain('【你先前的輸出】\n{"version":1}');
    expect(s.trimEnd().endsWith("你的 JSON 不符合格式")).toBe(true);
  });

  it("接 designModel：回正規化後的 spec", async () => {
    const run: RunClaude = async () => cliJson({ structured_output: house });
    const r = await designModel({ prompt: "小房子", size: "M" }, { callModel: cliCallModel({ model: "m", effort: "medium", schema: {}, run }) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.title).toBe(house.title);
  });
});

describe("runClaude（用 PATH 上的假 claude）", () => {
  const oldPath = process.env.PATH;
  afterEach(() => { process.env.PATH = oldPath; });
  function fakeClaude(script: string) {
    const dir = mkdtempSync(join(tmpdir(), "fake-claude-"));
    writeFileSync(join(dir, "claude"), `#!/bin/sh\n${script}\n`);
    chmodSync(join(dir, "claude"), 0o755);
    process.env.PATH = `${dir}:${oldPath}`;
  }

  it("stdin 送得進去、stdout 拿得回來", async () => {
    fakeClaude("cat");
    expect(await runClaude([], "hello", new AbortController().signal)).toBe("hello");
  });

  it("abort 會把 process 砍掉，回 AbortError", async () => {
    fakeClaude("exec sleep 10");
    const ctrl = new AbortController();
    const t0 = Date.now();
    setTimeout(() => ctrl.abort(), 50);
    await expect(runClaude([], "", ctrl.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("失敗而且沒輸出：錯誤訊息帶 stderr", async () => {
    fakeClaude("echo 'Not logged in' >&2; exit 1");
    await expect(runClaude([], "", new AbortController().signal)).rejects.toThrow(/Not logged in/);
  });
});
