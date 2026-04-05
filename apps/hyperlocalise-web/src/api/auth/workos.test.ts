import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import {
  createWorkosAuthMiddleware,
  type ApiAuthContext,
  type IdentityResolver,
} from "./workos";

function createAuthContext(): ApiAuthContext {
  return {
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
  };
}

function createApp(resolver: IdentityResolver) {
  const app = new Hono();

  app.use("*", createWorkosAuthMiddleware(resolver));
  app.get("/", (c) => c.json({ ok: true }));

  return app;
}

describe("createWorkosAuthMiddleware", () => {
  it("returns 400 for known auth errors", async () => {
    const resolver: IdentityResolver = {
      resolve: vi.fn().mockRejectedValue(new Error("membership_sync_failed")),
    };
    const app = createApp(resolver);

    const response = await app.request("http://localhost/", {
      headers: {
        "x-hyperlocalise-auth": JSON.stringify(createAuthContext()),
      },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_auth_context",
    });
  });

  it("rethrows unknown resolver errors", async () => {
    const resolver: IdentityResolver = {
      resolve: vi.fn().mockRejectedValue(new Error("database_timeout")),
    };
    const app = createApp(resolver);

    const response = await app.request("http://localhost/", {
      headers: {
        "x-hyperlocalise-auth": JSON.stringify(createAuthContext()),
      },
    });

    expect(response.status).toBe(500);
  });
});
