/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type CanvaDesignSegment = {
  key: string;
  pageIndex: number;
  contentIndex: number;
  regionIndex: number;
  text: string;
};

export type CanvaConnectionSummary = {
  id: string;
  organizationId: string;
  apiKeyId: string;
  projectId: string;
  displayName: string;
  sourceLocale: string;
  targetLocales: string[];
  canvaBrandId: string | null;
  connectionTokenPrefix: string;
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CanvaConnectionSecretResult = {
  connection: CanvaConnectionSummary;
  connectionToken: string;
};

export type StartCanvaLocalizationResult = {
  jobId: string;
};

export type CanvaLocalizationStatus =
  | {
      jobId: string;
      status: "queued" | "running";
    }
  | {
      jobId: string;
      status: "succeeded";
      translationsByLocale: Record<string, Record<string, string>>;
    };

export type CanvaVerifiedUser = {
  userId: string;
  brandId: string;
};
