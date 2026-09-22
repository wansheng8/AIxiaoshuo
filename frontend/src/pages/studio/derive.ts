import { PIPELINE, STAGES, expectJobChars, expectJobMs } from "../../domain/pipeline";
import { buildStageFlow } from "../../domain/stage-flow";
import { inferEmotion } from "../../domain/emotion";
import { waitPercent } from "../../components/Meter";
import {
  findNextPipe,
  formatElapsed,
  maxBeatIndex,
  namesFromNovel,
  parseCards,
  parseEmotionVersions,
  pipeSlotFilled,
  wordCount,
} from "./studio-utils";
import type { StudioBase } from "./view-types";

export function deriveStudio({ doc, ui, scan, act, job, id }: StudioBase) {
  const { novel, chapter, skills } = doc;
  const { issues, ignored, sideKind, sideText } = scan;
  const { focusOpenFor } = ui;
  const {
    busy,
    autoPipe,
    runningSlot,
    workId,
    workName,
    streamChars,
    pipeClock,
    selectedStageId,
    failed,
    skippedStages,
  } = act;
  if (!novel || !chapter) throw new Error("deriveStudio 需要已加载的书与章节");

  const charCards = parseCards(novel.characters);
  const worldCards = parseCards(novel.world);
  const propCards = parseCards(novel.props || "");
  const currentSkill = (idName: string) => skills.find((s) => s.id === idName);
  const openThreads = (novel.threads || []).filter((row) => row.status === "open");
  const visibleIssues = issues.filter((row) => !ignored.includes(row.id));
  const emotionVersions = sideKind === "emotion" ? parseEmotionVersions(sideText) : [];
  const chapterPos = novel.chapters.findIndex((row) => row.id === chapter.id);
  const nameBank = namesFromNovel(novel);
  const prevChapter = chapterPos > 0 ? novel.chapters[chapterPos - 1] : null;
  const nextChapter =
    chapterPos >= 0 && chapterPos < novel.chapters.length - 1 ? novel.chapters[chapterPos + 1] : null;
  const beatCatalog = maxBeatIndex(novel);
  const canNext = Boolean(nextChapter) || beatCatalog > chapter.index;
  const landing = inferEmotion(chapter.content);
  const prevLanding = inferEmotion(prevChapter?.content);
  const emotionHint = (() => {
    const bits: string[] = [];
    if (chapter.mood) bits.push(`本章定调「${chapter.mood}」`);
    if (landing) bits.push(`正文落点认成「${landing.mood}」`);
    if (prevLanding) bits.push(`上一章落在「${prevLanding.mood}」`);
    if (bits.length) return `${bits.join("。")}。写下一章时从落点接着长。`;
    if (wordCount(chapter.content) >= 800) return "本章已写完，生成跟正文走。";
    if (novel.craft?.mood) return `本章未写完，写本章时会带上默认基调「${novel.craft.mood}」。`;
    return "默认跟正文走。有上一章时，从上一章结尾的情绪接着长。";
  })();

  const pipeDone = Object.fromEntries(
    PIPELINE.map((item) => [item.id, pipeSlotFilled(novel, chapter, item.id)])
  ) as Record<(typeof PIPELINE)[number]["id"], boolean>;
  const liveBusy = busy || (job.running && job.kind === "studio" && job.targetId === id);
  const liveSlot = runningSlot || (liveBusy ? job.tabId : "");
  const nextPipe = findNextPipe(novel, chapter);
  const nextPipeIndex = nextPipe ? PIPELINE.findIndex((item) => item.id === nextPipe.id) : PIPELINE.length;
  const autoPipeLabel = chapter.index > 1 ? "自动写本章" : "自动写到第一章";
  const wordsMaxNow = Number(novel.craft?.wordsMax) || 3800;
  const activeSlot = runningSlot;
  const runningStageId = liveSlot
    ? STAGES.find((s) => s.line === "writing" && (s.artifact === liveSlot || s.id === liveSlot))?.id || ""
    : "";
  const activeStageId = runningStageId || selectedStageId;
  const stageCards = buildStageFlow({
    novel,
    chapter,
    line: "writing",
    activeStageId,
    failedStageId: failed ? failed.slot : "",
    skipped: skippedStages,
  });
  const activeCard =
    stageCards.find((card) => card.stage.id === activeStageId) ||
    stageCards.find((card) => card.stage.id === nextPipe?.id) ||
    null;
  const focusStage = activeCard?.stage || null;
  const focusField = String(focusStage?.field || "");
  const focusText = (() => {
    if (!focusStage || !focusField || focusField === "threads" || focusField === "polish") return "";
    const source = (focusStage.scope === "chapter" ? chapter : novel) as unknown as Record<string, unknown> | null;
    return String(source?.[focusField] ?? "");
  })();
  const canFocusEdit = Boolean(focusStage && focusField && focusField !== "threads" && focusField !== "polish" && focusText);
  const focusOpen = Boolean(focusStage && focusOpenFor === focusStage.id);
  const expectChars = expectJobChars(workId || activeSlot, wordsMaxNow);
  const filledSteps = PIPELINE.filter((item) => item.id !== activeSlot && pipeDone[item.id]).length;
  const byChars = streamChars / Math.max(expectChars, 1);
  const byTime = waitPercent(pipeClock, expectJobMs(workId || activeSlot)) / 100;
  const jobInner = busy ? Math.min(0.92, Math.max(byChars, byTime * 0.5, 0.06)) : nextPipe ? 0 : 1;
  const inPipeJob = Boolean(autoPipe || (busy && activeSlot));
  const pipePercent = inPipeJob
    ? Math.round(Math.min(100, ((filledSteps + jobInner) / PIPELINE.length) * 100))
    : busy
      ? Math.round(jobInner * 100)
      : !nextPipe
        ? 100
        : Math.round((nextPipeIndex / PIPELINE.length) * 100);
  const activeAction = (activeSlot && PIPELINE.find((item) => item.id === activeSlot)?.action) || nextPipe?.action || "";
  const pipeJobLabel = workName || activeAction || "生成";
  const jobTail = `${streamChars ? ` · ${streamChars} 字` : busy ? " · 生成中" : ""}${
    pipeClock ? ` · ${formatElapsed(pipeClock)}` : ""
  }`;
  const pipeMeterLabel = busy
    ? autoPipe
      ? `${Math.min(filledSteps + (activeSlot ? 1 : 0), PIPELINE.length)}/${PIPELINE.length} ${pipeJobLabel}${jobTail}`
      : `${pipeJobLabel}${jobTail}`
    : !nextPipe
      ? autoPipe
        ? "本章正文写完"
        : "立项到道具都齐了"
      : `第 ${nextPipeIndex + 1}/${PIPELINE.length} 步 ${nextPipe.label}`;

  return {
    charCards,
    worldCards,
    propCards,
    currentSkill,
    openThreads,
    visibleIssues,
    emotionVersions,
    chapterPos,
    nameBank,
    prevChapter,
    nextChapter,
    beatCatalog,
    canNext,
    landing,
    prevLanding,
    emotionHint,
    pipeDone,
    liveBusy,
    liveSlot,
    nextPipe,
    nextPipeIndex,
    autoPipeLabel,
    wordsMaxNow,
    activeSlot,
    runningStageId,
    activeStageId,
    stageCards,
    activeCard,
    focusStage,
    focusField,
    focusText,
    canFocusEdit,
    focusOpen,
    expectChars,
    filledSteps,
    byChars,
    byTime,
    jobInner,
    inPipeJob,
    pipePercent,
    activeAction,
    pipeJobLabel,
    jobTail,
    pipeMeterLabel,
  };
}

export type StudioDerived = ReturnType<typeof deriveStudio>;
