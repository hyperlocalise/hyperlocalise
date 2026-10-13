/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type DesignPageInfo = {
  index: number;
  label: string;
  locked: boolean;
  editable: boolean;
};

export type DesignSegment = {
  pageIndex: number;
  text: string;
};

export type ExtractedDesignContent = {
  segments: DesignSegment[];
  pageIndices: number[];
};

export type CanvaPullEntry = {
  key: string;
  source: string;
  target: string | null;
  knownTexts: string[];
};

export type CanvaPullPage = {
  pageIndex: number;
  sourcePath?: string;
  needsReupload: boolean;
  entries: CanvaPullEntry[];
};

export type CanvaLocalePullResult = {
  locale: string;
  projectId: string;
  pages: CanvaPullPage[];
};

export type ApplyResult = {
  replaced: number;
  alreadyApplied: number;
  skipped: number;
  untranslated: number;
  pagesNeedingUpload: number[];
  appliedPageIndices: number[];
};

export type CanvaJobStatusName =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "succeeded"
  | "failed"
  | "cancelled";

export type CanvaLocalePageStatus = {
  pageIndex: number;
  sourcePath: string;
  jobId: string | null;
  status: CanvaJobStatusName | "idle";
  translated: number;
  total: number;
  translatedWords: number;
  wordCount: number;
  approved: number;
  needsReupload: boolean;
};

export type CanvaLocaleStatus = {
  locale: string;
  isSource?: boolean;
  status: CanvaJobStatusName | "idle";
  translated: number;
  total: number;
  translatedWords: number;
  wordCount: number;
  percent: number;
  approved: number;
  approvedPercent: number;
  canAdd: boolean;
  pages: CanvaLocalePageStatus[];
};

export type CollectedCanvaPage = {
  pageIndex: number;
  sourcePath: string;
  sourceFileId: string;
  segmentCount: number;
  wordCount: number;
};

export type CanvaDesignJob = {
  jobId: string;
  status: CanvaJobStatusName;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  lastError: string | null;
  translationsByLocale: Record<string, Record<string, string>>;
};

export type CanvaSessionProject = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type CanvaSession = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  project: CanvaSessionProject | null;
  projects: CanvaSessionProject[];
  connection: {
    id: string;
    displayName: string;
    sourceLocale: string;
    targetLocales: string[];
  };
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
  organizationSlug: string;
  organizationName: string;
  projectId: string;
  projectName: string;
  sourceLocale: string;
  targetLocales: string;
  preserveFormatting: boolean;
  selectedPageIndices: number[];
  selectedLocale: string;
  designId: string;
  appliedLocaleByPage: Record<string, string>;
  lastJobId: string;
};
