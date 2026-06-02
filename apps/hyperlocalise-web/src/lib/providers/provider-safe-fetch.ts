import { isErr } from "@/lib/primitives/result/results";
import { formatSsrfGuardError } from "@/lib/security/ssrf-guard";
import {
  resolvePinnedHttpConnectTarget,
  type PinnedHttpConnectTarget,
} from "@/lib/security/ssrf-guard-dns";

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

export async function providerSafeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const pinnedTargetResult = await resolvePinnedHttpConnectTarget(url);
  if (isErr(pinnedTargetResult)) {
    throw new Error(formatSsrfGuardError(pinnedTargetResult.error));
  }

  // Vitest stubs global.fetch; use it in tests so provider health-check route tests can mock responses.
  const { requestUrl, connect } = pinnedTargetResult.value;
  const requestInit = buildPinnedRequestInit(input, init, pinnedTargetResult.value);

  if (isTestEnv) {
    return fetch(requestUrl, requestInit);
  }

  const { Agent, fetch: undiciFetch } = await import("undici");
  const dispatcher = new Agent({ connect });

  const response = await undiciFetch(requestUrl, {
    ...(requestInit as any),
    dispatcher,
  });

  return response as unknown as Response;
}

export function buildPinnedRequestInit(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  pinnedTarget: PinnedHttpConnectTarget,
): RequestInit {
  const headers = buildPinnedHeaders(input, init?.headers, pinnedTarget.hostHeader);

  return {
    ...init,
    headers,
    redirect: "error",
  };
}

function buildPinnedHeaders(
  input: RequestInfo | URL,
  initHeaders: HeadersInit | undefined,
  hostHeader: string | undefined,
): HeadersInit | undefined {
  if (!hostHeader) {
    return initHeaders;
  }

  const requestHeaders =
    typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined;
  const headers = new Headers(requestHeaders);

  if (initHeaders) {
    new Headers(initHeaders).forEach((value, key) => headers.set(key, value));
  }

  headers.set("Host", hostHeader);
  return headers;
}
