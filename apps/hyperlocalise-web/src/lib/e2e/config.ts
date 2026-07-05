export type E2eAuthMode = "fixture" | "workos";
export type E2eTarget = "local" | "staging";

export const e2eConfig = {
  target: (process.env.E2E_TARGET ?? "local") as E2eTarget,
  baseUrl: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  authMode: (process.env.E2E_AUTH_MODE ?? "fixture") as E2eAuthMode,
};

export function isFixtureAuthEnabled() {
  // Bracket access avoids Next.js build-time inlining so e2e can enable this at runtime.
  const authMode = process.env["E2E_AUTH_MODE"];
  const vercelEnv = process.env["VERCEL_ENV"];
  return authMode === "fixture" && vercelEnv !== "production";
}

export const FIXTURE_SESSION_PREFIX = "test_";

export function isFixtureSessionToken(token: string | undefined | null) {
  return Boolean(token?.startsWith(FIXTURE_SESSION_PREFIX));
}
