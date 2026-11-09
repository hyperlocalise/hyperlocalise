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

import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { assertProviderUrlResolvable } from "@/lib/providers/shared/provider-url-resolve";
import { normalizeProviderBaseUrl } from "@/lib/providers/shared/provider-url-safety";
import { stopWaitingOnAbort } from "@/lib/primitives/abort/stop-waiting-on-abort";
import { normalizeHostname } from "@/lib/security/ssrf-guard";

import { GITLAB_SERVER_REQUEST_TIMEOUT_MS } from "./constants";

const LOCAL_DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

const INVALID_SERVER_URL = {
  code: "gitlab_server_url_invalid",
  message: "Enter the https address of a GitLab server that can be reached from the internet.",
} as const;

export type GitLabServerUrlError = typeof INVALID_SERVER_URL;

/**
 * A GitLab server on the developer's own machine, allowed only by a development build. Reads
 * process.env directly because env.NODE_ENV defaults to development when the variable is unset.
 */
export function isLocalDevGitLabServer(url: URL): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    LOCAL_DEV_HOSTNAMES.has(normalizeHostname(url.hostname))
  );
}

function normalizeLocalDevServerUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!isLocalDevGitLabServer(url) || url.username || url.password) {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Checks the address itself, without any network request. */
export function normalizeGitLabServerUrl(value: string): Result<string, GitLabServerUrlError> {
  const trimmed = value.trim();
  const normalized = trimmed
    ? (normalizeLocalDevServerUrl(trimmed) ?? normalizeProviderBaseUrl(trimmed, ""))
    : null;
  if (!normalized) {
    return err(INVALID_SERVER_URL);
  }
  // GitLab.com answers on one host; www redirects there, and redirects are refused.
  return ok(normalized.replace(/^https:\/\/www\.gitlab\.com(?=\/|$)/i, "https://gitlab.com"));
}

/** Also refuses a public name that resolves to a private address. */
export async function resolveGitLabServerUrl(
  value: string,
): Promise<Result<string, GitLabServerUrlError>> {
  const normalized = normalizeGitLabServerUrl(value);
  if (isErr(normalized) || isLocalDevGitLabServer(new URL(normalized.value))) {
    return normalized;
  }
  try {
    await stopWaitingOnAbort(
      assertProviderUrlResolvable(normalized.value),
      AbortSignal.timeout(GITLAB_SERVER_REQUEST_TIMEOUT_MS),
    );
  } catch {
    return err(INVALID_SERVER_URL);
  }
  return normalized;
}
