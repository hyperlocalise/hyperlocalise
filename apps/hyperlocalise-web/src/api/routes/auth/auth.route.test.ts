import "dotenv/config";

import { testClient } from "hono/testing";
import { evlog } from "evlog/hono";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createWorkosAuthMiddleware,
  workosAuthMiddleware,
  type ApiAuthContext,
} from "../../auth/workos";
import { enrichAuthContextWithCapabilities, getCapabilitiesForRole } from "../../auth/policy";

type SessionAuthContextInput = Omit<ApiAuthContext, "capabilities">;

const { resolveApiAuthContextFromSessionMock, withAuthMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(),
  withAuthMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

import { authRoutes } from "./auth.route";

const authClient = testClient(new Hono().use("*", evlog()).route("/", authRoutes));

function createOrgScopedClient() {
  return testClient(
    new Hono()
      .use("*", evlog())
      .basePath("/api")
      .route(
        "/orgs/:organizationSlug",
        new Hono().route(
          "/projects",
          new Hono().use("*", workosAuthMiddleware).get("/", (c) => c.json({ projects: [] }, 200)),
        ),
      ),
  );
}

function mockSessionAuthContext(sessionAuthContext: SessionAuthContextInput) {
  resolveApiAuthContextFromSessionMock.mockResolvedValue(
    enrichAuthContextWithCapabilities(sessionAuthContext),
  );
}

describe("authRoutes", () => {
  afterEach(() => {
    resolveApiAuthContextFromSessionMock.mockReset();
    withAuthMock.mockReset();
    withAuthMock.mockResolvedValue({
      user: {
        id: "user_123",
        email: "user@example.com",
      },
    });
  });

  it("returns 401 when auth context is missing", async () => {
    const response = await authClient.context.$get();

    expect(response.status).toBe(401);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({ error: "unauthorized", message: expect.any(String) });
  });

  it("ignores forged auth headers without a session", async () => {
    const response = await authClient.context.$get(
      {},
      {
        headers: {
          "x-hyperlocalise-auth": JSON.stringify({
            user: { workosUserId: "user_123", email: "user@example.com" },
            organization: { workosOrganizationId: "org_123", name: "Example Org" },
            membership: { role: "admin" },
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
        role: "admin" as const,
        accessSource: "workos_authoritative" as const,
      },
    };
    mockSessionAuthContext({
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

    const response = await authClient.context.$get(
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
            role: "admin",
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
            role: "admin",
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
              role: "admin",
              accessSource: "workos_authoritative",
            },
          },
        ],
        membership: {
          workosMembershipId: "membership_123",
          role: "admin",
          accessSource: "workos_authoritative",
        },
        activeTeam: null,
        capabilities: getCapabilitiesForRole("admin"),
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
        role: "admin" as const,
        accessSource: "workos_authoritative" as const,
      },
    };

    mockSessionAuthContext({
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

    const client = createOrgScopedClient();
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
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new Error("organization_access_denied"),
    );

    const client = createOrgScopedClient();
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
        role: "admin" as const,
        accessSource: "workos_authoritative" as const,
      },
    };
    mockSessionAuthContext({
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

    const app = new Hono()
      .use("*", evlog())
      .use("*", createWorkosAuthMiddleware())
      .get("/", () => {
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
