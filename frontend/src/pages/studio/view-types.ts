import type useStudioDocument from "./useStudioDocument";
import type useStudioUi from "./useStudioUi";
import type useStudioScan from "./useStudioScan";
import type useStudioAssets from "./useStudioAssets";
import type useStudioPipeline from "./useStudioPipeline";
import type { useJob } from "../../data/jobs";

export type StudioDoc = ReturnType<typeof useStudioDocument>;
export type StudioUiState = ReturnType<typeof useStudioUi>;
export type StudioScan = ReturnType<typeof useStudioScan>;
export type StudioAssets = ReturnType<typeof useStudioAssets>;
export type StudioAct = ReturnType<typeof useStudioPipeline>;
export type StudioJob = ReturnType<typeof useJob>;

export type StudioBase = {
  doc: StudioDoc;
  ui: StudioUiState;
  scan: StudioScan;
  assets: StudioAssets;
  act: StudioAct;
  job: StudioJob;
  id?: string;
};
