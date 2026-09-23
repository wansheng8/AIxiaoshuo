import { useEffect, useState } from "react";
import { STORAGE_KEYS, readJson, readText, writeJson, writeText } from "../../data/storage";
import type { DeskId, TabId } from "./studio-utils";

export type NameHint = {
  field: "beats" | "brief" | "outline";
  start: number;
  end: number;
  items: string[];
};

export type StudioMobileView = "toc" | "rail" | "paper" | "skill";

export default function useStudioUi() {
  const [tab, setTab] = useState<TabId>("brief");
  const [reading, setReading] = useState(true);
  const [readerSize, setReaderSize] = useState(() => {
    const n = Number(readText(STORAGE_KEYS.readerSize));
    return n >= 15 && n <= 24 ? n : 18;
  });
  const [nightRead, setNightRead] = useState(() => readText(STORAGE_KEYS.nightRead) === "1");
  const [mobile, setMobile] = useState<StudioMobileView>("paper");
  const [extra, setExtra] = useState("");
  const [railCollapsed, setRailCollapsed] = useState(() => readText(STORAGE_KEYS.railCollapsed) === "1");
  const [drawerRail, setDrawerRail] = useState(false);
  const [drawerIns, setDrawerIns] = useState(false);
  const [railFoldedGroups, setRailFoldedGroups] = useState<string[]>(() => {
    try {
      const value = readJson<unknown>(STORAGE_KEYS.railFolded, []);
      return Array.isArray(value) ? (value as string[]) : [];
    } catch {
      return [];
    }
  });
  const [focusOpenFor, setFocusOpenFor] = useState<string | null>(null);
  const [focusDraft, setFocusDraft] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSkillId, setPreviewSkillId] = useState("chapter-prose");
  const [desk, setDesk] = useState<DeskId>("write");
  const [split, setSplit] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [selText, setSelText] = useState("");
  const [dragId, setDragId] = useState("");
  const [keepDraft, setKeepDraft] = useState("");
  const [mapFrom, setMapFrom] = useState("");
  const [mapTo, setMapTo] = useState("");
  const [ctx, setCtx] = useState({
    brief: true,
    world: true,
    characters: true,
    outline: true,
    prev: true,
    beats: true,
    props: true,
  });
  const [nameHint, setNameHint] = useState<NameHint | null>(null);

  useEffect(() => {
    writeText(STORAGE_KEYS.readerSize, String(readerSize));
  }, [readerSize]);

  useEffect(() => {
    writeText(STORAGE_KEYS.railCollapsed, railCollapsed ? "1" : "0");
  }, [railCollapsed]);

  useEffect(() => {
    writeJson(STORAGE_KEYS.railFolded, railFoldedGroups);
  }, [railFoldedGroups]);

  useEffect(() => {
    writeText(STORAGE_KEYS.nightRead, nightRead ? "1" : "0");
  }, [nightRead]);

  return {
    tab,
    setTab,
    reading,
    setReading,
    readerSize,
    setReaderSize,
    nightRead,
    setNightRead,
    mobile,
    setMobile,
    extra,
    setExtra,
    railCollapsed,
    setRailCollapsed,
    drawerRail,
    setDrawerRail,
    drawerIns,
    setDrawerIns,
    railFoldedGroups,
    setRailFoldedGroups,
    focusOpenFor,
    setFocusOpenFor,
    focusDraft,
    setFocusDraft,
    previewOpen,
    setPreviewOpen,
    previewSkillId,
    setPreviewSkillId,
    desk,
    setDesk,
    split,
    setSplit,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    selText,
    setSelText,
    dragId,
    setDragId,
    keepDraft,
    setKeepDraft,
    mapFrom,
    setMapFrom,
    mapTo,
    setMapTo,
    ctx,
    setCtx,
    nameHint,
    setNameHint,
  };
}
