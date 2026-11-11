import type {
  DesignFrameExport,
  DesignTextNode,
  FigmaKeyLink,
  TextFitIssue,
} from "./design-context";
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
  | { type: "design-scan"; pageId: string; selectionOnly: boolean }
  | { type: "design-selection"; pageId: string }
  | { type: "design-link"; links: Array<{ nodeId: string; link: FigmaKeyLink | null }> }
  | { type: "design-frames"; pageId: string }
  | { type: "design-export-frame"; frame: Omit<DesignFrameExport, "contentType" | "imageBase64"> }
  | {
      type: "design-preview";
      pageId: string;
      translations: Array<{ keyId: string; text: string | null }>;
    }
  | { type: "design-restore"; pageId: string }
  | { type: "design-select-nodes"; nodeIds: string[] }
  | { type: "design-file-link-set"; url: string }
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
  | {
      type: "design-scanned";
      nodes: DesignTextNode[];
      fileLink: string | null;
      /** Only set for plugins allowed to read `figma.fileKey`. */
      figmaFileKey: string | null;
    }
  | { type: "design-selection-read"; nodes: DesignTextNode[] }
  | { type: "design-linked"; count: number }
  | {
      type: "design-frames-read";
      frames: Array<Omit<DesignFrameExport, "contentType" | "imageBase64">>;
      /** Linked layers that sit directly on the page, outside any frame. */
      unframed: number;
    }
  | { type: "design-frame-exported"; frame: DesignFrameExport }
  | { type: "design-previewed"; applied: number; missing: number; issues: TextFitIssue[] }
  | { type: "design-restored"; count: number }
  | { type: "design-nodes-selected"; count: number }
  | { type: "design-file-link-saved" }
  | { type: "error"; message: string };

export const SETTINGS_STORAGE_KEY = "hyperlocalise:figma-plugin:settings:v1";
