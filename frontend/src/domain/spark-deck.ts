import type { SparkCard, SparkChannel } from "./types";

export type { SparkCard, SparkChannel };

export const SPARK_CHANNELS: { id: SparkChannel; label: string }[] = [
  { id: "male", label: "男频" },
  { id: "female", label: "女频" },
  { id: "common", label: "通用" },
];

export function composeSpark(card: SparkCard): string {
  const lines = [card.hook, card.conflict, card.edge, ...card.details.map((detail) => `· ${detail}`)];
  return lines.filter((line) => String(line || "").trim()).join("\n");
}
