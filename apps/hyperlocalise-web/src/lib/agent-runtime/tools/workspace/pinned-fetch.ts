import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { isErr } from "@/lib/primitives/result/results";
import { formatSsrfGuardError } from "@/lib/security/ssrf-guard";
import { resolvePinnedHttpConnectTarget } from "@/lib/security/ssrf-guard-dns";

export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export async function withPinnedPublicFetch<T>(
  url: string,
  init: RequestInit | undefined,
  handler: (response: Response) => Promise<T>,
): Promise<T> {
  const pinnedResult = await resolvePinnedHttpConnectTarget(url);
  if (isErr(pinnedResult)) {
    throw new Error(formatSsrfGuardError(pinnedResult.error));
  }

  const pinned = pinnedResult.value;
  const headers = new Headers(init?.headers);
  if (pinned.hostHeader) {
    headers.set("Host", pinned.hostHeader);
  }

  const dispatcher = new Agent({
    connect: {
      host: pinned.connect.host,
      port: pinned.connect.port,
      servername: pinned.connect.servername,
    },
    maxResponseSize: MAX_RESPONSE_BYTES,
  });

  try {
    const requestInit = {
      ...init,
      headers,
      dispatcher,
    } as UndiciRequestInit;

    const response = (await undiciFetch(pinned.requestUrl, requestInit)) as unknown as Response;
    return await handler(response);
  } finally {
    await dispatcher.close();
  }
}
