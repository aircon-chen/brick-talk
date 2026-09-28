// 示範模型：demo、測試資料、system prompt 範例共用。
import car from "./models/car.json";
import duck from "./models/duck.json";
import house from "./models/house.json";
import robot from "./models/robot.json";
import tree from "./models/tree.json";
import type { ModelSpec, SizeTier } from "../core/spec";

export type Fixture = { id: string; key: string; name: string; tier: SizeTier; spec: ModelSpec };

export const FIXTURES: Fixture[] = [
  { id: "demo-house", key: "house", name: "房子", tier: "M", spec: house as ModelSpec },
  { id: "demo-duck", key: "duck", name: "小鴨", tier: "M", spec: duck as ModelSpec },
  { id: "demo-car", key: "car", name: "跑車", tier: "M", spec: car as ModelSpec },
  { id: "demo-tree", key: "tree", name: "聖誕樹", tier: "M", spec: tree as ModelSpec },
  { id: "demo-robot", key: "robot", name: "機器人", tier: "M", spec: robot as ModelSpec },
];

export function getFixture(id: string): Fixture | undefined {
  return FIXTURES.find((f) => f.id === id);
}
