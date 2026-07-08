import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_KEY = Buffer.alloc(32);

export const E2E_SETUP_TOKEN_HEADER = "x-e2e-setup-token";

const MIN_E2E_AUTH_SECRET_LENGTH = 32;

function readEnv(name: string) {
  // Bracket access avoids Next.js build-time inlining so e2e can enable this at runtime.
  return process.env[name];
}

function isConfiguredE2eAuthSecret(secret: string | undefined) {
  return Boolean(secret && secret.length >= MIN_E2E_AUTH_SECRET_LENGTH);
}

export function isFixtureAuthEnabled() {
  const authMode = readEnv("E2E_AUTH_MODE");
  const vercelEnv = readEnv("VERCEL_ENV");
  const nodeEnv = readEnv("NODE_ENV");
  const secret = readEnv("E2E_AUTH_SECRET");

  if (authMode !== "fixture") {
    return false;
  }

  if (nodeEnv === "production") {
    return false;
  }

  if (vercelEnv === "production") {
    return false;
  }

  return isConfiguredE2eAuthSecret(secret);
}

export function verifyE2eSetupToken(provided: string | null | undefined) {
  if (!isFixtureAuthEnabled()) {
    return false;
  }

  const expected = readEnv("E2E_AUTH_SECRET");
  if (!isConfiguredE2eAuthSecret(expected) || !provided) {
    return false;
  }

  const providedHmac = createHmac("sha256", HMAC_KEY).update(provided).digest();
  const expectedHmac = createHmac("sha256", HMAC_KEY).update(expected!).digest();
  return timingSafeEqual(providedHmac, expectedHmac);
}

export function readE2eSetupTokenFromHeaders(headers: Headers) {
  return headers.get(E2E_SETUP_TOKEN_HEADER)?.trim() ?? null;
}

export function isFixtureAuthCookieSecure(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export const FIXTURE_SESSION_PREFIX = "test_";

export function isFixtureSessionToken(token: string | undefined | null) {
  return Boolean(token?.startsWith(FIXTURE_SESSION_PREFIX));
}
