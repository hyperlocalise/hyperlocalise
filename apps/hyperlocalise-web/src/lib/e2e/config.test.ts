import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { isFixtureAuthEnabled, readE2eSetupTokenFromHeaders, verifyE2eSetupToken } from "./config";

describe("e2e fixture auth config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled unless E2E_AUTH_MODE is fixture", () => {
    vi.stubEnv("E2E_AUTH_MODE", "workos");
    vi.stubEnv("E2E_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("VERCEL_ENV", "");

    expect(isFixtureAuthEnabled()).toBe(false);
  });

  it("is disabled when NODE_ENV is production", () => {
    vi.stubEnv("E2E_AUTH_MODE", "fixture");
    vi.stubEnv("E2E_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");

    expect(isFixtureAuthEnabled()).toBe(false);
  });

  it("is disabled when VERCEL_ENV is production", () => {
    vi.stubEnv("E2E_AUTH_MODE", "fixture");
    vi.stubEnv("E2E_AUTH_SECRET", "a".repeat(32));
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");

    expect(isFixtureAuthEnabled()).toBe(false);
  });

  it("is disabled when E2E_AUTH_SECRET is missing or too short", () => {
    vi.stubEnv("E2E_AUTH_MODE", "fixture");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("E2E_AUTH_SECRET", "");

    expect(isFixtureAuthEnabled()).toBe(false);

    vi.stubEnv("E2E_AUTH_SECRET", "too-short");
    expect(isFixtureAuthEnabled()).toBe(false);
  });

  it("is enabled only for non-production fixture mode with a configured secret", () => {
    vi.stubEnv("E2E_AUTH_MODE", "fixture");
    vi.stubEnv("E2E_AUTH_SECRET", "local-only-e2e-auth-secret-32chars");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");

    expect(isFixtureAuthEnabled()).toBe(true);
  });

  it("verifies the setup token with a timing-safe compare", () => {
    vi.stubEnv("E2E_AUTH_MODE", "fixture");
    vi.stubEnv("E2E_AUTH_SECRET", "local-only-e2e-auth-secret-32chars");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");

    expect(verifyE2eSetupToken("local-only-e2e-auth-secret-32chars")).toBe(true);
    expect(verifyE2eSetupToken("wrong-secret-value-32-characters!")).toBe(false);
    expect(verifyE2eSetupToken(null)).toBe(false);
  });

  it("reads the setup token header case-insensitively", () => {
    const headers = new Headers({ "x-e2e-setup-token": "secret-value" });
    expect(readE2eSetupTokenFromHeaders(headers)).toBe("secret-value");
  });
});
