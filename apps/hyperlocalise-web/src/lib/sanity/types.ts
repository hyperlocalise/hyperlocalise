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
export type SanityDocumentSegment = {
  key: string;
  documentId: string;
  documentType: string;
  text: string;
};

export type SanitySessionProject = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type SanityConnectionSession = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  projects: SanitySessionProject[];
  connection: {
    id: string;
    displayName: string;
  };
};

export type SanityConnectionSummary = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  displayName: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SanityJobStatusName =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StartSanityLocalizationResult = {
  jobId: string;
  generated: boolean;
  projectId: string;
  sourcePath: string;
};

export type SanityDocumentJob = {
  jobId: string;
  status: SanityJobStatusName;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  lastError: string | null;
  translationsByLocale: Record<string, Record<string, string>>;
};

export type SanityLocalizationStatus = SanityDocumentJob;

export type SanityCurrentJobResult = {
  job: SanityDocumentJob | null;
};

export type SanitySourcePullEntry = {
  key: string;
  source: string;
  target?: string;
};

export type SanitySourcePullPage = {
  locale: string;
  sourcePath: string;
  needsReupload: boolean;
  entries: SanitySourcePullEntry[];
};

export type CollectedSanityDocument = {
  documentId: string;
  sourcePath: string;
  sourceFileId: string;
  segmentCount: number;
};

export type CollectSanityDocumentResult = {
  projectId: string;
  sourceFileId: string;
  sourcePath: string;
  segmentCount: number;
};

export type SanityLocaleDocumentStatusName = SanityJobStatusName | "missing" | "idle";

export type SanityLocaleDocumentStatus = {
  documentId: string;
  status: SanityLocaleDocumentStatusName;
};

export type SanityLocaleStatus = {
  locale: string;
  isSource: boolean;
  documents: SanityLocaleDocumentStatus[];
};

export type SanityLocaleStatusesResult = {
  locales: SanityLocaleStatus[];
  documents: CollectedSanityDocument[];
};
