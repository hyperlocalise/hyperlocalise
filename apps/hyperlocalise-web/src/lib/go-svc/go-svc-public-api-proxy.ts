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
import { env } from "@/lib/env";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const GO_SVC_PUBLIC_API_TIMEOUT_MS = 30_000;

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "authorization",
  "user-agent",
  "x-api-key",
  "x-request-id",
] as const;

const FORWARDED_RESPONSE_HEADERS = ["cache-control", "content-type", "www-authenticate"] as const;

export type GoSvcPublicApiProxyError =
  | { code: "go_svc_not_configured" }
  | { code: "go_svc_unreachable" };

function goSvcPublicApiUrl(request: Request, baseUrl: string) {
  const incoming = new URL(request.url);
  // The Hono app is mounted under `/api`; go-svc serves the same `/v1/...` paths at its root.
  const path = incoming.pathname.replace(/^\/api(?=\/v1\/)/, "");
  return `${baseUrl.replace(/\/$/, "")}${path}${incoming.search}`;
}

/**
 * Forward a public `/api/v1/...` request to the same path on go-svc.
 *
 * go-svc authenticates the `x-api-key` or agent Bearer token itself, so the
 * caller must not run Hono public-API auth before forwarding.
 */
export async function forwardPublicApiRequestToGoSvc(
  request: Request,
): Promise<Result<Response, GoSvcPublicApiProxyError>> {
  const baseUrl = env.GO_SVC_URL;
  if (!baseUrl) {
    return err({ code: "go_svc_not_configured" });
  }

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(goSvcPublicApiUrl(request, baseUrl), {
      method: request.method,
      headers,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(GO_SVC_PUBLIC_API_TIMEOUT_MS)]),
    });
  } catch {
    return err({ code: "go_svc_unreachable" });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      responseHeaders.set(name, value);
    }
  }

  return ok(
    new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    }),
  );
}
