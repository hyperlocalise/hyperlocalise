import "dotenv/config";

import { testClient } from "hono/testing";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkosAuthMiddleware } from "../../auth/workos";
import type { ApiAuthContext } from "../../auth/workos";
import { enrichAuthContextWithCapabilities, getCapabilitiesForRole } from "../../auth/policy";

type SessionAuthContextInput = Omit<ApiAuthContext, "capabilities">;

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

async function createClient(
  options: {
    sessionAuthContext?: SessionAuthContextInput | null;
    mockProjectRoutes?: boolean;
  } = {},
) {
  vi.resetModules();

  vi.doMock("../health", async () => {
    const { Hono } = await import("hono");

    return {
      healthRoutes: new Hono().get("/", (c) => c.json({ ok: true }, 200)),
    };
  });

  if (options.mockProjectRoutes) {
    vi.doMock("../project/project.route", async () => {
      const { Hono } = await import("hono");
      const { workosAuthMiddleware } = await import("@/api/auth/workos");

      return {
        createProjectRoutes: () =>
          new Hono().use("*", workosAuthMiddleware).get("/", (c) => c.json({ projects: [] }, 200)),
      };
    });
  }

  resolveApiAuthContextFromSessionMock.mockResolvedValue(
    options.sessionAuthContext
      ? enrichAuthContextWithCapabilities(options.sessionAuthContext)
      : null,
  );

  vi.doMock("@/api/auth/workos-session", async () => {
    const actual = await vi.importActual<typeof import("@/api/auth/workos-session")>(
      "@/api/auth/workos-session",
    );
    return {
      ...actual,
      resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
    };
  });

  const { app } = await import("../../app");

  return testClient(app);
}

describe("authRoutes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../health");
    vi.doUnmock("../project/project.route");
    resolveApiAuthContextFromSessionMock.mockClear();
  });

  it("returns 401 when auth context is missing", async () => {
    const client = await createClient();
    const response = await client.api.auth.context.$get();

    expect(response.status).toBe(401);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
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
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
  });

  it("resolves auth from the first-party session", async () => {
    const activeOrganization = {
      workosOrganizationId: "org_123",
      localOrganizationId: "org_local_123",
      name: "Example Org",
      slug: "example-org",
      membership: {
        workosMembershipId: "membership_123",
        role: "owner" as const,
        accessSource: "workos_authoritative" as const,
      },
    };
    const client = await createClient({
      sessionAuthContext: {
        user: {
          workosUserId: "user_123",
          localUserId: "user_local_123",
          email: "user@example.com",
        },
        organizations: [activeOrganization],
        organization: activeOrganization,
        activeOrganization,
        membership: activeOrganization.membership,
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
          localUserId: "user_local_123",
          email: "user@example.com",
        },
        organization: {
          workosOrganizationId: "org_123",
          localOrganizationId: "org_local_123",
          name: "Example Org",
          slug: "example-org",
          membership: {
            workosMembershipId: "membership_123",
            role: "owner",
            accessSource: "workos_authoritative",
          },
        },
        activeOrganization: {
          workosOrganizationId: "org_123",
          localOrganizationId: "org_local_123",
          name: "Example Org",
          slug: "example-org",
          membership: {
            workosMembershipId: "membership_123",
            role: "owner",
            accessSource: "workos_authoritative",
          },
        },
        organizations: [
          {
            workosOrganizationId: "org_123",
            localOrganizationId: "org_local_123",
            name: "Example Org",
            slug: "example-org",
            membership: {
              workosMembershipId: "membership_123",
              role: "owner",
              accessSource: "workos_authoritative",
            },
          },
        ],
        membership: {
          workosMembershipId: "membership_123",
          role: "owner",
          accessSource: "workos_authoritative",
        },
        activeTeam: null,
        capabilities: getCapabilitiesForRole("owner"),
      },
    });
  });

  it("passes route organizationSlug to session auth resolution for org-scoped routes", async () => {
    const activeOrganization = {
      workosOrganizationId: "org_123",
      localOrganizationId: "org_local_123",
      name: "Example Org",
      slug: "example-org",
      membership: {
        workosMembershipId: "membership_123",
        role: "owner" as const,
        accessSource: "workos_authoritative" as const,
      },
    };

    const authContext = enrichAuthContextWithCapabilities({
      user: {
        workosUserId: "user_123",
        localUserId: "user_local_123",
        email: "user@example.com",
      },
      organizations: [activeOrganization],
      organization: activeOrganization,
      activeOrganization,
      membership: activeOrganization.membership,
      activeTeam: null,
    });

    const client = await createClient({ sessionAuthContext: authContext, mockProjectRoutes: true });

    const response = await client.api.orgs[":organizationSlug"].projects.$get(
      { param: { organizationSlug: "target-org" } },
      { headers: { cookie: "wos-session=test" } },
    );

    expect(response.status).toBe(200);
    expect(resolveApiAuthContextFromSessionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ organizationSlug: "target-org" }),
    );
  });

  it("returns 403 for org-scoped routes when requested organization slug is not accessible", async () => {
    const client = await createClient();
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new Error("organization_access_denied"),
    );

    const response = await client.api.orgs[":organizationSlug"].projects.$get(
      { param: { organizationSlug: "forbidden-org" } },
      { headers: { cookie: "wos-session=test" } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "organization_access_denied",
      message: expect.any(String),
    });
  });

  it("does not remap downstream errors from the session auth path", async () => {
    const activeOrganization = {
      workosOrganizationId: "org_123",
      localOrganizationId: "org_local_123",
      name: "Example Org",
      slug: "example-org",
      membership: {
        workosMembershipId: "membership_123",
        role: "owner" as const,
      },
    };
    vi.resetModules();
    resolveApiAuthContextFromSessionMock.mockResolvedValue(
      enrichAuthContextWithCapabilities({
        user: {
          workosUserId: "user_123",
          localUserId: "user_local_123",
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
      }),
    );
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
