export const STORAGE_KEYS = {
  last: "moshu.last",
  lastTeardown: "moshu.lastTeardown",
  readerSize: "moshu.readerSize",
  nightRead: "moshu.nightRead",
  railCollapsed: "moshu.railCollapsed",
  railFolded: "moshu.railFolded",
  folds: "moshu.folds",
  voiceDraft: "moshu.voice.draft",
  chapter: (novelId: string) => `moshu.ch.${novelId}`,
  ui: (novelId: string) => `moshu.ui.${novelId}`,
  skipNovel: (novelId: string) => `moshu.skip.novel.${novelId}`,
  skipChapter: (novelId: string, chapterId: string) => `moshu.skip.chapter.${novelId}.${chapterId}`,
  teardownTab: (teardownId: string) => `moshu.tearTab.${teardownId}`,
  teardownSkip: (teardownId: string) => `moshu.tdskip.${teardownId}`,
} as const;

export function readText(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function writeText(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 存储不可用时仅保留会话内状态 */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 存储不可用时仅保留会话内状态 */
  }
}
