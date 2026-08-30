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
import { createMiddleware } from "hono/factory";

import { env } from "@/lib/env";
import { DEFAULT_FIGMA_PLUGIN_ORIGINS } from "@/lib/figma/origins";

function parseAllowedOrigins(): Set<string> {
  const configured = env.FIGMA_CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
  const origins = new Set([...DEFAULT_FIGMA_PLUGIN_ORIGINS, ...configured].filter(Boolean));

  if (env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("https://localhost:3000");
    origins.add("null");
  }

  return origins;
}

const allowedOrigins = parseAllowedOrigins();

export const FIGMA_API_KEY_HEADER = "x-api-key";

export const figmaCorsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  const allowOrigin =
    !origin || origin === "null" || allowedOrigins.has(origin) ? (origin ?? "*") : null;

  if (allowOrigin) {
    c.header("Access-Control-Allow-Origin", allowOrigin === "null" ? "*" : allowOrigin);
    c.header("Vary", "Origin");
  }

  c.header("Access-Control-Allow-Headers", `Content-Type, ${FIGMA_API_KEY_HEADER}`);
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});
