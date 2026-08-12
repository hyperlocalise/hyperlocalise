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
import { createMiddleware } from "hono/factory";

type RequestBodyLimitOptions = {
  maxSize: number;
  onError: (c: Context) => Response | Promise<Response>;
};

/**
 * Body-size guard that stays compatible with Next.js-proxied Requests.
 *
 * Hono's built-in `bodyLimit` rebuilds the body with `new Request(c.req.raw, init)`,
 * which throws when Next wraps the Undici request in a Proxy. Rebuild from the URL
 * instead, matching the conversation upload path.
 */
export function createRequestBodyLimitMiddleware(options: RequestBodyLimitOptions) {
  const { maxSize, onError } = options;

  return createMiddleware(async (c, next) => {
    const rawRequest = c.req.raw;
    if (!rawRequest.body) {
      return next();
    }

    const hasTransferEncoding = rawRequest.headers.has("transfer-encoding");
    const contentLength = rawRequest.headers.get("content-length");
    if (contentLength && !hasTransferEncoding) {
      const parsedLength = Number.parseInt(contentLength, 10);
      if (!Number.isNaN(parsedLength)) {
        return parsedLength > maxSize ? onError(c) : next();
      }
    }

    let size = 0;
    const chunks: Uint8Array[] = [];
    const reader = rawRequest.body.getReader();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      size += value.byteLength;
      if (size > maxSize) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
        return onError(c);
      }
      chunks.push(value);
    }

    const replayRequestInit: RequestInit & { duplex: "half" } = {
      method: rawRequest.method,
      headers: rawRequest.headers,
      body: new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      }),
      signal: rawRequest.signal,
      duplex: "half",
    };
    c.req.raw = new Request(rawRequest.url, replayRequestInit);

    return next();
  });
}
