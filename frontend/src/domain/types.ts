export type Chapter = {
  id: string;
  index: number;
  title: string;
  beats: string;
  content: string;
  wordCount: number;
  updatedAt: string;
  mood?: string;
  emotionStart?: number;
  emotionEnd?: number;
  reviewReport?: string;
  reviewVerdict?: string;
  reviewAt?: string;
  advice?: string;
};

export type LogItem = {
  id: string;
  skillId: string;
  skillName?: string;
  chapterId: string;
  startedAt: string;
  endedAt: string;
  status: string;
  outputChars: number;
  error: string;
  focusName?: string;
};

export type HistoryItem = {
  id: string;
  skillId: string;
  skillName?: string;
  target: string;
  focusName?: string;
  output: string;
  createdAt: string;
};

export type ThreadStatus = "open" | "paid" | "dropped";

export type ThreadItem = {
  id: string;
  name: string;
  plant: string;
  payoff: string;
  status: ThreadStatus;
  note: string;
};

export type CraftFlags = {
  subtext: boolean;
  noCheat: boolean;
  staySmart: boolean;
  tighten: boolean;
  payoff: boolean;
  density: "密" | "中" | "疏";
  tone: number;
  pace: number;
  talk: number;
  mood: string;
  intensity: number;
  emotionStyle: string;
  showDontTell: boolean;
  cleanCopy: boolean;
  voiceSample: string;
  flow: string;
  platform: string;
  goldenFinger: string;
  requiredBeats: string;
  imitateOn: boolean;
  imitate: string;
  imitateNotes: string;
  imitateDims: Record<string, number>;
  imitateLib: ImitateSample[];
  wordsMin: number;
  wordsMax: number;
};

export type ImitateSample = {
  id: string;
  title: string;
  platform: string;
  genre: string;
  style: string;
  check: string;
  excerpt: string;
  report: string;
  skeleton: string;
  dims: Record<string, number> | null;
};

export type Lexicon = {
  keep: string[];
  map: { from: string; to: string }[];
};

export type AigcReason = {
  id: string;
  label: string;
  score: number;
  note: string;
  count?: number;
};

export type AigcReport = {
  rate: number;
  level: "low" | "mid" | "high";
  chars: number;
  reasons: AigcReason[];
};

export type ScanIssue = {
  id: string;
  kind: "typo" | "emotion" | "name" | "ai";
  original: string;
  suggest: string;
  start: number;
  end: number;
  reason: string;
};

export type Novel = {
  id: string;
  title: string;
  logline: string;
  genre: string;
  status: string;
  updatedAt: string;
  rev?: number;
  brief: string;
  world: string;
  characters: string;
  outline: string;
  props?: string;
  media?: Record<string, string>;
  history?: HistoryItem[];
  chapters: Chapter[];
  logs: LogItem[];
  style?: string;
  theme?: string;
  pov?: string;
  threads?: ThreadItem[];
  craft?: CraftFlags;
  lexicon?: Lexicon;
};

export type NovelCard = {
  id: string;
  title: string;
  logline: string;
  genre: string;
  updatedAt: string;
  chapterCount: number;
  wordCount: number;
  status?: string;
};

export type VoiceSample = {
  id: string;
  title: string;
  chars: number;
  createdAt: string;
  excerpt: string;
};

export type VoiceRevision = {
  id: string;
  at: string;
  before: string;
  after: string;
  body?: string;
};

export type Voice = {
  enabled: boolean;
  summary: string;
  body: string;
  updatedAt: string;
  builtAt: string;
  stale: boolean;
  revisions: VoiceRevision[];
  limit: number;
  minChars: number;
  promptChars: number;
  promptBudget: number;
  targets: string[];
  samples: VoiceSample[];
};

export type VoiceExport = {
  version: number;
  exportedAt: string;
  enabled: boolean;
  body: string;
  samples: Array<{ title: string; text: string }>;
};

export type Skill = {
  id: string;
  name: string;
  scene: string;
  target: string;
  stage?: string;
  stageLabel?: string;
  order: number;
  enabled: boolean;
  source: "builtin" | "custom";
  body: string;
  updatedAt?: string;
  inject?: string;
  upgraded?: boolean;
  factoryBody?: string;
  craftBody?: string;
  craftRules?: string[];
  elements?: string[];
  defaultElements?: string[];
  tags?: string[];
  whenFlow?: string[];
  whenPlatform?: string[];
  whenVoice?: string;
};

export type Element = {
  id: string;
  name: string;
  desc: string;
  scope: string;
  order: number;
  body: string;
  builtin: boolean;
  dynamic: boolean;
  customized: boolean;
};

export type SkillHistoryItem = {
  id: string;
  at: string;
  note: string;
  chars: number;
};

export type PromptPart = {
  key: string;
  label: string;
  injected: boolean;
  chars: number;
  tokens: number;
  text: string;
};

export type PromptPreview = {
  skillId: string;
  skillName: string;
  target: string;
  chapterId: string;
  writing: boolean;
  voiceActive: boolean;
  missing: string[];
  dropped: string[];
  warnings: string[];
  metrics: {
    systemChars: number;
    userChars: number;
    systemTokens: number;
    userTokens: number;
    estTokens: number;
  };
  parts: PromptPart[];
  system: string;
  user: string;
  stub: boolean;
};

export type CraftOverride = {
  id: string;
  name: string;
  scene: string;
  updatedAt?: string;
  legacy: boolean;
  parent: string;
  chars: number;
  slots: string[];
};

export type SkillExportBundle = {
  version: number;
  exportedAt: string;
  skills: Array<{
    name: string;
    scene: string;
    target: string;
    order: number;
    enabled: boolean;
    inject?: string;
    body: string;
    elements?: string[];
  }>;
};

export type TeardownChapter = {
  id: string;
  index: number;
  title: string;
  content: string;
  wordCount: number;
  beat: string;
};

export type TeardownTabs = {
  beats: number;
  cast: number;
  golden: number;
  events: number;
  outline: number;
  "outline-detail": number;
  "outline-fine": number;
  imitate: number;
};

export type TeardownCard = {
  id: string;
  title: string;
  sourceName: string;
  updatedAt: string;
  chapterCount: number;
  scopeEnd: number;
  wordCount: number;
  status?: string;
  skillId?: string;
  tabs?: TeardownTabs;
};

export type Teardown = TeardownCard & {
  importedAt: string;
  chapters: TeardownChapter[];
  beats: string;
  cast: string;
  golden: string;
  events: string;
  outline: string;
  outlineDetail: string;
  outlineFine: string;
  recipes?: string;
  imitate?: string;
};

export type ProtocolInfo = {
  id: string;
  label: string;
  hint: string;
  auth: string;
};

export type VendorPreset = {
  id: string;
  name: string;
  protocol: string;
  baseUrl: string;
  model: string;
};

export type ModelProbe = {
  ok: boolean;
  ms: number;
  reason: string;
  at: string;
  stale: boolean;
};

export type ProviderPublic = {
  id: string;
  vendor: string;
  name: string;
  protocol: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  note: string;
  contextLength: number;
  maxTokens: number;
  temperature: number;
  thinking: boolean;
  retryAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  models?: string[];
  probes?: Record<string, ModelProbe>;
};

export type Settings = {
  protocol: string;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  note: string;
  contextLength: number;
  maxTokens: number;
  temperature: number;
  thinking: boolean;
  retryAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  configured: boolean;
  activeId?: string;
  probeTtlMs?: number;
  providers?: ProviderPublic[];
  catalog?: {
    protocols: ProtocolInfo[];
    vendors: VendorPreset[];
  };
};

export type SparkChannel = "male" | "female" | "common";

export type SparkCard = {
  id?: string;
  channel?: SparkChannel;
  tags: string[];
  picks?: Record<string, string[]>;
  hook: string;
  conflict: string;
  edge: string;
  details: string[];
};
