import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, generate } from "../data/api";
import { useAppState } from "../app-state";
import { PIPELINE, PIPE_SKILL_IDS, STAGES, WRITING_GROUPS, expectJobChars, expectJobMs, panelOfStage, pipeSkillId, pipeSkillSlot, stageOf } from "../domain/pipeline";
import { StageCard } from "../components/StageFlow";
import StageRail from "../components/StageRail";
import { buildStageFlow, type StageAction, type StageCardModel } from "../domain/stage-flow";
import type { HistoryItem, Novel, Skill, ThreadItem, Voice } from "../domain/types";
import CommandPalette, { type PaletteItem } from "../components/CommandPalette";
import {
  CRAFT_TOGGLES,
  DENSITIES,
  WORD_PRESETS,
  FLOW_OPTIONS,
  PLATFORM_OPTIONS,
  CLEAN_COPY_EXTRA,
  PERFORM_EXTRA,
  IMITATE_DIMENSIONS,
  IMITATE_EXTRA,
  EMOTION_STYLES,
  MOODS,
  POVS,
  STYLES,
  THREAD_STATUS,
  mergeThreads,
  newThread,
  parseThreads,
  clipToWordMax,
} from "../domain/craft";
import { inferEmotion } from "../domain/emotion";
import ReviewReport from "../components/ReviewReport";
import { PromptPreview } from "../components/PromptPreview";
import { parseReviewVerdict } from "../domain/review";
import Meter, { LoadingMeter, waitPercent } from "../components/Meter";
import { beginJob, finishJob, getJob, jobLabel, patchJob, setJobStop, stopJob, useJob } from "../data/jobs";
import { STORAGE_KEYS, readJson, readText, removeKey, writeJson, writeText } from "../data/storage";
import useStudioUi from "./studio/useStudioUi";
import useStudioDocument from "./studio/useStudioDocument";
import useStudioScan from "./studio/useStudioScan";
import useStudioAssets from "./studio/useStudioAssets";
import useStudioPipeline from "./studio/useStudioPipeline";
import { deriveStudio } from "./studio/derive";
import { createCanvasAct } from "./studio/canvas-act";
import { createStudioFiles } from "./studio/file-acts";
import { useStudioPage } from "./studio/useStudioPage";
import { createPortal } from "react-dom";
import { useShellBody } from "../components/shell-slot";
import { useMinWidth } from "../data/use-min-width";
import StudioModals from "./studio/views/StudioModals";
import StudioToc from "./studio/views/StudioToc";
import StudioCanvas from "./studio/views/StudioCanvas";
import StudioInspector from "./studio/views/StudioInspector";
import IssueList from "../components/ui/IssueList";
import AigcCard, { aigcLevelText } from "../components/ui/AigcCard";
import InsFold from "../components/ui/InsFold";
import ConfigBanner from "../components/ui/ConfigBanner";
import {
  AUTO_PIPE_EXTRA,
  RAIL_EXTRAS,
  SWATCH,
  TABS,
  chapterHeading,
  ensureChapterAt,
  expandChaptersFromBeats,
  fieldSnapshot,
  findNextPipe,
  formatElapsed,
  joinPropBody,
  looksLikeChapterProse,
  matchNamePrefix,
  maxBeatIndex,
  namesFromNovel,
  normalizeNovel,
  novelHasProse,
  parseBeatChapters,
  parseCards,
  parseEmotionVersions,
  parsePropBody,
  pipeSlotFilled,
  shortcutK,
  stripChapterPrefix,
  toParagraphs,
  upsertSection,
  wordCount,
  type AssetField,
  type DeskId,
  type FillSlot,
  type StudioUi,
  type TabId,
} from "./studio/studio-utils";


export default function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { setInfo, setConfigured, setCounts, setFileActions, zen, setZen } = useAppState();
  const ui = useStudioUi();
  const shellBody = useShellBody();
  const wide = useMinWidth(961);
  const studioDoc = useStudioDocument(id);
  const {
    novel,
    novelRef,
    chapter,
    chapterId,
    status,
    setStatus,
    loadError,
    setLoadError,
    patchNovel,
    patchCraft,
    updateChapter,
    pushUndo,
  } = studioDoc;
  const files = createStudioFiles({ doc: studioDoc, nav });
  const job = useJob();
  const stageNavRef = useRef<{ run: () => void; move: (dir: number) => void }>({
    run: () => undefined,
    move: () => undefined,
  });
  const paperRef = useRef<HTMLTextAreaElement | null>(null);
  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef({ start: 0, end: 0 });
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const scan = useStudioScan({
    novelId: novel?.id,
    novelRef,
    chapterId,
    chapter,
    setStatus,
    updateChapter,
    pushUndo,
    ui,
    selRef,
    pendingSel,
    paperRef,
  });
  const assets = useStudioAssets({
    novel,
    novelRef,
    chapter,
    patchNovel,
    patchCraft,
    setStatus,
  });

  const pipeline = useStudioPipeline({
    document: studioDoc,
    ui,
    scan,
    assets,
    id,
    search: loc.search,
    nav,
    selRef,
    pendingSel,
    paperRef,
  });














  useEffect(() => {
    stageNavRef.current = {
      run: () => {
        if (!novel || !d.activeCard || d.liveBusy) return;
        const action = d.activeCard.actions.find((item) => item === "run" || item === "rerun");
        if (action) canvas.onStageAction(action, d.activeCard);
      },
      move: (dir) => {
        if (!novel) return;
        const ids = WRITING_GROUPS.flatMap((group) => group.stageIds);
        if (!ids.length) return;
        const current = ids.indexOf(d.activeStageId);
        const base = current < 0 ? (dir > 0 ? -1 : ids.length) : current;
        const next = ids[Math.max(0, Math.min(ids.length - 1, base + dir))];
        const card = d.stageCards.find((item) => item.stage.id === next);
        if (card) canvas.onStageAction("edit", card);
      },
    };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable));
      if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        stageNavRef.current.move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        if (typing) return;
        event.preventDefault();
        stageNavRef.current.run();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const page = useStudioPage({
    id,
    doc: studioDoc,
    ui,
    scan,
    assets,
    act: pipeline,
    job,
    files,
    app: { setInfo, setConfigured, setCounts, setFileActions, zen, setZen },
    paperRef,
    readerShellRef,
    pendingSel,
  });

  if (!novel || !chapter) {
    return (
      <div className="page loading-page">
        <div className="ink-pulse" />
        <p>{loadError || status || "正在摊开稿纸…"}</p>
        {!loadError ? <LoadingMeter label="正在摊开稿纸" /> : null}
        {loadError ? (
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setLoadError("");
                setStatus("");
                page.load().catch((err) => setLoadError((err as Error).message || "加载失败"));
              }}
            >
              重试
            </button>
            <Link className="btn-ghost" to="/">
              返回首页
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  const d = deriveStudio({ doc: studioDoc, ui, scan, assets, act: pipeline, job, id });
  const canvas = createCanvasAct({ doc: studioDoc, ui, act: pipeline, d, paperRef, selRef });
  const tocOut = wide && !zen && Boolean(shellBody);
  const toc = <StudioToc doc={studioDoc} ui={ui} act={pipeline} />;



  return (
    <div className="studio-root">
      <div className="mobile-tabs">
        {[
          ["toc", "目录"],
          ["rail", "阶段"],
          ["paper", "主台"],
          ["skill", "检查器"],
        ].map(([key, label]) => (
          <button key={key} className={ui.mobile === key ? "on" : ""} onClick={() => ui.setMobile(key as typeof ui.mobile)}>
            {label}
          </button>
        ))}
      </div>
      <div
        className={`workspace ${zen ? "zen" : ""} ${ui.desk === "board" || ui.desk === "threads" ? "wide" : ""} ${
          !wide && ui.railCollapsed ? "rail-off" : ""
        } ${ui.mobile === "rail" ? "rail-mobile" : ""} ${tocOut ? "toc-out" : ""} ${wide ? "drawer" : ""} ${
          wide && ui.drawerRail ? "drawer-rail-open" : ""
        } ${wide && ui.drawerIns ? "drawer-ins-open" : ""}`}
      >
      {wide ? (tocOut && shellBody ? createPortal(toc, shellBody) : null) : toc}

        {wide && (ui.drawerRail || ui.drawerIns) ? (
          <button
            type="button"
            className="drawer-backdrop"
            aria-label="关闭抽屉"
            onClick={() => {
              ui.setDrawerRail(false);
              ui.setDrawerIns(false);
            }}
          />
        ) : null}

        <StageRail
          groups={WRITING_GROUPS}
          cards={d.stageCards}
          activeStageId={d.activeStageId}
          busy={d.liveBusy}
          progress={d.liveBusy && d.runningStageId ? { stageId: d.runningStageId, percent: d.pipePercent } : null}
          collapsedGroups={ui.railFoldedGroups}
          extras={RAIL_EXTRAS}
          onSelect={(card) => canvas.onStageAction("edit", card)}
          onExtra={(key) => {
            if (key === "board") pipeline.openDesk("board");
          }}
          onToggleGroup={(groupId) =>
            ui.setRailFoldedGroups((prev) => (prev.includes(groupId) ? prev.filter((item) => item !== groupId) : [...prev, groupId]))
          }
        />

        <StudioCanvas
          doc={studioDoc}
          ui={ui}
          scan={scan}
          assets={assets}
          act={pipeline}
          d={d}
          zen={zen}
          setZen={setZen}
          canvas={canvas}
          paperRef={paperRef}
          readerShellRef={readerShellRef}
          job={job}
        />

        <StudioInspector
          doc={studioDoc}
          ui={ui}
          scan={scan}
          assets={assets}
          act={pipeline}
          d={d}
          pipeControls={canvas.pipeControls}
        />
      </div>
      <StudioModals
        doc={studioDoc}
        ui={ui}
        scan={scan}
        assets={assets}
        act={pipeline}
        d={d}
        zen={zen}
        setZen={setZen}
        files={files}
      />
    </div>
  );
}
