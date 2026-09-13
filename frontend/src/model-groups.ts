import type { ProviderPublic } from "./types";

export type ModelEntry = {
  providerId: string;
  providerName: string;
  protocol: string;
  model: string;
};

export type ModelGroup = {
  id: string;
  label: string;
  hint: string;
  items: ModelEntry[];
};

const RULES: { id: string; label: string; test: RegExp }[] = [
  { id: "deepseek", label: "DeepSeek", test: /deepseek/i },
  { id: "qwen", label: "通义千问", test: /qwen|qwq|tongyi/i },
  { id: "zhipu", label: "智谱", test: /glm|chatglm|zhipu/i },
  { id: "kimi", label: "Kimi", test: /kimi|moonshot/i },
  { id: "minimax", label: "MiniMax", test: /minimax/i },
  { id: "openai", label: "OpenAI", test: /gpt-|o[1-4]-|chatgpt|openai/i },
  { id: "anthropic", label: "Anthropic", test: /claude/i },
  { id: "gemini", label: "Gemini", test: /gemini/i },
  { id: "llama", label: "Llama", test: /llama|mixtral|groq/i },
];

export function familyOf(model: string) {
  const id = String(model || "");
  return RULES.find((row) => row.test.test(id)) || { id: "other", label: "其他" };
}

export function stampOf(label: string) {
  const ch = Array.from(String(label || "模").trim())[0];
  return ch || "模";
}

export function shortModel(model: string, keep = 18) {
  const text = String(model || "").trim();
  if (text.length <= keep) return text;
  return `${text.slice(0, keep - 1)}…`;
}

export function groupModels(providers: ProviderPublic[]): ModelGroup[] {
  const buckets = new Map<string, ModelGroup>();
  const ensure = (id: string, label: string, hint: string) => {
    let group = buckets.get(id);
    if (!group) {
      group = { id, label, hint, items: [] };
      buckets.set(id, group);
    }
    return group;
  };

  for (const provider of providers || []) {
    const ids = [...new Set([...(provider.models || []), provider.model].map((id) => String(id || "").trim()).filter(Boolean))];
    if (!ids.length) {
      const group = ensure(`pv:${provider.id}`, provider.name || "未命名", "尚未拉取模型");
      group.items.push({
        providerId: provider.id,
        providerName: provider.name,
        protocol: provider.protocol,
        model: "",
      });
      continue;
    }
    for (const model of ids) {
      const family = familyOf(model);
      const group = ensure(family.id, family.label, provider.name || "");
      if (!group.items.some((item) => item.providerId === provider.id && item.model === model)) {
        group.items.push({
          providerId: provider.id,
          providerName: provider.name,
          protocol: provider.protocol,
          model,
        });
      }
    }
  }

  return [...buckets.values()].map((group) => {
    const names = [...new Set(group.items.map((item) => item.providerName).filter(Boolean))];
    const counted = group.items.filter((item) => item.model).length;
    return {
      ...group,
      hint: counted ? `${counted} 个模型` : names[0] || group.hint,
    };
  });
}
