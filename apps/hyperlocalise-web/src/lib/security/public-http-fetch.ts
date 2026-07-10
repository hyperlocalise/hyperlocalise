import { isErr, type Result } from "@/lib/primitives/result/results";
import {
  formatSsrfGuardError,
  validatePublicHttpUrl,
  type SsrfGuardError,
} from "@/lib/security/ssrf-guard";
import { resolveResolvablePublicHost } from "@/lib/security/ssrf-guard-dns";

export const MAX_PUBLIC_HTTP_RESPONSE_BYTES = 5 * 1024 * 1024;

export async function assertResolvablePublicHttpUrl(
  url: string,
): Promise<Result<URL, SsrfGuardError>> {
  const urlResult = validatePublicHttpUrl(url);
  if (isErr(urlResult)) {
    return urlResult;
  }

  const hostResult = await resolveResolvablePublicHost(urlResult.value.hostname);
  if (isErr(hostResult)) {
    return hostResult;
  }

  return urlResult;
}

export async function fetchPublicHttp(url: string, init?: RequestInit): Promise<Response> {
  const urlResult = await assertResolvablePublicHttpUrl(url);
  if (isErr(urlResult)) {
    throw new Error(formatSsrfGuardError(urlResult.error));
  }

  return fetch(url, {
    ...init,
    redirect: init?.redirect ?? "error",
  });
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
