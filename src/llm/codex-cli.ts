// ChatGPT 訂閱（實驗性）：在本機執行官方 Codex CLI 的 `codex exec`，用登入這台電腦的 ChatGPT 帳號。
// OpenAI 建議程式化使用改用 API key，這條路只給自己在本機比較模型用；要在 .env.local 設 CODEX_CLI=1 才會出現。
// Codex 是 coding agent，每次呼叫會帶自己的系統提示與工具定義（實測約 3 萬個輸入 token），不是單純的模型呼叫。
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { toApiSchema } from "@/core/spec";
import { flattenMessages, spawnCli } from "./claude-cli";
import type { CallModel, ModelMessage } from "./design";

export function codexCliEnabled(): boolean {
  return process.env.CODEX_CLI === "1";
}

/**
 * `codex exec --json` 的事件流（codex-cli 0.155.1 實測）：每行一個事件，
 * `item.completed` 且 item.type 是 agent_message 的 text 是回答（可能有好幾則，取最後一則），`turn.completed` 表示正常結束並帶 token 用量。
 * cached_input_tokens 是 input_tokens 的一部分，不另外加。
 */
export function parseCodexJsonl(stdout: string): ModelMessage {
  let text: string | null = null;
  let usage: ModelMessage["usage"];
  let failure = "";
  let completed = false;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let e: { type?: string; item?: { type?: string; text?: string }; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string }; message?: string };
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "item.completed" && e.item?.type === "agent_message") text = e.item.text ?? "";
    else if (e.type === "turn.completed") {
      completed = true;
      if (e.usage) usage = { input_tokens: e.usage.input_tokens, output_tokens: e.usage.output_tokens };
    } else if (e.type === "turn.failed" || e.type === "error") failure = e.error?.message ?? e.message ?? line.slice(0, 200);
  }
  // 中途失敗或沒有正常結束，就算已經有回答也不採用
  if (failure && !completed) throw new Error(`codex 失敗：${failure}`);
  if (!completed) throw new Error(`codex 沒有正常結束：${stdout.slice(-200)}`);
  if (text === null) throw new Error("codex 沒有回答");
  return { content: [{ type: "text", text }], stop_reason: "end_turn", usage };
}

/** Codex 的權限設定（官方文件 permissions 的 file-access-limited-to-workspace），用 -c 帶入，因為不載入使用者的 config.toml */
export const WORKSPACE_ONLY = [
  "-c", 'default_permissions="workspace-only"',
  "-c", 'permissions.workspace-only.extends=":workspace"',
  "-c", 'permissions.workspace-only.filesystem={":root"="deny",":minimal"="read",":tmpdir"="deny",":slash_tmp"="deny"}',
];

let schemaFile: string | null = null;
/** --output-schema 要一個檔案：第一次呼叫時寫進暫存目錄，之後沿用。codex 也在那個目錄執行，而且只能碰這個目錄。 */
function schemaPath(): string {
  if (!schemaFile) {
    schemaFile = join(mkdtempSync(join(tmpdir(), "brick-talk-codex-")), "model-spec.schema.json");
    writeFileSync(schemaFile, JSON.stringify(toApiSchema()));
  }
  return schemaFile;
}

/** model 不給就用 Codex 的預設模型。推理強度設 medium，跟 Claude 這邊的 effort 一致。 */
export function codexCallModel(model?: string, run = spawnCli): CallModel {
  return async ({ system, messages, signal }) => {
    const schema = schemaPath();
    const args = [
      "exec", "--json",
      "--ignore-user-config", "--ignore-rules", // 不載入使用者的 config 與規則（少送約 6 千個 token，也不會受個人設定影響）
      "--ephemeral", "--skip-git-repo-check",
      "-C", dirname(schema),
      // 只能碰工作目錄（暫存目錄，裡面只有 schema），其他地方一律不能讀寫。
      // -s read-only 只擋寫入、不擋讀取，而且會蓋掉這組權限設定，所以不用它（2026-09-28 實測：用 read-only 時讀得到任意檔案）
      ...WORKSPACE_ONLY,
      "--output-schema", schema,
      "-c", 'model_reasoning_effort="medium"',
      ...(model ? ["-m", model] : []),
      "-", // prompt 從 stdin 讀
    ];
    return parseCodexJsonl(await run("codex", args, `${system}\n\n${flattenMessages(messages)}`, signal));
  };
}
