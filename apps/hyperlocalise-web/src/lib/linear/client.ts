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

import { LINEAR_GRAPHQL_URL, LINEAR_TEAMS_PAGE_SIZE } from "./constants";
import type {
  LinearApiError,
  LinearCreateIssueInput,
  LinearIssue,
  LinearTeam,
  LinearViewer,
} from "./types";

type GraphqlResponse<T> = {
  data?: T | null;
  errors?: Array<{ message?: string; extensions?: { code?: string } }>;
};

type RequestOptions = { signal?: AbortSignal };

type TeamsPage = {
  teams: {
    nodes: LinearTeam[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type LinearClient = ReturnType<typeof createLinearClient>;

const VIEWER_QUERY = `query Viewer {
  viewer { id name organization { id name urlKey } }
}`;

const TEAMS_QUERY = `query Teams($first: Int!, $after: String) {
  teams(first: $first, after: $after) {
    nodes { id key name }
    pageInfo { hasNextPage endCursor }
  }
}`;

const ISSUE_CREATE_MUTATION = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier title url }
  }
}`;

function apiErrorFromStatus(statusCode: number, message: string): LinearApiError {
  if (statusCode === 401 || statusCode === 403) {
    return { code: "linear_credentials_invalid", message, statusCode };
  }
  if (statusCode === 429) {
    return { code: "linear_rate_limited", message, statusCode };
  }
  return { code: "linear_request_failed", message, statusCode };
}

function apiErrorFromGraphql(errors: NonNullable<GraphqlResponse<unknown>["errors"]>) {
  const first = errors[0];
  const message = first?.message?.trim() || "Linear rejected the request.";
  const code = first?.extensions?.code;
  if (code === "AUTHENTICATION_ERROR" || code === "FORBIDDEN") {
    return apiErrorFromStatus(401, message);
  }
  if (code === "RATELIMITED") {
    return apiErrorFromStatus(429, message);
  }
  return apiErrorFromStatus(400, message);
}

/** Linear GraphQL client using an OAuth access token from WorkOS Pipes. */
export function createLinearClient(input: { accessToken: string; fetchImpl?: typeof fetch }) {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error("invalid_linear_oauth_credentials");
  }
  const fetchImpl = input.fetchImpl ?? fetch;

  async function request<T>(
    query: string,
    variables: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<Result<T, LinearApiError>> {
    let response: Response;
    try {
      response = await fetchImpl(LINEAR_GRAPHQL_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: options?.signal,
      });
    } catch (error) {
      if (options?.signal?.aborted) {
        throw error;
      }
      return err({ code: "linear_request_failed", message: "Linear could not be reached." });
    }

    const body = (await response.json().catch(() => null)) as GraphqlResponse<T> | null;
    if (body?.errors?.length) {
      const apiError = apiErrorFromGraphql(body.errors);
      return err(response.ok ? apiError : { ...apiError, statusCode: response.status });
    }
    if (!response.ok) {
      return err(apiErrorFromStatus(response.status, `Linear returned HTTP ${response.status}.`));
    }
    if (!body?.data) {
      return err({ code: "linear_request_failed", message: "Linear returned an empty response." });
    }
    return ok(body.data);
  }

  return {
    async getViewer(options?: RequestOptions): Promise<Result<LinearViewer, LinearApiError>> {
      const result = await request<{ viewer: LinearViewer }>(VIEWER_QUERY, {}, options);
      if (isErr(result)) {
        return err(result.error);
      }
      return ok(result.value.viewer);
    },

    async listTeams(options?: RequestOptions): Promise<Result<LinearTeam[], LinearApiError>> {
      const teams: LinearTeam[] = [];
      let after: string | null = null;
      for (;;) {
        const result: Result<TeamsPage, LinearApiError> = await request<TeamsPage>(
          TEAMS_QUERY,
          { first: LINEAR_TEAMS_PAGE_SIZE, after },
          options,
        );
        if (isErr(result)) {
          return err(result.error);
        }
        teams.push(...result.value.teams.nodes);
        const pageInfo: TeamsPage["teams"]["pageInfo"] = result.value.teams.pageInfo;
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) {
          return ok(teams);
        }
        after = pageInfo.endCursor;
      }
    },

    async createIssue(
      issue: LinearCreateIssueInput,
      options?: RequestOptions,
    ): Promise<Result<LinearIssue, LinearApiError>> {
      const result = await request<{
        issueCreate: { success: boolean; issue: LinearIssue | null };
      }>(ISSUE_CREATE_MUTATION, { input: issue }, options);
      if (isErr(result)) {
        return err(result.error);
      }
      const { success, issue: created } = result.value.issueCreate;
      if (!success || !created) {
        return err({ code: "linear_request_failed", message: "Linear did not create the issue." });
      }
      return ok(created);
    },
  };
}
