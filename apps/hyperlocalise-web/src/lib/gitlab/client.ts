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
import { safeJsonParse } from "@/lib/primitives/safeJsonParse/safeJsonParse";

import {
  GITLAB_API_ORIGIN,
  GITLAB_CLONE_MIN_ACCESS_LEVEL,
  GITLAB_PROJECT_MAX_PAGES,
  GITLAB_PROJECT_PAGE_SIZE,
} from "./constants";
import type { GitLabApiError, GitLabMergeRequestDetails, GitLabProject } from "./types";

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

function parseProject(value: unknown): GitLabProject | null {
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
    httpUrlToRepo,
    defaultBranch: asString(record.default_branch),
    archived: record.archived === true,
  };
}

async function gitlabJson(input: {
  accessToken: string;
  path: string;
  query?: URLSearchParams;
  signal?: AbortSignal;
}): Promise<Result<unknown, GitLabApiError>> {
  const url = new URL(input.path, `${GITLAB_API_ORIGIN}/`);
  if (input.query) {
    url.search = input.query.toString();
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        Accept: "application/json",
      },
      signal: input.signal,
    });
  } catch {
    return err(requestFailed(0));
  }

  if (response.status === 401 || response.status === 403) {
    return err(UNAUTHORIZED);
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

export async function listGitLabMembershipProjects(input: {
  accessToken: string;
  signal?: AbortSignal;
}): Promise<Result<GitLabProject[], GitLabApiError>> {
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
      const project = parseProject(item);
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

export async function getGitLabProject(input: {
  accessToken: string;
  pathWithNamespace: string;
  signal?: AbortSignal;
}): Promise<Result<GitLabProject, GitLabApiError>> {
  const encodedPath = encodeURIComponent(input.pathWithNamespace);
  const result = await gitlabJson({
    accessToken: input.accessToken,
    path: `/api/v4/projects/${encodedPath}`,
    signal: input.signal,
  });
  if (isErr(result)) {
    return result;
  }

  const project = parseProject(result.value);
  if (!project) {
    return err(NOT_FOUND);
  }

  return ok(project);
}

export async function getGitLabMergeRequest(input: {
  accessToken: string;
  pathWithNamespace: string;
  mergeRequestIid: number;
  signal?: AbortSignal;
}): Promise<Result<GitLabMergeRequestDetails, GitLabApiError>> {
  const encodedPath = encodeURIComponent(input.pathWithNamespace);
  const result = await gitlabJson({
    accessToken: input.accessToken,
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
