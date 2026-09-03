"use client";

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
import { createApiClient } from "@/lib/api-client";

const api = createApiClient();

export function hyperlabClient() {
  return api.api.orgs[":organizationSlug"].hyperlab;
}

export async function readHyperlabJson<T>(response: Response, fallbackMessage: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.message || body.error || fallbackMessage);
  }
  return body;
}

export type HyperlabFlag = {
  id: string;
  key: string;
  description: string | null;
  kind: "experiment" | "config";
  createdAt: string;
  updatedAt: string;
};

export type HyperlabFlagConfig = {
  flagId: string;
  value: unknown;
};

export type HyperlabAudience = {
  id: string;
  name: string;
  description: string | null;
  criterion: unknown;
};

export type HyperlabExperiment = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  kind: "toggle" | "ab";
  audienceId: string | null;
  rolloutPercentage: number;
  startAt: string;
  endAt: string;
};

export type HyperlabVariant = {
  id: string;
  experimentId: string;
  key: string;
  audienceId: string | null;
  rolloutPercentage: number;
  isControl: boolean;
};

export type HyperlabAllocation = {
  id: string;
  variantId: string;
  start: number;
  end: number;
};

export type HyperlabAssignment = {
  id: string;
  flagId: string;
  variantId: string;
  enabled: boolean;
  payload: unknown;
};

export type HyperlabClientKey = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  secret?: string;
};
