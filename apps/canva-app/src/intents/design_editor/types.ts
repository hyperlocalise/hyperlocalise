export type DesignPageInfo = {
  index: number;
  label: string;
  locked: boolean;
  editable: boolean;
};

export type DesignSegment = {
  key: string;
  pageIndex: number;
  contentIndex: number;
  regionIndex: number;
  text: string;
};

export type ExtractedDesignContent = {
  segments: DesignSegment[];
  pageIndices: number[];
  preserveFormatting: boolean;
};

export type LocalizeRequest = {
  connectionToken: string;
  sourceLocale: string;
  targetLocales: string[];
  designToken: string;
  segments: DesignSegment[];
  projectId?: string;
  preserveFormatting: boolean;
};

export type LocalizeResponse = {
  jobId: string;
  translationsByLocale: Record<string, Record<string, string>>;
  mode: "hyperlocalise";
};

export type WorkflowStep =
  | "idle"
  | "extracting"
  | "uploading"
  | "translating"
  | "applying"
  | "done";

export type AppSettings = {
  connectionToken: string;
  projectId: string;
  sourceLocale: string;
  targetLocales: string;
  preserveFormatting: boolean;
  selectedPageIndices: number[];
};
