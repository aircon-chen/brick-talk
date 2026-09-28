import { describe, expect, it } from "vitest";
import { toStructuredSchema } from "@/core/spec";
import type { CallModel } from "./design";
import { IdeasSchema, MOCK_IDEAS, suggestIdeas } from "./ideas";

const reply = (obj: unknown): CallModel => async () => ({
  content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(obj) }], stop_reason: "end_turn",
});

describe("點子模式", () => {
  it("取前 3 個合法的點子", async () => {
    const ideas = await suggestIdeas("動物", reply({ ideas: [...MOCK_IDEAS, MOCK_IDEAS[0]] }));
    expect(ideas).toHaveLength(3);
  });
  it("格式不對就回 null", async () => {
    expect(await suggestIdeas("", reply({ ideas: [{ title: "x" }] }))).toBeNull();
    expect(await suggestIdeas("", async () => { throw new Error("boom"); })).toBeNull();
  });
  it("schema 可以給 structured outputs 用", () => {
    const text = JSON.stringify(toStructuredSchema(IdeasSchema));
    expect(text).not.toContain('"$schema"');
    expect(text).toContain('"additionalProperties":false');
  });
});
