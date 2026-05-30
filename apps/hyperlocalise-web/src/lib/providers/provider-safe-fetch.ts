import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { isPublicHttpUrl } from "@/lib/security/ssrf-guard";
import { resolvePinnedHttpConnectTarget } from "@/lib/security/ssrf-guard-dns";

const isTestEnv = process.env.VITEST === "true" || process.env.NODE_ENV === "test";

export async function providerSafeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!isPublicHttpUrl(url)) {
    throw new Error("URL is not an allowed public HTTP(S) endpoint.");
  }

  // Vitest stubs global.fetch; use it in tests so provider health-check route tests can mock responses.
  if (isTestEnv) {
    return fetch(input, { ...init, redirect: "error" });
  }

  const { requestUrl, connect } = await resolvePinnedHttpConnectTarget(url);
  const dispatcher = new Agent({ connect });

  const response = await undiciFetch(requestUrl, {
    ...(init as UndiciRequestInit | undefined),
    redirect: "error",
    dispatcher,
  });

  return response as unknown as Response;
}
