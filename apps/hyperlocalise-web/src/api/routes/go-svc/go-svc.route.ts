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
import type { Context } from "hono";
import { Hono } from "hono";

import { notFoundHandler } from "@/api/errors";
import { serviceUnavailableResponse, type JsonContext } from "@/api/response.schema";
import { createLogger } from "@/lib/log";

const logger = createLogger("go-svc-proxy");

const PUBLIC_PREFIX = "/api/go-svc";
const LOCAL_GO_SVC_URL = "http://127.0.0.1:8080";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

type RequestInitWithDuplex = RequestInit & { duplex?: "half" };

export type CreateGoSvcRoutesOptions = {
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
};

export function resolveGoSvcBaseUrl(override?: string | null): string | undefined {
  if (override === null) {
    return undefined;
  }
  if (override != null && override.trim() !== "") {
    return stripTrailingSlash(override);
  }

  const fromEnv = process.env.GO_SVC_URL;
  if (fromEnv) {
    return stripTrailingSlash(fromEnv);
  }
  if (process.env.NODE_ENV === "development") {
    return LOCAL_GO_SVC_URL;
  }
  return undefined;
}

export function goSvcUpstreamPath(pathname: string): string | null {
  const stripped =
    pathname === PUBLIC_PREFIX || pathname.startsWith(`${PUBLIC_PREFIX}/`)
      ? pathname.slice(PUBLIC_PREFIX.length) || "/"
      : pathname;

  if (stripped.includes("..") || stripped.includes("//") || stripped.includes("\\")) {
    return null;
  }
  if (stripped === "/health" || stripped.startsWith("/v1/")) {
    return stripped;
  }
  return null;
}

export function createGoSvcRoutes(options: CreateGoSvcRoutesOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const proxy = (c: Context) => proxyGoSvc(c, options, fetchImpl);

  return new Hono().get("/health", proxy).all("/v1/:path{.+}", proxy);
}

async function proxyGoSvc(
  c: Context,
  options: CreateGoSvcRoutesOptions,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const upstreamPath = goSvcUpstreamPath(new URL(c.req.url).pathname);
  if (upstreamPath == null) {
    return notFoundHandler(c);
  }

  const baseUrl = resolveGoSvcBaseUrl(options.baseUrl);
  if (baseUrl == null) {
    logger.warn({ reason: "missing_go_svc_url" }, "go-svc binding URL is not configured");
    return serviceUnavailableResponse(
      c as unknown as JsonContext,
      "go_svc_unavailable",
      "Validation service is unavailable",
    );
  }

  const incoming = c.req.raw;
  const target = new URL(upstreamPath, `${baseUrl}/`);
  target.search = new URL(incoming.url).search;

  const headers = copyForwardedHeaders(incoming.headers);
  const init: RequestInitWithDuplex = {
    method: incoming.method,
    headers,
    redirect: "manual",
    signal: incoming.signal,
  };
  if (incoming.body != null && incoming.method !== "GET" && incoming.method !== "HEAD") {
    init.body = incoming.body;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(target, init);
  } catch {
    logger.warn({ reason: "fetch_failed" }, "go-svc binding request failed");
    return serviceUnavailableResponse(
      c as unknown as JsonContext,
      "go_svc_unavailable",
      "Validation service is unavailable",
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyResponseHeaders(upstream.headers),
  });
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function copyForwardedHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const [key, value] of incoming.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      continue;
    }
    headers.append(key, value);
  }
  return headers;
}

function copyResponseHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const [key, value] of incoming.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || lower === "content-encoding") {
      continue;
    }
    headers.append(key, value);
  }
  return headers;
}
