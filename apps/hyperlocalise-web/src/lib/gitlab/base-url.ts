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
import { isSafeProviderUrl } from "@/lib/providers/shared/provider-url-safety";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { GITLAB_API_ORIGIN } from "./constants";
import type { GitLabConnectionError } from "./types";

const GITLAB_COM_HOSTS = new Set(["gitlab.com", "www.gitlab.com"]);

export function isGitLabComOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return GITLAB_COM_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

export function normalizeGitLabInstanceOrigin(baseUrl: string): Result<string, GitLabConnectionError> {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return err({
      code: "gitlab_base_url_invalid",
      message: "Enter a valid HTTPS GitLab instance URL.",
    });
  }

  if (!isSafeProviderUrl(url)) {
    return err({
      code: "gitlab_base_url_invalid",
      message: "Enter a public HTTPS GitLab instance URL without credentials.",
    });
  }

  if (GITLAB_COM_HOSTS.has(url.hostname.toLowerCase())) {
    return err({
      code: "gitlab_com_uses_pipes",
      message: "Connect GitLab.com through Integrations Pipes, not a self-hosted token.",
    });
  }

  return ok(url.origin);
}

export function resolveGitLabApiOrigin(apiOrigin?: string | null): string {
  const trimmed = apiOrigin?.trim();
  if (!trimmed) {
    return GITLAB_API_ORIGIN;
  }

  try {
    return new URL(trimmed).origin;
  } catch {
    return GITLAB_API_ORIGIN;
  }
}
