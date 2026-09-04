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
import type { VisualKeyValuePair } from "../schema/types";
import type { VisualWorkflowExecutionContext } from "./context";
import { resolveVisualWorkflowTemplate } from "./expressions";

export function resolveKeyValuePairs(
  pairs: readonly VisualKeyValuePair[] | undefined,
  context: VisualWorkflowExecutionContext,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const pair of pairs ?? []) {
    const key = pair.key.trim();
    if (!key) {
      continue;
    }
    resolved[key] = resolveVisualWorkflowTemplate(pair.value, context);
  }
  return resolved;
}

export function appendQueryParams(url: string, queryParams: Record<string, string>): string {
  const entries = Object.entries(queryParams).filter(([, value]) => value.length > 0);
  if (entries.length === 0) {
    return url;
  }

  const parsed = new URL(url);
  for (const [key, value] of entries) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export function buildHttpRequestHeaders(input: {
  headers: Record<string, string>;
  auth?: {
    type: "none" | "bearer" | "api_key";
    token?: string;
    headerName?: string;
  };
  bodyType?: "none" | "json" | "text";
  hasBody: boolean;
}): Record<string, string> {
  const result = { ...input.headers };

  if (input.auth?.type === "bearer" && input.auth.token?.trim()) {
    result.Authorization = `Bearer ${input.auth.token.trim()}`;
  }
  if (input.auth?.type === "api_key" && input.auth.token?.trim()) {
    const headerName = input.auth.headerName?.trim() || "X-API-Key";
    result[headerName] = input.auth.token.trim();
  }

  if (input.hasBody && input.bodyType === "json" && !result["Content-Type"]) {
    result["Content-Type"] = "application/json";
  }
  if (input.hasBody && input.bodyType === "text" && !result["Content-Type"]) {
    result["Content-Type"] = "text/plain";
  }

  return result;
}

export function resolveHttpRequestBody(input: {
  body?: string;
  bodyType?: "none" | "json" | "text";
  context: VisualWorkflowExecutionContext;
  method: string;
}): string | undefined {
  if (input.method === "GET" || input.method === "DELETE") {
    return undefined;
  }
  if (input.bodyType === "none" || !input.body?.trim()) {
    return undefined;
  }
  return resolveVisualWorkflowTemplate(input.body, input.context);
}

export function parseHttpResponseBody(bodyText: string, parseJsonBody: boolean): unknown {
  if (!parseJsonBody || !bodyText.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(bodyText) as unknown;
  } catch {
    return undefined;
  }
}
