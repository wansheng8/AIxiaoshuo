import { createContext, useCallback, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type ChromeInfo = {
  title: string;
  subtitle: string;
  chapter: string;
  saved: boolean;
  genre: string;
  words: number;
  novelId: string;
  chapterId: string;
};

export type FileActions = {
  save?: () => void | Promise<void>;
  exportMd?: () => void;
  archive?: () => void | Promise<void>;
  duplicate?: () => void | Promise<void>;
  purge?: () => void | Promise<void>;
};

const defaultInfo: ChromeInfo = {
  title: "墨枢",
  subtitle: "",
  chapter: "",
  saved: true,
  genre: "",
  words: 0,
  novelId: "",
  chapterId: "",
};

const Ctx = createContext<{
  info: ChromeInfo;
  setInfo: (p: Partial<ChromeInfo>) => void;
  configured: boolean;
  setConfigured: (v: boolean) => void;
  failCount: number;
  doneCount: number;
  setCounts: (fail: number, done: number) => void;
  fileActions: FileActions;
  setFileActions: (a: FileActions) => void;
  zen: boolean;
  setZen: Dispatch<SetStateAction<boolean>>;
} | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [info, setInfoState] = useState<ChromeInfo>(defaultInfo);
  const [configured, setConfigured] = useState(false);
  const [failCount, setFail] = useState(0);
  const [doneCount, setDone] = useState(0);
  const [fileActions, setFileActions] = useState<FileActions>({});
  const [zen, setZen] = useState(false);
  const setInfo = useCallback((p: Partial<ChromeInfo>) => {
    setInfoState((prev) => {
      const next = { ...prev, ...p };
      if (
        next.title === prev.title &&
        next.subtitle === prev.subtitle &&
        next.chapter === prev.chapter &&
        next.saved === prev.saved &&
        next.genre === prev.genre &&
        next.words === prev.words &&
        next.novelId === prev.novelId &&
        next.chapterId === prev.chapterId
      ) {
        return prev;
      }
      return next;
    });
  }, []);
  const setCounts = useCallback((fail: number, done: number) => {
    setFail(fail);
    setDone(done);
  }, []);
  const value = useMemo(
    () => ({
      info,
      setInfo,
      configured,
      setConfigured,
      failCount,
      doneCount,
      setCounts,
      fileActions,
      setFileActions,
      zen,
      setZen,
    }),
    [info, configured, failCount, doneCount, fileActions, setInfo, setCounts, zen]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AppState missing");
  return ctx;
}
