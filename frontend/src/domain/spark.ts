import dims from "@shared/spark-dims.json";

export const UNSET = "不限定";

export type SparkPrefKey =
  | "genres"
  | "romance"
  | "hooks"
  | "heroes"
  | "leads"
  | "povs"
  | "tones"
  | "endings"
  | "length"
  | "pace"
  | "platforms";

export type SparkPrefs = Record<SparkPrefKey, string[]>;

export type SparkDim = {
  key: SparkPrefKey;
  label: string;
  multiple: boolean;
  hint: string;
  wide?: boolean;
  options: string[];
};

export const SPARK_DIMS = dims as unknown as SparkDim[];

export const SPARK_MULTI_LIMIT = 3;

export function emptySparkPrefs(): SparkPrefs {
  return Object.fromEntries(SPARK_DIMS.map((dim) => [dim.key, []])) as unknown as SparkPrefs;
}

export function toggleSparkPref(prefs: SparkPrefs, key: SparkPrefKey, option: string, multiple: boolean): SparkPrefs {
  if (option === UNSET) return { ...prefs, [key]: [] };
  const cur = prefs[key] || [];
  const has = cur.includes(option);
  if (multiple) {
    if (has) return { ...prefs, [key]: cur.filter((item) => item !== option) };
    if (cur.length >= SPARK_MULTI_LIMIT) return prefs;
    return { ...prefs, [key]: [...cur, option] };
  }
  return { ...prefs, [key]: has ? [] : [option] };
}

export function addSparkPref(prefs: SparkPrefs, key: SparkPrefKey, option: string, multiple: boolean): SparkPrefs {
  const text = option.replace(/\s+/g, " ").trim().slice(0, 48);
  if (!text || text === UNSET) return prefs;
  const cur = prefs[key] || [];
  if (cur.includes(text)) return prefs;
  if (multiple) {
    if (cur.length >= SPARK_MULTI_LIMIT) return prefs;
    return { ...prefs, [key]: [...cur, text] };
  }
  return { ...prefs, [key]: [text] };
}

export function applySparkPicks(prefs: SparkPrefs, picks?: Record<string, string[]>): SparkPrefs {
  if (!picks || typeof picks !== "object") return prefs;
  let next = prefs;
  for (const dim of SPARK_DIMS) {
    const values = Array.isArray(picks[dim.key]) ? picks[dim.key] : [];
    for (const raw of values) {
      const value = String(raw || "").trim();
      if (!value) continue;
      if (!dim.multiple && (next[dim.key] || []).length > 0) continue;
      next = addSparkPref(next, dim.key, value, dim.multiple);
    }
  }
  return next;
}

export function sparkPrefsPicked(prefs: SparkPrefs) {
  return SPARK_DIMS.some((dim) => (prefs[dim.key] || []).length > 0);
}
