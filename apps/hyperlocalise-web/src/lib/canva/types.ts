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

export type CanvaJobStatusName =
  | "queued"
  | "running"
  | "waiting_for_review"
  | "succeeded"
  | "failed"
  | "cancelled";

export type StartCanvaLocalizationResult = {
  jobId: string;
  generated: boolean;
  projectId: string;
  sourcePath: string;
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

export type CanvaLocalizationStatus = CanvaDesignJob;

export type CanvaCurrentJobResult = {
  job: CanvaDesignJob | null;
};

export type CanvaConnectionClaimStatus = "pending" | "authorized" | "consumed" | "expired";

export type CanvaConnectionClaimCreated = {
  claimId: string;
  pollToken: string;
  authorizeUrl: string;
  expiresAt: string;
};

export type CanvaConnectionClaimPollResult =
  | {
      status: "pending";
      expiresAt: string;
    }
  | {
      status: "authorized";
      connectionToken: string;
    }
  | {
      status: "consumed" | "expired";
    };

export type CanvaVerifiedUser = {
  userId: string;
  brandId: string;
};
