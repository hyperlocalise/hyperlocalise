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
import { handle as honoHandle } from "hono/vercel";

import { toPlainRequest } from "./to-plain-request";

/**
 * Vercel/Next route adapter that unwraps proxied Requests before Hono.
 *
 * Hono `.route()` remounts with `new Request(url, request)` and `bodyLimit`
 * clones with `new Request(raw, init)`. Both throw on Next.js-proxied
 * Requests after the Vercel Services runtime change.
 */
export function handle(app: Parameters<typeof honoHandle>[0]) {
  const handler = honoHandle(app);
  return (request: Request) => handler(toPlainRequest(request));
}
