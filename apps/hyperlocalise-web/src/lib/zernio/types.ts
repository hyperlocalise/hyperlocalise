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

export type ZernioConnectionSummary = {
  id: string;
  organizationId: string;
  displayName: string;
  enabled: boolean;
  validationStatus: string;
  validationMessage: string | null;
  lastValidatedAt: string | null;
  maskedApiKeySuffix: string;
  createdAt: string;
  updatedAt: string;
};

export type ZernioConnectionWithApiKey = {
  connection: ZernioConnectionSummary;
  apiKey: string;
};

export type ZernioConnectionError =
  | { code: "zernio_api_key_required"; message: string }
  | { code: "zernio_connection_not_found"; message: string }
  | { code: "zernio_connection_decrypt_failed"; message: string }
  | { code: "zernio_connection_validation_failed"; message: string }
  | { code: "zernio_connection_in_use"; message: string }
  | { code: "zernio_connection_ambiguous"; message: string }
  | { code: "zernio_not_connected"; message: string }
  | { code: "zernio_request_failed"; message: string; status?: number }
  | { code: "zernio_request_timeout"; message: string };

export type ZernioApiRequest = {
  apiKey: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export type ZernioApiSuccess = {
  status: number;
  body: unknown;
};

export const ZERNIO_AD_GOALS = [
  "engagement",
  "traffic",
  "awareness",
  "video_views",
  "lead_generation",
  "lead_conversion",
  "job_applicants",
  "conversions",
  "app_promotion",
  "catalog_sales",
  "page_likes",
] as const;

export type ZernioAdGoal = (typeof ZERNIO_AD_GOALS)[number];
