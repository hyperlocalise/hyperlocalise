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
import { listActiveSanityPluginStudioOrigins } from "@/lib/sanity/oauth";
import { DEFAULT_SANITY_STUDIO_ORIGINS, isHostedSanityStudioOrigin } from "@/lib/sanity/origins";

const ORIGIN_CACHE_TTL_MS = 60_000;
let cachedGrantedOrigins: { expiresAt: number; origins: Set<string> } | null = null;

function parseStaticAllowedOrigins(): Set<string> {
  const configured = env.SANITY_CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
  const origins = new Set([...DEFAULT_SANITY_STUDIO_ORIGINS, ...configured].filter(Boolean));

  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    origins.add("http://localhost:3000");
    origins.add("https://localhost:3000");
  }

  return origins;
}

async function resolveAllowedOrigins(): Promise<Set<string>> {
  const staticOrigins = parseStaticAllowedOrigins();
  const now = Date.now();
  if (cachedGrantedOrigins && cachedGrantedOrigins.expiresAt > now) {
    return new Set([...staticOrigins, ...cachedGrantedOrigins.origins]);
  }

  const granted = await listActiveSanityPluginStudioOrigins();
  cachedGrantedOrigins = {
    expiresAt: now + ORIGIN_CACHE_TTL_MS,
    origins: new Set(granted),
  };
  return new Set([...staticOrigins, ...granted]);
}

export const SANITY_INTEGRATION_ALLOWED_HEADERS = "Content-Type, X-Hyperlocalise-Access-Token";

export function isAllowedSanityIntegrationOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): origin is string {
  if (!origin || origin === "null") {
    return false;
  }
  return allowedOrigins.has(origin) || isHostedSanityStudioOrigin(origin);
}

/** Trusted Studio hosts that may start OAuth (localhost defaults, SANITY_CORS_ORIGINS, hosted Studio). */
export function isTrustedSanityStudioOrigin(origin: string | undefined): origin is string {
  return isAllowedSanityIntegrationOrigin(origin, parseStaticAllowedOrigins());
}

export const sanityCorsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  const allowedOrigins = await resolveAllowedOrigins();
  const allowOrigin =
    !origin || origin === "null" || isAllowedSanityIntegrationOrigin(origin, allowedOrigins)
      ? (origin ?? "*")
      : null;

  if (allowOrigin) {
    c.header("Access-Control-Allow-Origin", allowOrigin === "null" ? "*" : allowOrigin);
    c.header("Vary", "Origin");
  }

  c.header("Access-Control-Allow-Headers", SANITY_INTEGRATION_ALLOWED_HEADERS);
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});
