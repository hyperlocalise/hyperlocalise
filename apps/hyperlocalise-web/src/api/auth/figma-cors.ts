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

const DEFAULT_FIGMA_ORIGINS = ["https://www.figma.com", "https://figma.com", "null"];

function parseAllowedOrigins(): Set<string> {
  const configured = env.FIGMA_CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
  const origins = new Set([...DEFAULT_FIGMA_ORIGINS, ...configured].filter(Boolean));

  if (env.NODE_ENV === "development") {
    origins.add("http://localhost:3000");
    origins.add("https://localhost:3000");
    origins.add("null");
  }

  return origins;
}

const allowedOrigins = parseAllowedOrigins();

export const FIGMA_SESSION_HEADER = "x-hyperlocalise-figma-session";
export const FIGMA_ORGANIZATION_SLUG_HEADER = "x-hyperlocalise-organization-slug";

export const figmaCorsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  const allowOrigin =
    !origin || origin === "null" || allowedOrigins.has(origin) ? (origin ?? "*") : null;

  if (allowOrigin) {
    c.header("Access-Control-Allow-Origin", allowOrigin === "null" ? "*" : allowOrigin);
    c.header("Vary", "Origin");
  }

  c.header(
    "Access-Control-Allow-Headers",
    `Content-Type, Authorization, ${FIGMA_SESSION_HEADER}, ${FIGMA_ORGANIZATION_SLUG_HEADER}`,
  );
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});
