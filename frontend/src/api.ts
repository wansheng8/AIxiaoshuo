import type { AigcReport, CraftOverride, Element, Lexicon, Novel, NovelCard, PromptPreview, ScanIssue, Settings, Skill, SkillExportBundle, SkillHistoryItem, Teardown, TeardownCard, TeardownChapter, Voice, VoiceExport } from "./types";

export class ConflictError extends Error {
  currentRev: number;
  constructor(message: string, currentRev: number) {
    super(message);
    this.name = "ConflictError";
    this.currentRev = currentRev;
  }
}

export class AuthRequiredError extends Error {
  constructor(message = "需要访问密码") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new AuthRequiredError(data.error || "需要访问密码");
    }
    if (res.status === 409 && data.conflict) {
      throw new ConflictError(data.error || "内容已在别处被改动", Number(data.currentRev) || 0);
    }
    throw new Error(data.error || data.message || "请求失败");
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>("/api/health"),
  authStatus: () => request<{ required: boolean; ok: boolean }>("/api/auth"),
  login: (password: string) =>
    request<{ ok: boolean; required: boolean }>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
  settings: () => request<Settings>("/api/settings"),
  saveSettings: (body: {
    activeId?: string;
    providers?: Array<{
      id?: string;
      vendor?: string;
      name?: string;
      protocol?: string;
      baseUrl?: string;
      model?: string;
      apiKey?: string;
      note?: string;
      contextLength?: number;
      maxTokens?: number;
      temperature?: number;
      thinking?: boolean;
      retryAttempts?: number;
      retryBaseMs?: number;
      retryMaxMs?: number;
      models?: string[];
    }>;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
    note?: string;
    contextLength?: number;
    maxTokens?: number;
    temperature?: number;
    thinking?: boolean;
    retryAttempts?: number;
    retryBaseMs?: number;
    retryMaxMs?: number;
    protocol?: string;
  }) => request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  testSettings: (body?: { baseUrl?: string; apiKey?: string; protocol?: string; model?: string; providerId?: string }) =>
    request<{ ok: boolean; reply: string }>("/api/settings/test", { method: "POST", body: JSON.stringify(body || {}) }),
  listModels: (body?: { baseUrl?: string; apiKey?: string; protocol?: string; providerId?: string }) =>
    request<{ models: string[] }>("/api/settings/models", { method: "POST", body: JSON.stringify(body || {}) }),
  projects: () => request<NovelCard[]>("/api/projects"),
  archivedProjects: () => request<NovelCard[]>("/api/projects?archived=1"),
  createProject: (body: { title: string; genre: string; logline: string }) =>
    request<Novel>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  importProject: (body: { markdown?: string; novel?: Partial<Novel> }) =>
    request<Novel>("/api/projects/import", { method: "POST", body: JSON.stringify(body) }),
  sparkProject: (body: { idea: string; prefs?: Record<string, string[]> }) =>
    request<Novel>("/api/projects/spark", { method: "POST", body: JSON.stringify(body) }),
  project: (id: string) => request<Novel>(`/api/projects/${id}`),
  saveProject: (id: string, body: Partial<Novel>) =>
    request<Novel>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  archiveProject: (id: string) => request(`/api/projects/${id}`, { method: "DELETE" }),
  restoreProject: (id: string) => request<Novel>(`/api/projects/${id}/restore`, { method: "POST" }),
  duplicateProject: (id: string) => request<Novel>(`/api/projects/${id}/duplicate`, { method: "POST" }),
  purgeProject: (id: string) => request(`/api/projects/${id}/purge`, { method: "DELETE" }),
  scan: (id: string, body: { chapterId?: string; text?: string; lexicon?: Lexicon }) =>
    request<{ issues: ScanIssue[]; nouns: string[]; aigc?: AigcReport }>(`/api/projects/${id}/scan`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  proof: (id: string, body: { chapterId?: string; text?: string; lexicon?: Lexicon }) =>
    request<{ text: string; issues: ScanIssue[]; nouns: string[]; aigc?: AigcReport }>(`/api/projects/${id}/proof`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  imitateAnalyze: (text: string) =>
    request<{ dims: Record<string, number>; report: string; skeleton: string; chars: number }>("/api/imitate/analyze", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  imitateMerge: (library: unknown[]) =>
    request<{ dims: Record<string, number>; skeleton: string }>("/api/imitate/merge", {
      method: "POST",
      body: JSON.stringify({ library }),
    }),
  imitateCompare: (dims: Record<string, number>, text: string) =>
    request<{ rows: { key: string; label: string; want: number; got: number; diff: number }[] }>("/api/imitate/compare", {
      method: "POST",
      body: JSON.stringify({ dims, text }),
    }),
  skills: () => request<Skill[]>("/api/skills"),
  createSkill: (body: {
    name: string;
    scene: string;
    target: string;
    body: string;
    elements?: string[];
    tags?: string[];
    whenFlow?: string[];
    whenPlatform?: string[];
    whenVoice?: string;
  }) => request<Skill>("/api/skills", { method: "POST", body: JSON.stringify(body) }),
  generateSkill: (body: { idea: string; target?: string }) =>
    request<{ name: string; scene: string; target: string; body: string }>("/api/skills/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateSkill: (id: string, body: Partial<Skill>) =>
    request<Skill>(`/api/skills/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteSkill: (id: string) => request<{ ok: boolean }>(`/api/skills/${id}`, { method: "DELETE" }),
  restoreSkill: (id: string) => request<Skill>(`/api/skills/${id}/restore`, { method: "POST" }),
  restoreAllSkills: () => request<{ restored: string[] }>("/api/skills/restore-all", { method: "POST" }),
  cloneSkill: (id: string) => request<Skill>(`/api/skills/${id}/clone`, { method: "POST" }),
  exportSkills: (ids?: string[]) =>
    request<SkillExportBundle>(`/api/skills/export${ids && ids.length ? `?ids=${encodeURIComponent(ids.join(","))}` : ""}`),
  importSkills: (bundle: unknown) =>
    request<{ created: string[] }>("/api/skills/import", { method: "POST", body: JSON.stringify(bundle) }),
  exportSkillMarkdown: async (id: string) => {
    const res = await fetch(`/api/skills/${id}/markdown`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "导出失败");
    }
    return res.text();
  },
  importSkillMarkdown: (markdown: string, filename?: string) =>
    request<Skill>("/api/skills/import-markdown", { method: "POST", body: JSON.stringify({ markdown, filename }) }),
  skillHistory: (id: string) => request<SkillHistoryItem[]>(`/api/skills/${id}/history`),
  skillHistoryEntry: (id: string, entry: string) =>
    request<{ id: string; at: string; note: string; body: string }>(`/api/skills/${id}/history/${entry}`),
  restoreSkillHistory: (id: string, entry: string) =>
    request<Skill>(`/api/skills/${id}/history/${entry}/restore`, { method: "POST" }),
  clearSkillHistory: (id: string) => request<{ ok: boolean }>(`/api/skills/${id}/history`, { method: "DELETE" }),
  previewPrompt: (body: {
    projectId?: string;
    skillId: string;
    chapterId?: string;
    extra?: string;
    selection?: string;
    cursorPrefix?: string;
    include?: Record<string, boolean>;
    focusName?: string;
    tokenBudget?: number;
  }) => request<PromptPreview>("/api/prompt/preview", { method: "POST", body: JSON.stringify(body) }),
  elements: () => request<Element[]>("/api/elements"),
  createElement: (body: { name: string; desc?: string; scope?: string; body: string; order?: number }) =>
    request<Element>("/api/elements", { method: "POST", body: JSON.stringify(body) }),
  updateElement: (id: string, body: Partial<Element>) =>
    request<Element>(`/api/elements/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  resetElement: (id: string) => request<Element>(`/api/elements/${id}/reset`, { method: "POST" }),
  deleteElement: (id: string) => request<{ ok: boolean }>(`/api/elements/${id}`, { method: "DELETE" }),
  craftOverrides: () => request<CraftOverride[]>("/api/skills/craft-overrides"),
  deleteCraftOverride: (id: string) =>
    request<{ ok: boolean }>(`/api/skills/craft-overrides/${id}`, { method: "DELETE" }),
  voice: () => request<Voice>("/api/voice"),
  saveVoice: (body: { enabled?: boolean; body?: string; summary?: string }) =>
    request<Voice>("/api/voice", { method: "PUT", body: JSON.stringify(body) }),
  addVoiceSamples: (body: { title?: string; text?: string; samples?: Array<{ title?: string; text?: string }> }) =>
    request<Voice>("/api/voice/samples", { method: "POST", body: JSON.stringify(body) }),
  removeVoiceSample: (id: string) =>
    request<Voice>(`/api/voice/samples/${id}`, { method: "DELETE" }),
  clearVoiceSamples: () => request<Voice>("/api/voice/samples", { method: "DELETE" }),
  exportVoice: () => request<VoiceExport>("/api/voice/export"),
  importVoice: (bundle: unknown) =>
    request<Voice>("/api/voice/import", { method: "POST", body: JSON.stringify(bundle) }),
  importVoiceNovel: (body: { title?: string; text: string; from?: number; to?: number }) =>
    request<{ voice: Voice; total: number; used: number; chars: number }>("/api/voice/import-novel", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  clearVoice: () => request<Voice>("/api/voice", { method: "DELETE" }),
  buildVoice: () => request<Voice>("/api/voice/build", { method: "POST" }),
  reviseVoice: (body: { before: string; after: string }) =>
    request<Voice>("/api/voice/revise", { method: "POST", body: JSON.stringify(body) }),
  previewVoice: (body: { prompt?: string }) =>
    request<{ text: string }>("/api/voice/preview", { method: "POST", body: JSON.stringify(body) }),
  teardowns: (archived = false) => request<TeardownCard[]>(`/api/teardowns${archived ? "?archived=1" : ""}`),
    teardown: (id: string) => request<Teardown>(`/api/teardowns/${id}`),
    teardownChapter: (id: string, cid: string) =>
      request<TeardownChapter>(`/api/teardowns/${id}/chapters/${cid}`),
    createTeardown: (body: { title: string }) =>
    request<Teardown>("/api/teardowns", { method: "POST", body: JSON.stringify(body) }),
  importTeardown: (body: { id?: string; title?: string; markdown: string; sourceName?: string }) =>
    request<Teardown>("/api/teardowns/import", { method: "POST", body: JSON.stringify(body) }),
  saveTeardown: (id: string, body: { title?: string; scopeEnd?: number }) =>
    request<Teardown>(`/api/teardowns/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  archiveTeardown: (id: string) => request<{ ok: boolean }>(`/api/teardowns/${id}`, { method: "DELETE" }),
  restoreTeardown: (id: string) =>
    request<Teardown>(`/api/teardowns/${id}/restore`, { method: "POST" }),
  purgeTeardown: (id: string) =>
    request<{ ok: boolean }>(`/api/teardowns/${id}/purge`, { method: "DELETE" }),
};

export type GenerateHandlers = {
  onMeta?: (meta: { skillId: string; skillName: string; target: string; chapterId: string; missing: string[] }) => void;
  onToken: (text: string) => void;
  onDone?: (info: { chars: number; stopped?: boolean; incomplete?: boolean; message?: string }) => void;
  onSaved?: (info: { rev: number }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

async function readSse(res: Response, handlers: GenerateHandlers) {
  if (!res.body) throw new Error("无流式响应");
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let failed = "";
  const takeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    let payload: {
      type: string;
      text?: string;
      message?: string;
      chars?: number;
      stopped?: boolean;
      incomplete?: boolean;
      rev?: number;
      skillId?: string;
      skillName?: string;
      target?: string;
      chapterId?: string;
      missing?: string[];
    };
    try {
      payload = JSON.parse(trimmed.slice(5).trim());
    } catch {
      return;
    }
    if (payload.type === "meta") {
      handlers.onMeta?.({
        skillId: payload.skillId || "",
        skillName: payload.skillName || "",
        target: payload.target || "",
        chapterId: payload.chapterId || "",
        missing: payload.missing || [],
      });
    }
    if (payload.type === "token" && payload.text) handlers.onToken(payload.text);
    if (payload.type === "done") {
      handlers.onDone?.({
        chars: payload.chars || 0,
        stopped: payload.stopped,
        incomplete: payload.incomplete,
        message: payload.message,
      });
    }
    if (payload.type === "saved" && typeof payload.rev === "number") handlers.onSaved?.({ rev: payload.rev });
    if (payload.type === "error" && payload.message) {
      handlers.onError?.(payload.message);
      failed = payload.message;
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) takeLine(line);
  }
  if (buffer.trim()) takeLine(buffer);
  if (failed) throw new Error(failed);
}

export async function generate(
  body: {
    projectId: string;
    skillId: string;
    chapterId?: string;
    extra?: string;
    selection?: string;
    cursorPrefix?: string;
    include?: Record<string, boolean>;
    focusName?: string;
    mode?: "replace" | "append";
  },
  handlers: GenerateHandlers
) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "生成失败" }));
    throw new Error(data.error || "生成失败");
  }
  await readSse(res, handlers);
}

export async function generateTeardown(
  id: string,
  body: { skillId: string; extra?: string; fromIndex?: number },
  handlers: GenerateHandlers
) {
  const res = await fetch(`/api/teardowns/${id}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "生成失败" }));
    throw new Error(data.error || "生成失败");
  }
  await readSse(res, handlers);
}
