import { describe, expect, it } from "vitest";
import { getFixture } from "@/fixtures";
import { type CallModel, designModel, type ModelMessage, responseText } from "./design";
import { mockDesign } from "./mock";
import { buildSystemPrompt } from "./prompt";

const house = getFixture("demo-house")!.spec;
// 真實回應的樣子：thinking block 在最前面
const reply = (json: unknown, stop_reason = "end_turn"): ModelMessage => ({
  content: [{ type: "thinking" }, { type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
  stop_reason,
  usage: { output_tokens: 1000 },
});
const twoPieces = {
  version: 1, title: "兩塊", summary: "", size: { x: 12, y: 6, z: 3 },
  shapes: [
    { shape: "box", op: "add", color: "Red", label: "左塔", mirror: "none", min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 3, z: 3 } },
    { shape: "box", op: "add", color: "Blue", label: "右塔", mirror: "none", min: { x: 8, y: 0, z: 0 }, max: { x: 11, y: 3, z: 3 } },
  ],
};

function fake(replies: (ModelMessage | Error)[]) {
  const calls: Parameters<CallModel>[0][] = [];
  const callModel: CallModel = async (args) => {
    calls.push({ ...args, messages: [...args.messages] });
    const r = replies[calls.length - 1];
    if (!r) throw new Error("沒有準備這一次的回應");
    if (r instanceof Error) throw r;
    return r;
  };
  return { calls, callModel };
}

describe("designModel", () => {
  it("用 type 找文字，thinking block 在前面也拿得到", () => {
    expect(responseText(reply({ a: 1 }))).toBe('{"a":1}');
  });

  it("第一次就成功：回正規化後的 spec", async () => {
    const f = fake([reply(house)]);
    const r = await designModel({ prompt: "小房子", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.title).toBe(house.title);
      expect(r.meta.attempts).toBe(1);
      expect(r.meta.outputTokens).toBe(1000);
    }
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].timeoutMs).toBe(120_000);
  });

  it("結構錯誤：附上錯誤訊息重試一次", async () => {
    const f = fake([reply({ version: 1, title: "x" }), reply(house)]);
    const r = await designModel({ prompt: "小房子", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    expect(f.calls).toHaveLength(2);
    const feedback = f.calls[1].messages.at(-1)!;
    expect(feedback.role).toBe("user");
    expect(feedback.content).toContain("不符合格式");
    expect(f.calls[1].messages.at(-2)!.role).toBe("assistant");
  });

  it("品質不過（分成兩塊）：回饋裡點名部位，重試後成功", async () => {
    const f = fake([reply(twoPieces), reply(house)]);
    const r = await designModel({ prompt: "兩座塔", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    expect(f.calls[1].messages.at(-1)!.content).toMatch(/分成 2 塊.*「右塔」|「左塔」/);
  });

  it("兩次都結構錯誤：回失敗，不回空模型", async () => {
    const f = fake([reply("not json"), reply({ version: 2 })]);
    const r = await designModel({ prompt: "x", size: "S" }, { callModel: f.callModel });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("沒設計成功");
  });

  it("兩次都只剩品質問題：還是回模型，問題放在警告第一條", async () => {
    const f = fake([reply(twoPieces), reply(twoPieces)]);
    const r = await designModel({ prompt: "兩座塔", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings[0]).toContain("分成 2 塊");
  });

  it("有部位整塊懸空被移除（即使不到四成）：回饋點名部位，提醒 z 半徑要除以 1.2", async () => {
    const floating = { version: 1, title: "貓", summary: "", size: { x: 10, y: 10, z: 12 }, shapes: [
      { shape: "box", op: "add", color: "Orange", label: "身體", mirror: "none", min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 6 } },
      { shape: "box", op: "add", color: "Orange", label: "頭", mirror: "none", min: { x: 3, y: 3, z: 7 }, max: { x: 7, y: 7, z: 10 } },
    ] };
    const f = fake([reply(floating), reply(house)]);
    const r = await designModel({ prompt: "貓", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    const feedback = f.calls[1].messages.at(-1)!.content;
    expect(feedback).toContain("「頭」");
    expect(feedback).toContain("懸在空中");
    expect(feedback).toContain("除以 1.2");
  });

  it("大尺寸第一次呼叫可以用到 200 秒", async () => {
    const f = fake([reply(house)]);
    await designModel({ prompt: "小房子", size: "L" }, { callModel: f.callModel });
    expect(f.calls[0].timeoutMs).toBe(200_000);
  });

  it("磚很多也不再要求縮小（拿掉磚數上限）", async () => {
    const huge = { version: 1, title: "大方塊", summary: "", size: { x: 32, y: 32, z: 24 },
      shapes: [{ shape: "box", op: "add", color: "Red", label: "方塊", mirror: "none", min: { x: 0, y: 0, z: 0 }, max: { x: 32, y: 32, z: 24 } }] };
    const f = fake([reply(huge)]);
    const r = await designModel({ prompt: "大方塊", size: "L" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
    expect(f.calls).toHaveLength(1);
  });

  it("剩下的時間不到 40 秒就不重試", async () => {
    let t = 0;
    const f = fake([reply("not json"), reply(house)]);
    const callModel: CallModel = async (args) => { t += 140_000; return f.callModel(args); };
    const r = await designModel({ prompt: "x", size: "M" }, { callModel, now: () => t });
    expect(r.ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });

  it("單次呼叫超過時間就中止，不管 SDK 的 timeout 有沒有涵蓋串流", async () => {
    let seenSignal: AbortSignal | null = null;
    const callModel: CallModel = ({ signal }) => new Promise((_, reject) => {
      seenSignal = signal;
      signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const t0 = Date.now();
    const r = await designModel({ prompt: "x", size: "M" }, { callModel, firstCallMs: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("花太久");
    expect(seenSignal!.aborted).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("max_tokens 截斷：請它把形狀減半", async () => {
    const f = fake([reply('{"version":1,"ti', "max_tokens"), reply(house)]);
    const r = await designModel({ prompt: "x", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(true);
    expect(f.calls[1].messages.at(-1)!.content).toContain("減半");
  });

  it("refusal：直接失敗", async () => {
    const f = fake([reply("", "refusal")]);
    const r = await designModel({ prompt: "x", size: "M" }, { callModel: f.callModel });
    expect(r.ok).toBe(false);
    expect(f.calls).toHaveLength(1);
  });

  it("429：回「Claude 暫時忙碌」", async () => {
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    const r = await designModel({ prompt: "x", size: "M" }, { callModel: fake([err]).callModel });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("忙碌");
  });
});

describe("prompt 與 mock", () => {
  it("system prompt 有座標、單位規則、22 色、尺寸上限與兩個範例", () => {
    const p = buildSystemPrompt("S");
    expect(p).toContain("y = 0 是正面");
    expect(p).toContain("一律用 stud");
    expect(p).toContain("Dark Bluish Gray（深灰色）");
    expect(p).toContain("12 × 12 × 10");
    expect(p).toContain("紅屋頂小房子");
    expect(p).toContain("黃色小鴨");
  });

  it("要求用滿尺寸；形狀數、格子數上限跟著尺寸寫進 prompt", () => {
    expect(buildSystemPrompt("M")).toContain("至少要用到那個方向上限的八成");
    const xl = buildSystemPrompt("XL");
    expect(xl).toContain("最多可以用 150 個形狀");
    expect(xl).toContain("一個 cells 形狀最多 256 格");
  });

  it("mock 依關鍵字回示範模型", () => {
    expect(mockDesign("一隻小鴨", "M").spec.title).toBe("黃色小鴨");
    expect(mockDesign("隨便", "M").spec.title).toBe("紅屋頂小房子");
  });
});
