import { createMiddleware } from "hono/factory";

import { env } from "@/lib/env";

const DEFAULT_CANVA_ORIGINS = [
  "https://app.canva.com",
  "https://www.canva.com",
  "https://canva.com",
];

function parseAllowedOrigins(): Set<string> {
  const configured = env.CANVA_CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [];
  const origins = new Set([...DEFAULT_CANVA_ORIGINS, ...configured].filter(Boolean));

  if (env.NODE_ENV === "development") {
    origins.add("http://localhost:8080");
    origins.add("https://localhost:8080");
    if (env.CANVA_APP_ORIGIN) {
      origins.add(env.CANVA_APP_ORIGIN);
    }
  }

  return origins;
}

const allowedOrigins = parseAllowedOrigins();

export const canvaCorsMiddleware = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  const allowOrigin = origin && allowedOrigins.has(origin) ? origin : null;

  if (allowOrigin) {
    c.header("Access-Control-Allow-Origin", allowOrigin);
    c.header("Vary", "Origin");
  }

  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Hyperlocalise-Connection-Token",
  );
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }

  await next();
});
