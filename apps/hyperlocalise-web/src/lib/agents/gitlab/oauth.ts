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

import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import { getConfiguredGitlabBaseUrl, normalizeGitlabBaseUrl } from "./base-url";

export const GITLAB_OAUTH_SCOPES = ["read_api", "read_repository", "read_user"] as const;

export const gitlabTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  created_at: z.number().optional(),
});

export type GitlabTokenResponse = z.infer<typeof gitlabTokenResponseSchema>;

export type GitlabOAuthTokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string | null;
  expiresAt: string | null;
};

export type GitlabOAuthError =
  | { code: "gitlab_oauth_not_configured" }
  | { code: "gitlab_token_exchange_failed"; status: number; message: string }
  | { code: "gitlab_token_refresh_failed"; status: number; message: string }
  | { code: "gitlab_token_response_invalid"; message: string };

export function isGitlabOAuthConfigured(): boolean {
  return Boolean(env.GITLAB_CLIENT_ID && env.GITLAB_CLIENT_SECRET && env.GITLAB_OAUTH_STATE_SECRET);
}

export function getGitlabRedirectUri(requestUrl: string): string {
  if (env.GITLAB_REDIRECT_URI) {
    return env.GITLAB_REDIRECT_URI;
  }

  return `${new URL(requestUrl).origin}/api/auth/gitlab/callback`;
}

export function buildGitlabAuthorizeUrl(input: {
  state: string;
  redirectUri: string;
  baseUrl?: string;
}): string {
  const baseUrl = normalizeGitlabBaseUrl(input.baseUrl ?? getConfiguredGitlabBaseUrl());
  const url = new URL(`${baseUrl}/oauth/authorize`);
  url.searchParams.set("client_id", env.GITLAB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", GITLAB_OAUTH_SCOPES.join(" "));
  return url.toString();
}

function toTokenBundle(token: GitlabTokenResponse, now = new Date()): GitlabOAuthTokenBundle {
  const expiresAt =
    typeof token.expires_in === "number"
      ? new Date(now.getTime() + token.expires_in * 1000).toISOString()
      : null;

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    tokenType: token.token_type,
    scope: token.scope ?? null,
    expiresAt,
  };
}

async function postGitlabToken(
  baseUrl: string,
  body: URLSearchParams,
): Promise<Result<GitlabTokenResponse, { status: number; message: string }>> {
  const response = await fetch(`${normalizeGitlabBaseUrl(baseUrl)}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    return err({ status: response.status, message: "invalid_json_response" });
  }

  if (!response.ok) {
    const message =
      typeof json === "object" &&
      json !== null &&
      "error_description" in json &&
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json === "object" &&
            json !== null &&
            "error" in json &&
            typeof json.error === "string"
          ? json.error
          : `http_${response.status}`;
    return err({ status: response.status, message });
  }

  const parsed = gitlabTokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    return err({ status: response.status, message: "invalid_token_payload" });
  }

  return ok(parsed.data);
}

export async function exchangeGitlabAuthorizationCode(input: {
  code: string;
  redirectUri: string;
  baseUrl?: string;
}): Promise<Result<GitlabOAuthTokenBundle, GitlabOAuthError>> {
  if (!env.GITLAB_CLIENT_ID || !env.GITLAB_CLIENT_SECRET) {
    return err({ code: "gitlab_oauth_not_configured" });
  }

  const body = new URLSearchParams({
    client_id: env.GITLAB_CLIENT_ID,
    client_secret: env.GITLAB_CLIENT_SECRET,
    code: input.code,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
  });

  const result = await postGitlabToken(input.baseUrl ?? getConfiguredGitlabBaseUrl(), body);
  if (!result.ok) {
    return err({
      code: "gitlab_token_exchange_failed",
      status: result.error.status,
      message: result.error.message,
    });
  }

  const parsed = result.value;
  if (!parsed.refresh_token) {
    return err({
      code: "gitlab_token_response_invalid",
      message: "missing_refresh_token",
    });
  }

  return ok(toTokenBundle(parsed));
}

export async function refreshGitlabAccessToken(input: {
  refreshToken: string;
  baseUrl?: string;
}): Promise<Result<GitlabOAuthTokenBundle, GitlabOAuthError>> {
  if (!env.GITLAB_CLIENT_ID || !env.GITLAB_CLIENT_SECRET) {
    return err({ code: "gitlab_oauth_not_configured" });
  }

  const body = new URLSearchParams({
    client_id: env.GITLAB_CLIENT_ID,
    client_secret: env.GITLAB_CLIENT_SECRET,
    refresh_token: input.refreshToken,
    grant_type: "refresh_token",
  });

  const result = await postGitlabToken(input.baseUrl ?? getConfiguredGitlabBaseUrl(), body);
  if (!result.ok) {
    return err({
      code: "gitlab_token_refresh_failed",
      status: result.error.status,
      message: result.error.message,
    });
  }

  const refreshToken = result.value.refresh_token ?? input.refreshToken;
  return ok(
    toTokenBundle({
      ...result.value,
      refresh_token: refreshToken,
    }),
  );
}
