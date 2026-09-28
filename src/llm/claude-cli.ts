// 沒有 API key 時的後端：在 server 端執行本機的 `claude -p`，用使用者自己的 Claude Code 登入（OAuth）。
// 只適合在自己的電腦上用：它用的是登入這台電腦的那個人的訂閱額度。
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { toApiSchema, toStructuredSchema } from "@/core/spec";
import type { CallModel, ChatMessage, ModelMessage } from "./design";
import { IdeasSchema } from "./ideas";
import { DESIGN_MODEL, IDEAS_MODEL } from "./models";

/** 要在 .env.local 明確寫 LLM_BACKEND=claude-cli 才會用，不自動偵測。 */
export function claudeCliEnabled(): boolean {
  return process.env.LLM_BACKEND === "claude-cli";
}

/** 跑一次 claude，回傳 stdout。測試時可以換成假的。 */
export type RunClaude = (args: string[], stdin: string, signal: AbortSignal) => Promise<string>;

/** 在暫存目錄執行一個 CLI（不會讀到這個專案的 CLAUDE.md 或檔案），stdin 送入內容，回傳 stdout。codex-cli 也用這個。 */
export function spawnCli(command: string, args: string[], stdin: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const onAbort = () => child.kill("SIGTERM");
    signal.addEventListener("abort", onAbort);
    child.on("error", (e) => {
      signal.removeEventListener("abort", onAbort);
      reject(e);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", onAbort);
      if (signal.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      if (code !== 0 && !out.trim()) return reject(new Error(`${command} 結束碼 ${code}：${err.trim().slice(0, 300)}`));
      resolve(out);
    });
    child.stdin.end(stdin);
  });
}

export const runClaude: RunClaude = (args, stdin, signal) => spawnCli("claude", args, stdin, signal);

/** 把多輪對話攤平成一段文字（claude -p 一次只吃一則使用者訊息）。 */
export function flattenMessages(messages: ChatMessage[]): string {
  if (messages.length === 1) return messages[0].content;
  const parts = messages.map((m) => `【${m.role === "user" ? "使用者" : "你先前的輸出"}】\n${m.content}`);
  return `以下是到目前為止的對話，請回應最後一則使用者訊息：\n\n${parts.join("\n\n")}`;
}

/** 把 `claude -p --output-format json` 的輸出轉成 designModel 用的格式。 */
export function parseCliOutput(stdout: string): ModelMessage {
  let d: {
    is_error?: boolean; subtype?: string; result?: string; structured_output?: unknown;
    stop_reason?: string | null; api_error_status?: number | null; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
  };
  try {
    d = JSON.parse(stdout);
  } catch {
    throw new Error(`claude 的輸出不是 JSON：${stdout.slice(0, 200)}`);
  }
  if (d.is_error || d.subtype !== "success") {
    const e = new Error(`claude 回報錯誤：${d.subtype ?? ""} ${String(d.result ?? "").slice(0, 200)}`);
    throw d.api_error_status ? Object.assign(e, { status: d.api_error_status }) : e;
  }
  const text = d.structured_output !== undefined && d.structured_output !== null ? JSON.stringify(d.structured_output) : (d.result ?? "");
  return { content: [{ type: "text", text }], stop_reason: d.stop_reason ?? "end_turn", usage: d.usage };
}

export function cliCallModel(opts: {
  model: string;
  effort: "low" | "medium" | "high";
  schema: Record<string, unknown>;
  run?: RunClaude;
}): CallModel {
  const run = opts.run ?? runClaude;
  return async ({ system, messages, signal }) => {
    const args = [
      "-p",
      "--output-format", "json",
      "--no-session-persistence",
      "--tools", "", // 不給任何工具，只要它回答
      "--setting-sources", "", // 不載入使用者的 settings、hooks、plugin 與 CLAUDE.md
      "--strict-mcp-config", // 沒給 --mcp-config，等於不載入任何 MCP 工具定義（不然每次多送數萬個輸入 token）
      "--model", opts.model,
      "--effort", opts.effort,
      "--system-prompt", system,
      "--json-schema", JSON.stringify(opts.schema),
    ];
    return parseCliOutput(await run(args, flattenMessages(messages), signal));
  };
}

export const cliDesignCallModel = cliCallModel({ model: DESIGN_MODEL, effort: "medium", schema: toApiSchema() });
export const cliIdeasCallModel = cliCallModel({ model: IDEAS_MODEL, effort: "low", schema: toStructuredSchema(IdeasSchema) });
