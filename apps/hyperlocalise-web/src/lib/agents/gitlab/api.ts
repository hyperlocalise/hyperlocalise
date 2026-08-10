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
import { z } from "zod";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import { normalizeGitlabBaseUrl } from "./base-url";

export const gitlabUserSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  name: z.string().optional().nullable(),
});

export type GitlabUser = z.infer<typeof gitlabUserSchema>;

export const gitlabProjectSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  path_with_namespace: z.string().min(1),
  http_url_to_repo: z.string().min(1),
  visibility: z.string().optional().nullable(),
  archived: z.boolean().optional().nullable(),
  default_branch: z.string().optional().nullable(),
});

export type GitlabApiProject = z.infer<typeof gitlabProjectSchema>;

export type GitlabApiError =
  | { code: "gitlab_api_request_failed"; status: number; message: string }
  | { code: "gitlab_api_response_invalid"; message: string };

async function gitlabFetch(input: {
  baseUrl: string;
  accessToken: string;
  path: string;
  searchParams?: Record<string, string>;
}): Promise<Result<{ status: number; json: unknown; link: string | null }, GitlabApiError>> {
  const url = new URL(`${normalizeGitlabBaseUrl(input.baseUrl)}/api/v4${input.path}`);
  if (input.searchParams) {
    for (const [key, value] of Object.entries(input.searchParams)) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
    });
  } catch (error) {
    return err({
      code: "gitlab_api_request_failed",
      status: 0,
      message: error instanceof Error ? error.message.slice(0, 200) : "network_error",
    });
  }

  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    return err({
      code: "gitlab_api_request_failed",
      status: response.status,
      message: error instanceof Error ? error.message.slice(0, 200) : "response_read_failed",
    });
  }

  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      return err({
        code: "gitlab_api_response_invalid",
        message: "invalid_json_response",
      });
    }
  }

  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "message" in json &&
      typeof json.message === "string"
        ? json.message
        : `http_${response.status}`;
    return err({
      code: "gitlab_api_request_failed",
      status: response.status,
      message,
    });
  }

  return ok({
    status: response.status,
    json,
    link: response.headers.get("link"),
  });
}

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.trim().match(/^<([^>]+)>\s*;\s*rel="next"$/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export async function fetchGitlabCurrentUser(input: {
  baseUrl: string;
  accessToken: string;
}): Promise<Result<GitlabUser, GitlabApiError>> {
  const result = await gitlabFetch({
    baseUrl: input.baseUrl,
    accessToken: input.accessToken,
    path: "/user",
  });
  if (!result.ok) {
    return result;
  }

  const parsed = gitlabUserSchema.safeParse(result.value.json);
  if (!parsed.success) {
    return err({ code: "gitlab_api_response_invalid", message: "invalid_user_payload" });
  }

  return ok(parsed.data);
}

export async function listGitlabMembershipProjects(input: {
  baseUrl: string;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<Result<GitlabApiProject[], GitlabApiError>> {
  const projects: GitlabApiProject[] = [];
  let nextUrl: string | null =
    `${normalizeGitlabBaseUrl(input.baseUrl)}/api/v4/projects?membership=true&simple=true&per_page=100&order_by=id&sort=asc`;

  while (nextUrl) {
    if (input.signal?.aborted) {
      return err({ code: "gitlab_api_request_failed", status: 499, message: "aborted" });
    }

    let response: Response;
    try {
      response = await fetch(nextUrl, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${input.accessToken}`,
        },
        signal: input.signal,
      });
    } catch (error) {
      return err({
        code: "gitlab_api_request_failed",
        status: 0,
        message: error instanceof Error ? error.message.slice(0, 200) : "network_error",
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      return err({
        code: "gitlab_api_request_failed",
        status: response.status,
        message: error instanceof Error ? error.message.slice(0, 200) : "response_read_failed",
      });
    }

    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        return err({
          code: "gitlab_api_response_invalid",
          message: "invalid_json_response",
        });
      }
    }

    if (!response.ok) {
      const message =
        typeof json === "object" &&
        json !== null &&
        "message" in json &&
        typeof json.message === "string"
          ? json.message
          : `http_${response.status}`;
      return err({
        code: "gitlab_api_request_failed",
        status: response.status,
        message,
      });
    }

    if (!Array.isArray(json)) {
      return err({
        code: "gitlab_api_response_invalid",
        message: "expected_project_array",
      });
    }

    for (const item of json) {
      const parsed = gitlabProjectSchema.safeParse(item);
      if (!parsed.success) {
        return err({
          code: "gitlab_api_response_invalid",
          message: "invalid_project_payload",
        });
      }
      projects.push(parsed.data);
    }

    nextUrl = nextPageUrl(response.headers.get("link"));
  }

  return ok(projects);
}
