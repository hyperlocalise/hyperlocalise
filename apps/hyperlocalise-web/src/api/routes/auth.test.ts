import "dotenv/config";

import { testClient } from "hono/testing";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkosAuthMiddleware } from "../auth/workos";
import type { ApiAuthContext } from "../auth/workos";

async function createClient(
  options: {
    sessionAuthContext?: ApiAuthContext | null;
  } = {},
) {
  vi.resetModules();

  vi.doMock("./health", async () => {
    const { Hono } = await import("hono");

    return {
      healthRoutes: new Hono().get("/", (c) => c.json({ ok: true }, 200)),
    };
  });

  vi.doMock("@/lib/workos/auth", () => ({
    resolveApiAuthContextFromSession: vi.fn().mockResolvedValue(options.sessionAuthContext ?? null),
  }));

  const { app } = await import("../app");

  return testClient(app);
}

describe("authRoutes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("./health");
  });

  it("returns 401 when auth context is missing", async () => {
    const client = await createClient();
    const response = await client.api.auth.context.$get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
    });
  });

  it("ignores forged auth headers without a session", async () => {
    const client = await createClient();

    const response = await client.api.auth.context.$get(
      {},
      {
        headers: {
          "x-hyperlocalise-auth": JSON.stringify({
            user: { workosUserId: "user_123", email: "user@example.com" },
            organization: { workosOrganizationId: "org_123", name: "Example Org" },
            membership: { role: "owner" },
          }),
        },
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
    });
  });

  it("resolves auth from the first-party session", async () => {
    const client = await createClient({
      sessionAuthContext: {
        user: {
          workosUserId: "user_123",
          localUserId: "local_user_123",
          email: "user@example.com",
        },
        organization: {
          workosOrganizationId: "org_123",
          localOrganizationId: "local_org_123",
          name: "Example Org",
          slug: "example-org",
        },
        membership: {
          workosMembershipId: "membership_123",
          role: "owner",
        },
      },
    });

    const response = await client.api.auth.context.$get(
      {},
      {
        headers: {
          cookie: "wos-session=test",
        },
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      auth: {
        user: {
          workosUserId: "user_123",
          localUserId: "local_user_123",
          email: "user@example.com",
        },
        organization: {
          workosOrganizationId: "org_123",
          localOrganizationId: "local_org_123",
          name: "Example Org",
          slug: "example-org",
        },
        membership: {
          workosMembershipId: "membership_123",
          role: "owner",
        },
      },
    });
  });

  it("does not remap downstream errors from the session auth path", async () => {
    vi.resetModules();
    vi.doMock("@/lib/workos/auth", () => ({
      resolveApiAuthContextFromSession: vi.fn().mockResolvedValue({
        user: {
          workosUserId: "user_123",
          localUserId: "local_user_123",
          email: "user@example.com",
        },
        organization: {
          workosOrganizationId: "org_123",
          localOrganizationId: "local_org_123",
          name: "Example Org",
          slug: "example-org",
        },
        membership: {
          workosMembershipId: "membership_123",
          role: "owner",
        },
      }),
    }));

    const app = new Hono().use("*", createWorkosAuthMiddleware()).get("/", () => {
      throw new Error("membership_sync_failed");
    });
    const response = await app.request("http://localhost/", {
      headers: {
        cookie: "wos-session=test",
      },
    });

    expect(response.status).toBe(500);
  });
});
