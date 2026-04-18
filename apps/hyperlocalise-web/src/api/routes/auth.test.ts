import "dotenv/config";

import { testClient } from "hono/testing";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkosAuthMiddleware } from "../auth/workos";
import type { ApiAuthContext } from "../auth/workos";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("inngest/hono", () => ({
  serve: () => () => new Response(null, { status: 204 }),
}));

vi.mock("@/lib/inngest", () => ({
  inngest: {},
  createInngestTranslationJobQueue: () => ({
    enqueue: async () => ({ ids: [] }),
  }),
}));

vi.mock("@/lib/translation/translation-job-queued-function", () => ({
  translationJobQueuedFunction: {},
}));

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

  resolveApiAuthContextFromSessionMock.mockResolvedValue(options.sessionAuthContext ?? null);

  vi.doMock("@/api/auth/workos-session", () => ({
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
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
    const activeOrganization = {
      workosOrganizationId: "org_123",
      localOrganizationId: "local_org_123",
      name: "Example Org",
      slug: "example-org",
      membership: {
        workosMembershipId: "membership_123",
        role: "owner" as const,
      },
    };
    const client = await createClient({
      sessionAuthContext: {
        user: {
          workosUserId: "user_123",
          localUserId: "local_user_123",
          email: "user@example.com",
        },
        organizations: [activeOrganization],
        organization: activeOrganization,
        activeOrganization,
        membership: {
          workosMembershipId: "membership_123",
          role: "owner",
        },
        activeTeam: null,
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
          membership: {
            workosMembershipId: "membership_123",
            role: "owner",
          },
        },
        activeOrganization: {
          workosOrganizationId: "org_123",
          localOrganizationId: "local_org_123",
          name: "Example Org",
          slug: "example-org",
          membership: {
            workosMembershipId: "membership_123",
            role: "owner",
          },
        },
        organizations: [
          {
            workosOrganizationId: "org_123",
            localOrganizationId: "local_org_123",
            name: "Example Org",
            slug: "example-org",
            membership: {
              workosMembershipId: "membership_123",
              role: "owner",
            },
          },
        ],
        membership: {
          workosMembershipId: "membership_123",
          role: "owner",
        },
        activeTeam: null,
      },
    });
  });

  it("does not remap downstream errors from the session auth path", async () => {
    const activeOrganization = {
      workosOrganizationId: "org_123",
      localOrganizationId: "local_org_123",
      name: "Example Org",
      slug: "example-org",
      membership: {
        workosMembershipId: "membership_123",
        role: "owner" as const,
      },
    };
    vi.resetModules();
    resolveApiAuthContextFromSessionMock.mockResolvedValue({
      user: {
        workosUserId: "user_123",
        localUserId: "local_user_123",
        email: "user@example.com",
      },
      organizations: [activeOrganization],
      organization: activeOrganization,
      activeOrganization,
      membership: {
        workosMembershipId: "membership_123",
        role: "owner",
      },
      activeTeam: null,
    });
    vi.doMock("@/api/auth/workos-session", () => ({
      resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
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
