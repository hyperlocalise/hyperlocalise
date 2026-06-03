import { isErr } from "@/lib/primitives/result/results";
import { formatSsrfGuardError, validatePublicHttpUrl } from "@/lib/security/ssrf-guard";
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
  if (isTestEnv && process.env.VITEST_PROVIDER_SAFE_FETCH_PINNING !== "true") {
    const urlResult = validatePublicHttpUrl(url);
    if (isErr(urlResult)) {
      throw new Error(formatSsrfGuardError(urlResult.error));
    }

    return fetch(url, { ...init, redirect: "error" });
  }

  const pinnedTargetResult = await resolvePinnedHttpConnectTarget(url);
  if (isErr(pinnedTargetResult)) {
    throw new Error(formatSsrfGuardError(pinnedTargetResult.error));
  }

  const { requestUrl, connect } = pinnedTargetResult.value;
  const requestInit = buildPinnedRequestInit(input, init, pinnedTargetResult.value);

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
