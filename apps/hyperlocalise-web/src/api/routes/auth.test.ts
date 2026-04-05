import { testClient } from "hono/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { IdentityResolver, WorkosAuthIdentity } from "../auth/workos";

function createWorkosIdentity(): WorkosAuthIdentity {
  return {
    user: {
      workosUserId: "user_123",
      email: "user@example.com",
    },
    organization: {
      workosOrganizationId: "org_123",
      name: "Example Org",
      slug: "example-org",
    },
    membership: {
      workosMembershipId: "membership_123",
      role: "owner",
    },
  };
}

async function createClient(resolver?: IdentityResolver) {
  vi.resetModules();

  vi.doMock("./health", async () => {
    const { Hono } = await import("hono");

    return {
      healthRoutes: new Hono().get("/", (c) => c.json({ ok: true }, 200)),
    };
  });

  if (resolver) {
    vi.doMock("../auth/workos", async () => {
      const actual = await vi.importActual<typeof import("../auth/workos")>(
        "../auth/workos",
      );

      return {
        ...actual,
        workosAuthMiddleware: actual.createWorkosAuthMiddleware(resolver),
      };
    });
  }

  const { app } = await import("../app");

  return testClient(app);
}

describe("authRoutes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../auth/workos");
    vi.doUnmock("./health");
  });

  it("returns 400 for known auth errors", async () => {
    const resolver: IdentityResolver = {
      resolve: vi.fn().mockRejectedValue(new Error("membership_sync_failed")),
    };
    const client = await createClient(resolver);

    const response = await client.api.auth.context.$get(
      {},
      {
        headers: {
          "x-hyperlocalise-auth": JSON.stringify(createWorkosIdentity()),
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_auth_context",
    });
  });

  it("returns 500 for unknown resolver errors", async () => {
    const resolver: IdentityResolver = {
      resolve: vi.fn().mockRejectedValue(new Error("database_timeout")),
    };
    const client = await createClient(resolver);

    const response = await client.api.auth.context.$get(
      {},
      {
        headers: {
          "x-hyperlocalise-auth": JSON.stringify(createWorkosIdentity()),
        },
      },
    );

    expect(response.status).toBe(500);
  });

  it("returns 400 for invalid WorkOS header values", async () => {
    const client = await createClient();

    const response = await client.api.auth.context.$get(
      {},
      {
        headers: {
          "x-workos-user-id": "user_123",
          "x-workos-user-email": "user@example.com",
          "x-workos-organization-id": "org_123",
          "x-workos-organization-name": "Example Org",
          "x-workos-role": "owner",
          "x-workos-user-avatar-url": "not-a-url",
        },
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_auth_context",
    });
  });
});
