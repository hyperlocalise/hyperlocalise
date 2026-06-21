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
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  designToken: string;
  segments: DesignSegment[];
  preserveFormatting: boolean;
};

export type LocalizeResponse = {
  jobId: string;
  translationsByLocale: Record<string, Record<string, string>>;
  mode: "hyperlocalise" | "preview";
};

export type WorkflowStep =
  | "idle"
  | "extracting"
  | "uploading"
  | "translating"
  | "applying"
  | "done";

export type AppSettings = {
  projectId: string;
  sourceLocale: string;
  targetLocales: string;
  preserveFormatting: boolean;
  selectedPageIndices: number[];
};
