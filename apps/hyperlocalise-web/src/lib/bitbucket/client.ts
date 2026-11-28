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

import {
  BITBUCKET_API_ORIGIN,
  BITBUCKET_REPOSITORY_MAX_PAGES,
  BITBUCKET_REPOSITORY_PAGE_SIZE,
  BITBUCKET_REQUEST_TIMEOUT_MS,
  BITBUCKET_WRITE_REQUEST_TIMEOUT_MS,
} from "./constants";
import type { BitbucketAccess, BitbucketApiError, BitbucketRepository } from "./types";

const logger = createLogger("bitbucket-client");

const UNAUTHORIZED: BitbucketApiError = {
  code: "bitbucket_unauthorized",
  message: "Bitbucket rejected the connection's token.",
};

const FORBIDDEN: BitbucketApiError = {
  code: "bitbucket_forbidden",
  message: "The connection's token isn't allowed to do this.",
};

const NOT_FOUND: BitbucketApiError = {
  code: "bitbucket_not_found",
  message: "Bitbucket could not find that.",
};

function requestFailed(status: number, timedOut = false): BitbucketApiError {
  return {
    code: "bitbucket_request_failed",
    message: "Bitbucket request failed.",
    status,
    ...(timedOut ? { timedOut } : {}),
  };
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The API path of one repository, from its `workspace/repo-slug`. */
export function bitbucketRepositoryPath(fullName: string): string {
  const [workspace = "", slug = ""] = fullName.split("/");
  return `/2.0/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}`;
}

/** A `workspace/repo-slug` with nothing else in it. */
export function isBitbucketRepositoryFullName(value: string): boolean {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value);
}

/** A repository path with each segment escaped, so a name with `#` or `?` stays a path. */
export function encodeBitbucketFilePath(path: string): string {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(encodeURIComponent)
    .join("/");
}

function authorizationHeader(access: BitbucketAccess): string {
  return access.accountEmail
    ? `Basic ${Buffer.from(`${access.accountEmail}:${access.accessToken}`).toString("base64")}`
    : `Bearer ${access.accessToken}`;
}

/** The error's kind only: its message can carry a path, which is customer data. */
function describeRequestFailure(error: unknown) {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : null;
  return {
    errorName: error instanceof Error ? error.name : "unknown",
    causeCode: typeof cause?.code === "string" ? cause.code : null,
  };
}

export type BitbucketResponse = { status: number; body: Buffer; headers: Headers };

export type BitbucketRequest = BitbucketAccess & {
  /** A path on the API origin, or a whole `next` link the API gave. */
  path: string;
  query?: URLSearchParams;
  /** GET unless given. */
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as multipart form data (the `src` commit endpoint). */
  form?: FormData;
  signal?: AbortSignal;
};

function resolveUrl(path: string, query?: URLSearchParams): Result<URL, BitbucketApiError> {
  const url = new URL(path, BITBUCKET_API_ORIGIN);
  // A `next` link is followed only on the API's own origin, so the token never goes elsewhere.
  if (url.origin !== BITBUCKET_API_ORIGIN) {
    return err(requestFailed(0));
  }
  if (query) {
    for (const [key, value] of query) {
      url.searchParams.append(key, value);
    }
  }
  return ok(url);
}

/**
 * One Bitbucket request with the token. Every Bitbucket call goes through here, so a relay or a
 * fixed outgoing address would be added in one place.
 */
export async function bitbucketRequest(
  input: BitbucketRequest & { accept: string },
): Promise<Result<BitbucketResponse, BitbucketApiError>> {
  const url = resolveUrl(input.path, input.query);
  if (isErr(url)) {
    return url;
  }
  const headers: Record<string, string> = {
    Authorization: authorizationHeader(input),
    Accept: input.accept,
  };
  let body: string | FormData | undefined;
  if (input.form) {
    body = input.form;
  } else if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input.body);
  }
  const method = input.method ?? "GET";
  const timeout = AbortSignal.timeout(
    method === "GET" ? BITBUCKET_REQUEST_TIMEOUT_MS : BITBUCKET_WRITE_REQUEST_TIMEOUT_MS,
  );
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;

  let response: BitbucketResponse;
  try {
    const answer = await fetch(url.value, { method, headers, body, signal });
    response = {
      status: answer.status,
      body: Buffer.from(await answer.arrayBuffer()),
      headers: answer.headers,
    };
  } catch (error) {
    logger.warn(describeRequestFailure(error), "bitbucket request failed before an answer");
    return err(requestFailed(0, error instanceof Error && error.name === "TimeoutError"));
  }

  if (response.status === 401) {
    return err(UNAUTHORIZED);
  }
  if (response.status === 403) {
    return err(FORBIDDEN);
  }
  if (response.status === 404) {
    return err(NOT_FOUND);
  }
  if (response.status < 200 || response.status >= 300) {
    return err(requestFailed(response.status));
  }
  return ok(response);
}

export async function bitbucketJson(
  input: BitbucketRequest,
): Promise<Result<unknown, BitbucketApiError>> {
  const response = await bitbucketRequest({ ...input, accept: "application/json" });
  if (isErr(response)) {
    return response;
  }
  if (response.value.body.length === 0) {
    // A delete, a decline or a commit can answer with no body.
    return ok(null);
  }
  const parsed = safeJsonParse(response.value.body.toString("utf8"));
  if (isErr(parsed)) {
    return err(requestFailed(response.value.status));
  }
  return ok(parsed.value);
}

/** A file's bytes, untouched, so a file in any encoding comes back as stored. */
export async function bitbucketBytes(
  input: BitbucketRequest,
): Promise<Result<Buffer, BitbucketApiError>> {
  const response = await bitbucketRequest({ ...input, accept: "*/*" });
  return isErr(response) ? response : ok(response.value.body);
}

/**
 * Every page of a paginated listing, up to `maxPages`; `truncated` says there was more. Pages
 * are followed through the `next` link Bitbucket gives.
 */
export async function bitbucketPages(
  input: BitbucketRequest & { maxPages: number },
): Promise<Result<{ values: unknown[]; truncated: boolean }, BitbucketApiError>> {
  const values: unknown[] = [];
  let next: { path: string; query?: URLSearchParams } | null = {
    path: input.path,
    query: input.query,
  };
  for (let page = 0; next && page < input.maxPages; page += 1) {
    const result = await bitbucketJson({ ...input, ...next });
    if (isErr(result)) {
      return result;
    }
    const record = asRecord(result.value);
    if (Array.isArray(record?.values)) {
      values.push(...record.values);
    }
    const link = asString(record?.next);
    // The link carries the query already, so the first page's isn't sent again.
    next = link ? { path: link, query: undefined } : null;
  }
  return ok({ values, truncated: next !== null });
}

function parseRepository(value: unknown): BitbucketRepository | null {
  const record = asRecord(value);
  const uuid = asString(record?.uuid);
  const fullName = asString(record?.full_name);
  if (!record || !uuid || !fullName) {
    return null;
  }
  return {
    uuid,
    fullName,
    name: asString(record.name) ?? fullName,
    mainBranch: asString(asRecord(record.mainbranch)?.name),
  };
}

/** Who the token belongs to; null when the token may not say (an access token without the account scope). */
export async function getBitbucketCurrentAccount(
  input: BitbucketAccess & { signal?: AbortSignal },
): Promise<Result<string | null, BitbucketApiError>> {
  const result = await bitbucketJson({ ...input, path: "/2.0/user" });
  if (isErr(result)) {
    return result.error.code === "bitbucket_forbidden" ? ok(null) : result;
  }
  const record = asRecord(result.value);
  return ok(asString(record?.display_name) ?? asString(record?.username) ?? null);
}

/** Whether the token reads at least one repository; a refused token is an error. */
export async function checkBitbucketRepositoryAccess(
  input: BitbucketAccess & { signal?: AbortSignal },
): Promise<Result<{ readsRepositories: boolean }, BitbucketApiError>> {
  const result = await bitbucketJson({
    ...input,
    path: "/2.0/repositories",
    query: new URLSearchParams({ role: "member", pagelen: "1", fields: "values.uuid" }),
  });
  if (isErr(result)) {
    return result;
  }
  const values = asRecord(result.value)?.values;
  return ok({ readsRepositories: Array.isArray(values) && values.length > 0 });
}

/** The repositories the token can read, the most recently updated first, a few hundred at most. */
export async function listBitbucketRepositories(
  input: BitbucketAccess & { signal?: AbortSignal },
): Promise<Result<BitbucketRepository[], BitbucketApiError>> {
  const result = await bitbucketPages({
    ...input,
    path: "/2.0/repositories",
    query: new URLSearchParams({
      role: "member",
      pagelen: String(BITBUCKET_REPOSITORY_PAGE_SIZE),
      sort: "-updated_on",
      fields: "next,values.uuid,values.full_name,values.name,values.mainbranch.name",
    }),
    maxPages: BITBUCKET_REPOSITORY_MAX_PAGES,
  });
  if (isErr(result)) {
    return result;
  }
  return ok(
    result.value.values
      .map(parseRepository)
      .filter((repository): repository is BitbucketRepository => repository !== null),
  );
}

export async function getBitbucketRepository(
  input: BitbucketAccess & { fullName: string; signal?: AbortSignal },
): Promise<Result<BitbucketRepository, BitbucketApiError>> {
  if (!isBitbucketRepositoryFullName(input.fullName)) {
    return err(NOT_FOUND);
  }
  const result = await bitbucketJson({ ...input, path: bitbucketRepositoryPath(input.fullName) });
  if (isErr(result)) {
    return result;
  }
  const repository = parseRepository(result.value);
  return repository ? ok(repository) : err(requestFailed(200));
}
