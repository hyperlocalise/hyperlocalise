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
import { randomUUID } from "node:crypto";

import {
  buildZernioAuthorizationHeader,
  ZERNIO_API_BASE_URL,
  ZERNIO_API_TIMEOUT_MS,
} from "./constants";
import { err, ok, type Result } from "@/lib/primitives/result/results";

import type { ZernioApiRequest, ZernioApiSuccess, ZernioConnectionError } from "./types";

export const ZERNIO_DEFAULT_CREATE_STATUS = "PAUSED";

function omitUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function buildZernioCreateBody(input: {
  extra?: Record<string, unknown>;
  fields: Record<string, unknown>;
}): Record<string, unknown> {
  const extra = omitUndefined(input.extra ?? {});
  delete extra.status;
  const fields = omitUndefined(input.fields);
  const status =
    typeof fields.status === "string" && fields.status.trim()
      ? fields.status
      : ZERNIO_DEFAULT_CREATE_STATUS;
  return {
    ...extra,
    ...fields,
    status,
  };
}

export function resolveZernioCreateIdempotencyKey(explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return trimmed;
  }
  return `zernio:${randomUUID()}`;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: string }).name === "TimeoutError")
  );
}

function readErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    if ("error" in body && typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
    if ("message" in body && typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  }
  return fallback;
}

export async function zernioRequest(
  input: ZernioApiRequest,
): Promise<Result<ZernioApiSuccess, ZernioConnectionError>> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) {
    return err({
      code: "zernio_api_key_required",
      message: "A Zernio API key is required.",
    });
  }

  const url = new URL(
    `${ZERNIO_API_BASE_URL}${input.path.startsWith("/") ? input.path : `/${input.path}`}`,
  );
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: buildZernioAuthorizationHeader(apiKey),
  };
  if (input.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (input.idempotencyKey?.trim()) {
    headers["Idempotency-Key"] = input.idempotencyKey.trim();
  }

  const signal = input.signal ?? AbortSignal.timeout(ZERNIO_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      return err({
        code: "zernio_request_timeout",
        message: "Zernio request timed out.",
      });
    }
    return err({
      code: "zernio_request_failed",
      message: "Unable to reach Zernio.",
    });
  }

  let parsed: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = { message: text };
    }
  }

  if (!response.ok) {
    return err({
      code:
        response.status === 401 || response.status === 403
          ? "zernio_connection_validation_failed"
          : "zernio_request_failed",
      message: readErrorMessage(parsed, `Zernio request failed (${response.status}).`),
      status: response.status,
    });
  }

  return ok({
    status: response.status,
    body: parsed,
  });
}

export async function validateZernioApiKey(input: {
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Result<{ accountCount: number }, ZernioConnectionError>> {
  const result = await zernioRequest({
    apiKey: input.apiKey,
    method: "GET",
    path: "/accounts",
    signal: input.signal,
  });
  if (!result.ok) {
    if (result.error.code === "zernio_request_failed") {
      return err({
        code: "zernio_connection_validation_failed",
        message: result.error.message,
      });
    }
    return result;
  }

  const accounts =
    typeof result.value.body === "object" &&
    result.value.body !== null &&
    "accounts" in result.value.body &&
    Array.isArray(result.value.body.accounts)
      ? result.value.body.accounts
      : null;

  if (!accounts) {
    return err({
      code: "zernio_connection_validation_failed",
      message: "Zernio did not return an accounts list.",
    });
  }

  return ok({ accountCount: accounts.length });
}

export async function listZernioAccounts(input: {
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Result<unknown, ZernioConnectionError>> {
  const result = await zernioRequest({
    apiKey: input.apiKey,
    method: "GET",
    path: "/accounts",
    signal: input.signal,
  });
  if (!result.ok) {
    return result;
  }
  return ok(result.value.body);
}

export async function listZernioAds(input: {
  apiKey: string;
  accountId?: string;
  signal?: AbortSignal;
}): Promise<Result<unknown, ZernioConnectionError>> {
  const result = await zernioRequest({
    apiKey: input.apiKey,
    method: "GET",
    path: "/ads/tree",
    query: { accountId: input.accountId },
    signal: input.signal,
  });
  if (!result.ok) {
    return result;
  }
  return ok(result.value.body);
}

export async function getZernioAd(input: {
  apiKey: string;
  adId: string;
  signal?: AbortSignal;
}): Promise<Result<unknown, ZernioConnectionError>> {
  const result = await zernioRequest({
    apiKey: input.apiKey,
    method: "GET",
    path: `/ads/${encodeURIComponent(input.adId)}`,
    signal: input.signal,
  });
  if (!result.ok) {
    return result;
  }
  return ok(result.value.body);
}

async function postZernioCreate(input: {
  apiKey: string;
  path: "/ads/create" | "/ads/campaigns";
  body: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<Result<unknown, ZernioConnectionError>> {
  const idempotencyKey = resolveZernioCreateIdempotencyKey(input.idempotencyKey);
  const request = (signal?: AbortSignal) =>
    zernioRequest({
      apiKey: input.apiKey,
      method: "POST",
      path: input.path,
      body: input.body,
      idempotencyKey,
      signal,
    });

  let result = await request(input.signal);
  if (!result.ok && result.error.code === "zernio_request_timeout" && input.signal === undefined) {
    result = await request();
  }
  if (!result.ok) {
    return result;
  }
  return ok(result.value.body);
}

export async function createZernioAd(input: {
  apiKey: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<Result<unknown, ZernioConnectionError>> {
  return postZernioCreate({
    apiKey: input.apiKey,
    path: "/ads/create",
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
}

export async function createZernioCampaign(input: {
  apiKey: string;
  body: Record<string, unknown>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}): Promise<Result<unknown, ZernioConnectionError>> {
  return postZernioCreate({
    apiKey: input.apiKey,
    path: "/ads/campaigns",
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
}
