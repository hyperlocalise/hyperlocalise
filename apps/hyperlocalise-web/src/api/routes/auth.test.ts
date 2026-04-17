import "dotenv/config";

import { testClient } from "hono/testing";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkosAuthMiddleware, type IdentityResolver, type WorkosAuthIdentity } from "../auth/workos";
import type { ApiAuthContext } from "../auth/workos";

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

async function createClient(
  options: {
    resolver?: IdentityResolver;
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

  if (options.resolver) {
    vi.doMock("../auth/workos", async () => {
      const actual = await vi.importActual<typeof import("../auth/workos")>("../auth/workos");

      return {
        ...actual,
        workosAuthMiddleware: actual.createWorkosAuthMiddleware(options.resolver),
      };
    });
  }

  vi.doMock("@/lib/workos/auth", () => ({
    resolveApiAuthContextFromSession: vi.fn().mockResolvedValue(options.sessionAuthContext ?? null),
  }));

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
    const client = await createClient({ resolver });

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
    const client = await createClient({ resolver });

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

  it("resolves auth from first-party session headers", async () => {
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

  it("does not remap downstream known errors from the session auth path", async () => {
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

    const app = new Hono()
      .use("*", createWorkosAuthMiddleware())
      .get("/", () => {
        throw new Error("membership_sync_failed");
      });
    const client = testClient(app);

    const response = await client.index.$get(
      {},
      {
        headers: {
          cookie: "wos-session=test",
        },
      },
    );

    expect(response.status).toBe(500);
  });
});
