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

import { DEFAULT_CANVA_EDITOR_ORIGINS, isCanvaAppsIframeOrigin } from "@/lib/canva/origins";
import { env } from "@/lib/env";

function parseAllowedOrigins(): Set<string> {
  const configured = env.CANVA_CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
  const origins = new Set<string>([...DEFAULT_CANVA_EDITOR_ORIGINS, ...configured].filter(Boolean));

  if (env.CANVA_APP_ORIGIN) {
    origins.add(env.CANVA_APP_ORIGIN);
  }

  if (env.NODE_ENV === "development") {
    origins.add("http://localhost:8080");
    origins.add("https://localhost:8080");
  }

  return origins;
}

const allowedOrigins = parseAllowedOrigins();

export function isAllowedCanvaCorsOrigin(origin: string | undefined): origin is string {
  if (!origin) {
    return false;
  }

  return allowedOrigins.has(origin) || isCanvaAppsIframeOrigin(origin);
}

export const canvaCorsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  const allowOrigin = isAllowedCanvaCorsOrigin(origin) ? origin : null;

  if (allowOrigin) {
    c.header("Access-Control-Allow-Origin", allowOrigin);
    c.header("Vary", "Origin");
  }

  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Hyperlocalise-Access-Token, X-Hyperlocalise-Connection-Token, X-Hyperlocalise-Claim-Token",
  );
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});
