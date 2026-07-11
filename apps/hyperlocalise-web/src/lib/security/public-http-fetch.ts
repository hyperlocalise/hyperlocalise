import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { isErr, type Result } from "@/lib/primitives/result/results";
import {
  formatSsrfGuardError,
  validatePublicHttpUrl,
  type SsrfGuardError,
} from "@/lib/security/ssrf-guard";
import { resolvePublicHostAddress } from "@/lib/security/ssrf-guard-dns";

export const MAX_PUBLIC_HTTP_RESPONSE_BYTES = 5 * 1024 * 1024;

export async function assertResolvablePublicHttpUrl(
  url: string,
): Promise<Result<URL, SsrfGuardError>> {
  const urlResult = validatePublicHttpUrl(url);
  if (isErr(urlResult)) {
    return urlResult;
  }

  const hostResult = await resolvePublicHostAddress(urlResult.value.hostname);
  if (isErr(hostResult)) {
    return hostResult;
  }

  return urlResult;
}

/**
 * Fetch a public HTTP(S) URL with the DNS-vetted address pinned into the socket.
 * Keeps the original hostname for Host/SNI; only the TCP connect target is pinned.
 */
export async function withPublicHttpFetch<T>(
  url: string,
  init: RequestInit | undefined,
  handler: (response: Response) => Promise<T>,
): Promise<T> {
  const urlResult = validatePublicHttpUrl(url);
  if (isErr(urlResult)) {
    throw new Error(formatSsrfGuardError(urlResult.error));
  }

  const hostResult = await resolvePublicHostAddress(urlResult.value.hostname);
  if (isErr(hostResult)) {
    throw new Error(formatSsrfGuardError(hostResult.error));
  }

  const { address, family } = hostResult.value;
  const dispatcher = new Agent({
    connect: {
      lookup(_hostname, _options, callback) {
        callback(null, address, family);
      },
    },
    maxResponseSize: MAX_PUBLIC_HTTP_RESPONSE_BYTES,
  });

  try {
    const requestInit = {
      ...init,
      dispatcher,
      redirect: init?.redirect ?? "error",
    } as UndiciRequestInit;

    const response = (await undiciFetch(url, requestInit)) as unknown as Response;
    return await handler(response);
  } finally {
    await dispatcher.close();
  }
}

export async function readBoundedResponseBody(
  response: Response,
  maxBytes = MAX_PUBLIC_HTTP_RESPONSE_BYTES,
): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array();
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const length = Number(contentLength);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(`Response too large (exceeds ${maxBytes} byte limit)`);
    }
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      total += value.byteLength;
      if (total > maxBytes) {
        throw new Error(`Response too large (exceeds ${maxBytes} byte limit)`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}
