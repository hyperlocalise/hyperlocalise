import "dotenv/config";

import { Hono } from "hono";
import { evlog } from "evlog/hono";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createWorkosAuthMiddleware, enrichAuthContextWithCapabilities } from "@/api/auth/workos";
import {
  OrganizationSlugUnresolvableError,
  StaleOrganizationSlugError,
} from "@/api/auth/workos-session";

const { resolveApiAuthContextFromSessionMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

function createTestApp() {
  return new Hono().use("*", evlog()).route(
    "/orgs/:organizationSlug",
    new Hono()
      .use("*", createWorkosAuthMiddleware())
      .get("/projects", (c) => c.json({ projects: [] }, 200)),
  );
}

const sessionHeaders = { headers: { cookie: "wos-session=test" } };

afterEach(() => {
  resolveApiAuthContextFromSessionMock.mockReset();
});

describe("workosAuthMiddleware", () => {
  it("returns 401 when the session cookie is missing", async () => {
    const response = await createTestApp().request("http://localhost/orgs/example/projects");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "unauthorized" });
  });

  it("returns stale_organization_slug with redirect details", async () => {
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new StaleOrganizationSlugError("old-slug", "new-slug"),
    );

    const response = await createTestApp().request("http://localhost/orgs/old-slug/projects", {
      ...sessionHeaders,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "stale_organization_slug",
      details: {
        requestedSlug: "old-slug",
        currentSlug: "new-slug",
        redirectTo: "/org/new-slug/dashboard",
      },
    });
  });

  it("returns organization_slug_unresolvable for unknown multi-org slugs", async () => {
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new OrganizationSlugUnresolvableError("missing-slug"),
    );

    const response = await createTestApp().request("http://localhost/orgs/missing-slug/projects", {
      ...sessionHeaders,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "organization_slug_unresolvable",
    });
  });

  it("returns workspace_archived for archived-only access", async () => {
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new Error("archived_organization_access"),
    );

    const response = await createTestApp().request("http://localhost/orgs/archived/projects", {
      ...sessionHeaders,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "workspace_archived",
    });
  });

  it("returns workos_membership_lookup_failed when reconcile verification fails", async () => {
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new Error("workos_membership_lookup_failed"),
    );

    const response = await createTestApp().request("http://localhost/orgs/example/projects", {
      ...sessionHeaders,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "workos_membership_lookup_failed",
    });
  });

  it("allows org-scoped requests for authoritative members", async () => {
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

    resolveApiAuthContextFromSessionMock.mockResolvedValueOnce(
      enrichAuthContextWithCapabilities({
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
      }),
    );

    const response = await createTestApp().request("http://localhost/orgs/example-org/projects", {
      ...sessionHeaders,
    });

    expect(response.status).toBe(200);
    expect(resolveApiAuthContextFromSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({ organizationSlug: "example-org" }),
    );
  });
});
