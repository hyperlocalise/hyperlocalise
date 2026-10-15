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

export type FigmaPageOption = {
  pageId: string;
  pageName: string;
};

export type PluginSettings = {
  appUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  connectionToken: string | null;
  /** @deprecated Use connectionToken or accessToken from Integrations / OAuth. */
  personalAccessToken: string | null;
  userEmail: string | null;
  organizationSlug: string;
  organizationName: string | null;
  projectId: string;
  /** Language to translate into (single picker labeled “Translate to”). */
  selectedLocale: string;
  /** Figma page ids selected for upload / translate / apply. */
  selectedPageIds: string[];
  preserveFormatting: boolean;
  lastJobId: string | null;
  appliedLocaleByPage: Record<string, string>;
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
  | {
      type: "extract";
      pageId: string;
      preserveFormatting: boolean;
      /** When true, ignore the canvas selection and read every text node on the page. */
      wholePage?: boolean;
    }
  | {
      type: "apply";
      pageId: string;
      translations: Record<string, string>;
      sourceByKey: Record<string, string>;
      preserveFormatting: boolean;
    }
  | { type: "binding-read"; pageId: string }
  | { type: "resize-ui"; height: number }
  | { type: "cancel" };

export type SandboxToUiMessage =
  | {
      type: "ready";
      settings: PluginSettings;
      file: FigmaFileInfo;
      pages: FigmaPageOption[];
      binding: FigmaPageJobBinding | null;
      legacySessionCleared?: boolean;
    }
  | {
      type: "page-changed";
      file: FigmaFileInfo;
      pages: FigmaPageOption[];
      binding: FigmaPageJobBinding | null;
    }
  | { type: "binding-loaded"; pageId: string; binding: FigmaPageJobBinding | null }
  | { type: "extracted"; segments: FigmaSegment[]; file: FigmaFileInfo }
  | { type: "applied"; count: number }
  | { type: "error"; message: string };

export const SETTINGS_STORAGE_KEY = "hyperlocalise:figma-plugin:settings:v1";
