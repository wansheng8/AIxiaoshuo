import type { MutableRefObject, ReactNode, RefObject } from "react";
import type { StageAction, StageCardModel } from "../../domain/stage-flow";
import type { DeskId, FillSlot, TabId } from "./studio-utils";
import { matchNamePrefix } from "./studio-utils";
import { panelOfStage } from "../../domain/pipeline";
import { readJson, writeJson } from "../../data/storage";
import type { StudioAct, StudioDoc, StudioUiState } from "./view-types";
import type { StudioDerived } from "./derive";

export type CanvasAct = ReturnType<typeof createCanvasAct>;

type Args = {
  doc: StudioDoc;
  ui: StudioUiState;
  act: StudioAct;
  d: StudioDerived;
  paperRef: RefObject<HTMLTextAreaElement | null>;
  selRef: MutableRefObject<{ start: number; end: number }>;
};

export function createCanvasAct({ doc, ui, act, d, paperRef, selRef }: Args) {
  const { novel, chapter, setStatus, patchNovel, patchChapterById, updateChapter } = doc;
  const { setNameHint, setFocusOpenFor, setFocusDraft, setMobile, setSelText } = ui;
  const {
    setSelectedStageId,
    openDesk,
    setSkippedStages,
    stageSkipKey,
    clearStageSkip,
    rerunStep,
    runSkill,
  } = act;

  function onStageAction(action: StageAction, card: StageCardModel) {
    const stage = card.stage;
    setSelectedStageId(stage.id);
    if (action === "edit" || action === "view" || action === "run" || action === "rerun") {
      setMobile("paper");
    }
    if (action === "edit" || action === "view") {
      const panel = panelOfStage(stage);
      openDesk((panel.desk || "write") as DeskId, panel.tab as TabId | undefined);
      return;
    }
    if (action === "skip") {
      setSkippedStages((prev) => (prev.includes(stage.id) ? prev : [...prev, stage.id]));
      const key = stageSkipKey(stage);
      const cur = readJson<unknown>(key, []);
      const list = Array.isArray(cur) ? (cur as string[]) : [];
      if (!list.includes(stage.id)) writeJson(key, [...list, stage.id]);
      setStatus(`已跳过「${stage.label}」`);
      return;
    }
    clearStageSkip(stage);
    const artifact = (stage.artifact || "") as FillSlot | "content" | "";
    if (artifact) {
      rerunStep(artifact, action === "run" ? act.autoPipeRef.current : false);
      return;
    }
    const skill = stage.builtin ? d.currentSkill(stage.builtin) : null;
    if (skill) runSkill(skill);
    else setStatus(`「${stage.label}」写法未加载`);
  }

  function toggleFocusEdit() {
    if (!d.focusStage) return;
    if (d.focusOpen) {
      setFocusOpenFor(null);
      return;
    }
    setFocusDraft(d.focusText);
    setFocusOpenFor(d.focusStage.id);
  }

  function saveFocusEdit() {
    if (!d.focusStage || !d.focusField || !novel) return;
    if (d.focusStage.scope === "chapter") {
      if (!chapter) return;
      patchChapterById(chapter.id, { [d.focusField]: ui.focusDraft } as Partial<NonNullable<typeof chapter>>);
    } else {
      patchNovel({ ...novel, [d.focusField]: ui.focusDraft } as typeof novel);
    }
    setStatus(`已保存「${d.focusStage.label}」`);
  }

  function pipeControls(): ReactNode {
    const {
      failed,
      autoPipe,
      paused,
      busy,
      runningSlot,
      retryFailed,
      stopWriting,
      resumeAutoPipe,
      pauseAutoPipe,
      skipStep,
      runNextPipe,
      startAutoPipe,
    } = act;
    if (failed) {
      return (
        <>
          <button className="btn-mint" type="button" onClick={retryFailed}>
            重试「{failed.label}」
          </button>
          <button className="btn-danger" type="button" onClick={stopWriting}>
            停在这步
          </button>
        </>
      );
    }
    if (autoPipe && paused) {
      return (
        <>
          <button className="btn-mint" type="button" onClick={resumeAutoPipe}>
            继续自动开书
          </button>
          <button className="btn-danger" type="button" onClick={stopWriting}>
            停在这步
          </button>
        </>
      );
    }
    if (autoPipe && busy && runningSlot) {
      return (
        <>
          <button className="btn" type="button" onClick={pauseAutoPipe}>
            本步后暂停
          </button>
          <button className="btn" type="button" onClick={skipStep}>
            跳过这步
          </button>
          <button className="btn-danger" type="button" onClick={stopWriting}>
            停在这步
          </button>
        </>
      );
    }
    if (busy) {
      return (
        <button className="btn-danger" type="button" onClick={stopWriting}>
          停在这步
        </button>
      );
    }
    if (!d.nextPipe) return null;
    return (
      <>
        <button className="btn-mint" type="button" onClick={runNextPipe}>
          {d.nextPipe.action}
        </button>
        <button className="btn" type="button" onClick={startAutoPipe}>
          {d.autoPipeLabel}
        </button>
      </>
    );
  }

  function captureNameHint(field: "beats" | "brief" | "outline", el: HTMLTextAreaElement) {
    const hit = matchNamePrefix(el.value, el.selectionStart, d.nameBank);
    if (!hit) {
      setNameHint(null);
      return;
    }
    setNameHint({ field, start: hit.start, end: hit.end, items: hit.items });
  }

  function applyNameHint(name: string) {
    if (!ui.nameHint) return;
    if (!novel || !chapter) return;
    const { field, start, end } = ui.nameHint;
    const splice = (text: string) => text.slice(0, start) + name + text.slice(end);
    if (field === "brief") patchNovel({ ...novel, brief: splice(novel.brief || "") });
    else if (field === "outline") patchNovel({ ...novel, outline: splice(novel.outline || "") });
    else updateChapter({ beats: splice(chapter.beats || "") });
    setNameHint(null);
  }

  function captureSel() {
    const el = paperRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    selRef.current = { start: el.selectionStart, end: el.selectionEnd };
    setSelText(el.value.slice(el.selectionStart, el.selectionEnd));
  }

  return { onStageAction, toggleFocusEdit, saveFocusEdit, pipeControls, captureNameHint, applyNameHint, captureSel };
}
