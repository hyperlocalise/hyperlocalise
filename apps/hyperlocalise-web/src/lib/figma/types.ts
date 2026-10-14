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
export type FigmaDesignSegment = {
  key: string;
  nodeId: string;
  regionIndex: number;
  text: string;
};

export type FigmaSessionProject = {
  id: string;
  name: string;
  sourceLocale: string;
  targetLocales: string[];
};

export type FigmaConnectionSession = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
  };
  project: FigmaSessionProject | null;
  projects: FigmaSessionProject[];
  connection: {
    id: string;
    displayName: string;
    sourceLocale: string;
    targetLocales: string[];
  };
};

export type FigmaConnectionSummary = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  projectId: string | null;
  displayName: string;
  sourceLocale: string;
  targetLocales: string[];
  connectionTokenPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FigmaConnectionSecretResult = {
  connection: FigmaConnectionSummary;
  connectionToken: string;
};

export type FigmaJobStatusName =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StartFigmaLocalizationResult = {
  jobId: string;
  generated: boolean;
  projectId: string;
  sourcePath: string;
};

export type FigmaPageJob = {
  jobId: string;
  status: FigmaJobStatusName;
  projectId: string;
  sourcePath: string;
  targetLocales: string[];
  lastError: string | null;
  translationsByLocale: Record<string, Record<string, string>>;
};

export type FigmaLocalizationStatus = FigmaPageJob;

export type FigmaCurrentJobResult = {
  job: FigmaPageJob | null;
};
