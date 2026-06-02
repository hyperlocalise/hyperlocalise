import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

const HMAC_KEY = Buffer.alloc(32);

export function isCronSecretConfigured() {
  return Boolean(env.CRON_SECRET);
}

export function readProvidedCronSecret(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-cron-secret")?.trim() ?? null;
}

function cronSecretsMatch(provided: string, expected: string) {
  const providedHmac = createHmac("sha256", HMAC_KEY).update(provided).digest();
  const expectedHmac = createHmac("sha256", HMAC_KEY).update(expected).digest();
  return timingSafeEqual(providedHmac, expectedHmac);
}

export function verifyCronRequest(request: Request) {
  const expectedSecret = env.CRON_SECRET;
  if (!expectedSecret) {
    return { ok: false as const, reason: "misconfigured" as const };
  }

  const providedSecret = readProvidedCronSecret(request);
  if (!providedSecret || !cronSecretsMatch(providedSecret, expectedSecret)) {
    return {
      ok: false as const,
      reason: "unauthorized" as const,
      hasAuthorizationHeader: Boolean(request.headers.get("authorization")),
      hasCronSecretHeader: Boolean(request.headers.get("x-cron-secret")),
    };
  }

  return { ok: true as const };
}
