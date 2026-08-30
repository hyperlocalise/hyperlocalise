import type { FigmaPageJobBinding } from "./page-binding";

export type FigmaSegment = {
  key: string;
  nodeId: string;
  regionIndex: number;
  text: string;
};

export type FigmaFileInfo = {
  fileKey: string;
  fileName: string;
  pageId: string;
  pageName: string;
};

export type PluginSettings = {
  appUrl: string;
  personalAccessToken: string | null;
  userEmail: string | null;
  organizationSlug: string;
  organizationName: string | null;
  projectId: string;
  sourceLocale: string;
  targetLocales: string[];
  preserveFormatting: boolean;
  lastJobId: string | null;
};

export type FigmaPageJob = {
  jobId: string;
  status: "queued" | "running" | "waiting_for_review" | "succeeded" | "failed" | "cancelled";
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  lastError: string | null;
  translationsByLocale: Record<string, Record<string, string>>;
};

export type UiToSandboxMessage =
  | { type: "boot" }
  | { type: "storage-set"; settings: PluginSettings }
  | { type: "binding-set"; binding: FigmaPageJobBinding; pageId: string }
  | { type: "binding-clear"; pageId: string }
  | { type: "extract"; preserveFormatting: boolean }
  | { type: "apply"; translations: Record<string, string>; preserveFormatting: boolean }
  | { type: "cancel" };

export type SandboxToUiMessage =
  | {
      type: "ready";
      settings: PluginSettings;
      file: FigmaFileInfo;
      binding: FigmaPageJobBinding | null;
      legacySessionCleared?: boolean;
    }
  | { type: "page-changed"; file: FigmaFileInfo; binding: FigmaPageJobBinding | null }
  | { type: "extracted"; segments: FigmaSegment[]; file: FigmaFileInfo }
  | { type: "applied"; count: number }
  | { type: "error"; message: string };

export const SETTINGS_STORAGE_KEY = "hyperlocalise:figma-plugin:settings:v1";
