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
import { env } from "@/lib/env";

const DEFAULT_GITLAB_BASE_URL = "https://gitlab.com";

/**
 * Normalize a GitLab instance base URL (no trailing slash).
 */
export function normalizeGitlabBaseUrl(input: string | null | undefined): string {
  const trimmed = (input ?? DEFAULT_GITLAB_BASE_URL).trim().replace(/\/+$/, "");
  if (!trimmed) {
    return DEFAULT_GITLAB_BASE_URL;
  }
  return trimmed;
}

/**
 * Resolve the configured GitLab OAuth application base URL.
 */
export function getConfiguredGitlabBaseUrl(): string {
  return normalizeGitlabBaseUrl(env.GITLAB_BASE_URL);
}
