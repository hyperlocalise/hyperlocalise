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
import { stopWaitingOnAbort } from "@/lib/primitives/abort/stop-waiting-on-abort";
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";
import { withPublicHttpFetch } from "@/lib/security/public-http-fetch";

import {
  GITLAB_API_ORIGIN,
  GITLAB_CLONE_MIN_ACCESS_LEVEL,
  GITLAB_PROJECT_MAX_PAGES,
  GITLAB_PROJECT_PAGE_SIZE,
  GITLAB_SERVER_REQUEST_TIMEOUT_MS,
  GITLAB_WRITE_REQUEST_TIMEOUT_MS,
} from "./constants";
import { isLocalDevGitLabServer } from "./server-url";
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

function requestFailed(status: number, timedOut = false): GitLabApiError {
  return {
    code: "gitlab_request_failed",
    message: "GitLab request failed.",
    status,
    ...(timedOut ? { timedOut } : {}),
  };
}

/** Clones send the token to this address, so for a saved server it's built from that server. */
export function buildGitLabCloneUrl(baseUrl: string | null, pathWithNamespace: string): string {
  return `${baseUrl ?? GITLAB_API_ORIGIN}/${pathWithNamespace}.git`;
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
    // A server chooses what it reports here.
    httpUrlToRepo: baseUrl ? buildGitLabCloneUrl(baseUrl, pathWithNamespace) : httpUrlToRepo,
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

type GitLabResponse = { ok: boolean; status: number; body: Buffer };

type GitLabRequestInit = {
  headers: Record<string, string>;
  method?: string;
  body?: string;
  signal?: AbortSignal;
};

async function readResponse(response: Response): Promise<GitLabResponse> {
  const body = Buffer.from(await response.arrayBuffer());
  return { ok: response.ok, status: response.status, body };
}

/**
 * A workspace's own server is an address someone typed, so each request pins the checked address
 * and refuses redirects, which could otherwise lead the token somewhere else.
 */
async function requestGitLabServer(
  url: URL,
  baseUrl: string,
  init: GitLabRequestInit,
): Promise<GitLabResponse> {
  const timeout = AbortSignal.timeout(
    init.method ? GITLAB_WRITE_REQUEST_TIMEOUT_MS : GITLAB_SERVER_REQUEST_TIMEOUT_MS,
  );
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  if (isLocalDevGitLabServer(new URL(baseUrl))) {
    return readResponse(await fetch(url, { ...init, signal, redirect: "error" }));
  }
  return stopWaitingOnAbort(
    withPublicHttpFetch(url.toString(), { ...init, signal, redirect: "error" }, readResponse),
    signal,
  );
}

export type GitLabRequest = GitLabAccess & {
  path: string;
  query?: URLSearchParams;
  /** GET unless given; a body is sent as JSON. */
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  signal?: AbortSignal;
};

/**
 * One GitLab request with the token, answering the body as bytes. Every GitLab call goes
 * through here, so a relay or a fixed outgoing address would be added in one place.
 */
async function gitlabRequest(
  input: GitLabRequest & { accept: string },
): Promise<Result<GitLabResponse, GitLabApiError>> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    Accept: input.accept,
  };
  const init: GitLabRequestInit = { headers, signal: input.signal };
  if (input.method && input.method !== "GET") {
    init.method = input.method;
  }
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  let response: GitLabResponse;
  try {
    const url = new URL(`${input.baseUrl ?? GITLAB_API_ORIGIN}${input.path}`);
    if (input.query) {
      url.search = input.query.toString();
    }
    if (input.baseUrl) {
      response = await requestGitLabServer(url, input.baseUrl, init);
    } else {
      // GitLab.com gets the same patience as a company server, so a run can't hang on it.
      const timeout = AbortSignal.timeout(
        init.method ? GITLAB_WRITE_REQUEST_TIMEOUT_MS : GITLAB_SERVER_REQUEST_TIMEOUT_MS,
      );
      response = await readResponse(
        await fetch(url, {
          ...init,
          signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
        }),
      );
    }
  } catch (error) {
    logger.warn(describeRequestFailure(error), "gitlab request failed before an answer");
    return err(requestFailed(0, error instanceof Error && error.name === "TimeoutError"));
  }

  if (response.status === 401 || response.status === 403) {
    // A saved address may not be GitLab at all, and GitLab answers these with JSON.
    return input.baseUrl && isErr(safeJsonParse(response.body.toString("utf8")))
      ? err(requestFailed(response.status))
      : err(UNAUTHORIZED);
  }
  if (response.status === 404) {
    return err(NOT_FOUND);
  }
  if (!response.ok) {
    return err(requestFailed(response.status));
  }
  return ok(response);
}

export async function gitlabJson(input: GitLabRequest): Promise<Result<unknown, GitLabApiError>> {
  const response = await gitlabRequest({ ...input, accept: "application/json" });
  if (isErr(response)) {
    return response;
  }
  const parsed = safeJsonParse(response.value.body.toString("utf8"));
  if (isErr(parsed)) {
    return err(requestFailed(response.value.status));
  }
  return ok(parsed.value);
}

/** A raw file endpoint's bytes, untouched, so a file in any encoding comes back as stored. */
export async function gitlabBytes(input: GitLabRequest): Promise<Result<Buffer, GitLabApiError>> {
  const response = await gitlabRequest({ ...input, accept: "*/*" });
  return isErr(response) ? response : ok(response.value.body);
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
      // The simple shape carries no archived flag, so archived projects are left out here.
      archived: "false",
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
