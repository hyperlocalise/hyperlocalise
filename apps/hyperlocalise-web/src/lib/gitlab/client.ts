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
import { createLogger } from "@/lib/log";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import { withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import {
  GITLAB_API_ORIGIN,
  GITLAB_CLONE_MIN_ACCESS_LEVEL,
  GITLAB_PROJECT_MAX_PAGES,
  GITLAB_PROJECT_PAGE_SIZE,
  GITLAB_SERVER_REQUEST_TIMEOUT_MS,
} from "./constants";
import { isLocalDevGitLabServer, stopWaitingOnAbort } from "./server-url";
import type {
  GitLabAccess,
  GitLabApiError,
  GitLabMergeRequestDetails,
  GitLabProject,
} from "./types";

const UNAUTHORIZED: GitLabApiError = {
  code: "gitlab_unauthorized",
  message: "GitLab rejected the connected account token.",
};

const NOT_FOUND: GitLabApiError = {
  code: "gitlab_not_found",
  message: "GitLab could not find that project.",
};

function requestFailed(status: number): GitLabApiError {
  return {
    code: "gitlab_request_failed",
    message: "GitLab request failed.",
    status,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseProject(value: unknown, baseUrl: string | null): GitLabProject | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = asNumber(record.id);
  const pathWithNamespace = asString(record.path_with_namespace);
  const httpUrlToRepo = asString(record.http_url_to_repo);
  const name = asString(record.name);
  if (!id || !pathWithNamespace || !httpUrlToRepo || !name) {
    return null;
  }

  return {
    id,
    name,
    pathWithNamespace,
    // A server chooses what it reports here, and clones send the token to this address.
    httpUrlToRepo: baseUrl ? `${baseUrl}/${pathWithNamespace}.git` : httpUrlToRepo,
    defaultBranch: asString(record.default_branch),
    archived: record.archived === true,
  };
}

const logger = createLogger("gitlab-client");

/** The error's kind only: its message can name the server, which is customer data. */
function describeRequestFailure(error: unknown) {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : null;
  return {
    errorName: error instanceof Error ? error.name : "unknown",
    causeCode: typeof cause?.code === "string" ? cause.code : null,
  };
}

type GitLabResponse = { ok: boolean; status: number; text: () => Promise<string> };

/**
 * A workspace's own server is an address someone typed, so each request pins the checked address
 * and refuses redirects, which could otherwise lead the token somewhere else.
 */
async function requestGitLabServer(
  url: URL,
  baseUrl: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
): Promise<GitLabResponse> {
  const timeout = AbortSignal.timeout(GITLAB_SERVER_REQUEST_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  if (isLocalDevGitLabServer(new URL(baseUrl))) {
    return fetch(url, { ...init, signal, redirect: "error" });
  }
  return stopWaitingOnAbort(
    withPublicHttpFetch(
      url.toString(),
      { ...init, signal, redirect: "error" },
      async (response) => {
        const body = await response.text();
        return { ok: response.ok, status: response.status, text: async () => body };
      },
    ),
    signal,
  );
}

async function gitlabJson(
  input: GitLabAccess & {
    path: string;
    query?: URLSearchParams;
    signal?: AbortSignal;
  },
): Promise<Result<unknown, GitLabApiError>> {
  const url = new URL(`${input.baseUrl ?? GITLAB_API_ORIGIN}${input.path}`);
  if (input.query) {
    url.search = input.query.toString();
  }

  const headers = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: "application/json",
  };

  let response: GitLabResponse;
  try {
    response = input.baseUrl
      ? await requestGitLabServer(url, input.baseUrl, { headers, signal: input.signal })
      : await fetch(url, { headers, signal: input.signal });
  } catch (error) {
    logger.warn(describeRequestFailure(error), "gitlab request failed before an answer");
    return err(requestFailed(0));
  }

  if (response.status === 401 || response.status === 403) {
    // A saved address may not be GitLab at all, and GitLab answers these with JSON.
    return input.baseUrl && isErr(safeJsonParse(await response.text()))
      ? err(requestFailed(response.status))
      : err(UNAUTHORIZED);
  }
  if (response.status === 404) {
    return err(NOT_FOUND);
  }
  if (!response.ok) {
    return err(requestFailed(response.status));
  }

  const body = await response.text();
  const parsed = safeJsonParse(body);
  if (isErr(parsed)) {
    return err(requestFailed(response.status));
  }

  return ok(parsed.value);
}

export async function getGitLabCurrentUsername(
  input: GitLabAccess & { signal?: AbortSignal },
): Promise<Result<string, GitLabApiError>> {
  const result = await gitlabJson({ ...input, path: "/api/v4/user" });
  if (isErr(result)) {
    return result;
  }

  const username = asString(asRecord(result.value)?.username);
  return username ? ok(username) : err(requestFailed(200));
}

/** Proves the token can read projects, without fetching them all. */
export async function checkGitLabProjectAccess(
  input: GitLabAccess & { signal?: AbortSignal },
): Promise<Result<void, GitLabApiError>> {
  const result = await gitlabJson({
    ...input,
    path: "/api/v4/projects",
    query: new URLSearchParams({ membership: "true", simple: "true", per_page: "1" }),
  });
  if (isErr(result)) {
    return result;
  }
  return Array.isArray(result.value) ? ok(undefined) : err(requestFailed(200));
}

export async function listGitLabMembershipProjects(
  input: GitLabAccess & { signal?: AbortSignal },
): Promise<Result<GitLabProject[], GitLabApiError>> {
  const projects: GitLabProject[] = [];

  for (let page = 1; page <= GITLAB_PROJECT_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      membership: "true",
      min_access_level: String(GITLAB_CLONE_MIN_ACCESS_LEVEL),
      simple: "true",
      order_by: "last_activity_at",
      per_page: String(GITLAB_PROJECT_PAGE_SIZE),
      page: String(page),
    });

    const result = await gitlabJson({
      accessToken: input.accessToken,
      baseUrl: input.baseUrl,
      path: "/api/v4/projects",
      query,
      signal: input.signal,
    });
    if (isErr(result)) {
      return result;
    }

    if (!Array.isArray(result.value)) {
      return err(requestFailed(200));
    }

    for (const item of result.value) {
      const project = parseProject(item, input.baseUrl);
      if (project && !project.archived) {
        projects.push(project);
      }
    }

    if (result.value.length < GITLAB_PROJECT_PAGE_SIZE) {
      break;
    }
  }

  return ok(projects);
}

export async function getGitLabProject(
  input: GitLabAccess & {
    pathWithNamespace: string;
    signal?: AbortSignal;
  },
): Promise<Result<GitLabProject, GitLabApiError>> {
  const encodedPath = encodeURIComponent(input.pathWithNamespace);
  const result = await gitlabJson({
    accessToken: input.accessToken,
    baseUrl: input.baseUrl,
    path: `/api/v4/projects/${encodedPath}`,
    signal: input.signal,
  });
  if (isErr(result)) {
    return result;
  }

  const project = parseProject(result.value, input.baseUrl);
  if (!project) {
    return err(NOT_FOUND);
  }

  return ok(project);
}

export async function getGitLabMergeRequest(
  input: GitLabAccess & {
    pathWithNamespace: string;
    mergeRequestIid: number;
    signal?: AbortSignal;
  },
): Promise<Result<GitLabMergeRequestDetails, GitLabApiError>> {
  const encodedPath = encodeURIComponent(input.pathWithNamespace);
  const result = await gitlabJson({
    accessToken: input.accessToken,
    baseUrl: input.baseUrl,
    path: `/api/v4/projects/${encodedPath}/merge_requests/${input.mergeRequestIid}`,
    signal: input.signal,
  });
  if (isErr(result)) {
    return result;
  }

  const record = asRecord(result.value);
  const iid = asNumber(record?.iid);
  if (!record || iid === null) {
    return err(NOT_FOUND);
  }

  const shaRecord = asRecord(record.diff_refs) ?? asRecord(record.sha);
  return ok({
    iid,
    sourceBranch: asString(record.source_branch),
    commitSha: asString(record.sha) ?? asString(shaRecord?.head_sha),
  });
}
