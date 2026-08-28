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

type RequestInitWithDuplex = RequestInit & { duplex?: "half" };

/**
 * Rebuild a Request from public fields so Hono can remount and clone it.
 *
 * Next.js (and Vercel Services) may hand route handlers a Proxy or a Request
 * from another undici copy. `new Request(thatRequest)` then throws
 * `Cannot read private member #state` because the constructor reads a class
 * private. Rebuild from URL + init instead.
 */
export function toPlainRequest(request: Request): Request {
  const method = request.method;
  const init: RequestInitWithDuplex = {
    method,
    headers: request.headers,
    signal: request.signal,
  };

  if (request.body != null && method !== "GET" && method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  return new Request(request.url, init);
}
