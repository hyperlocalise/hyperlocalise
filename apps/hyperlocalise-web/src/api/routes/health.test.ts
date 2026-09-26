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
import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

async function createClient(isHealthy: boolean, isVercelRuntime = false) {
  vi.resetModules();
  vi.stubEnv("VERCEL", isVercelRuntime ? "1" : "");

  vi.doMock("@/lib/database/client", () => ({
    isDatabaseHealthy: vi.fn().mockResolvedValue(isHealthy),
  }));

  vi.doMock("@/lib/env", () => ({
    env: {
      AWS_REGION: "us-east-1",
      AWS_ROLE_ARN: "arn:aws:iam::123456789012:role/test-role",
    },
  }));

  const { healthRoutes } = await import("./health");

  return testClient(healthRoutes);
}

describe("healthRoutes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/database/client");
    vi.doUnmock("@/lib/env");
    vi.unstubAllEnvs();
  });

  it("returns 200 when database is healthy", async () => {
    const client = await createClient(true);
    const response = await client.index.$get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: {
        database: true,
        oidc: {
          configured: false,
          provider: "default_credentials",
          status: "not_checked",
        },
      },
    });
  });

  it("returns 503 when database is unavailable", async () => {
    const client = await createClient(false);
    const response = await client.index.$get();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "database_unavailable",
      checks: {
        database: false,
        oidc: {
          configured: false,
          provider: "default_credentials",
          status: "not_checked",
        },
      },
    });
  });

  it("reports configured Vercel OIDC in the health response", async () => {
    vi.doMock("@aws-sdk/client-sts", () => ({
      GetCallerIdentityCommand: class {},
      STSClient: class {
        send() {
          return Promise.resolve({ Account: "123456789012" });
        }
      },
    }));
    vi.doMock("@vercel/oidc-aws-credentials-provider", () => ({
      awsCredentialsProvider: vi.fn(() => vi.fn()),
    }));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");

    const client = await createClient(true, true);
    const response = await client.index.$get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: {
        database: true,
        oidc: {
          configured: true,
          provider: "vercel_oidc",
          status: "ok",
        },
      },
    });
  });

  it("does not require production OIDC in a Vercel preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const client = await createClient(true, true);
    const response = await client.index.$get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checks: {
        database: true,
        oidc: {
          configured: false,
          provider: "vercel_oidc",
          status: "not_checked",
        },
      },
    });
  });
});
