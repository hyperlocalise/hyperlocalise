import "dotenv/config";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

const { resolveApiAuthContextFromSessionMock, updateOrganizationMock } = vi.hoisted(() => ({
  resolveApiAuthContextFromSessionMock: vi.fn(
    (options) =>
      globalThis.__resolveTestApiAuthContextFromSession?.(options) ??
      globalThis.__testApiAuthContext ??
      null,
  ),
  updateOrganizationMock: vi.fn(async () => ({ id: "org_mock" })),
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({
    organizations: {
      updateOrganization: updateOrganizationMock,
    },
  }),
}));

import { createApp } from "@/api/app";
import { StaleOrganizationSlugError } from "@/api/auth/workos-session";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";

const client = testClient(createApp());
const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  vi.clearAllMocks();
  await fixture.cleanup();
});

describe("workspaceRoutes", () => {
  it("updates workspace name and slug for an owner", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].workspace.$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "Renamed Workspace", slug: "renamed-workspace" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      workspace: { name: string; slug: string | null; identityProvider: string };
      redirectTo: string;
    };
    expect(body.workspace).toMatchObject({
      name: "Renamed Workspace",
      slug: "renamed-workspace",
      identityProvider: "workos",
    });
    expect(body.redirectTo).toBe("/org/renamed-workspace/settings/account");
    expect(response.headers.get("set-cookie")).toContain("hl_active_org_slug=renamed-workspace");

    const [storedOrganization] = await db
      .select({ name: schema.organizations.name, slug: schema.organizations.slug })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);
    expect(storedOrganization).toEqual({
      name: "Renamed Workspace",
      slug: "renamed-workspace",
    });
  });

  it("allows an admin to update workspace settings", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].workspace.$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "Admin Managed", slug: "admin-managed" },
      },
      { headers },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      workspace: { name: "Admin Managed", slug: "admin-managed" },
    });
  });

  it("returns workspace_identity_unavailable when WorkOS name sync fails", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);
    updateOrganizationMock.mockRejectedValueOnce(new Error("workos unavailable"));

    const response = await client.api.orgs[":organizationSlug"].workspace.$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "Broken Sync" },
      },
      { headers },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "workspace_identity_unavailable",
    });
  });

  it("denies workspace updates for members", async () => {
    const identity = fixture.createWorkosIdentityWithRole("member");
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].workspace.$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { name: "Member Rename" },
      },
      { headers },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "forbidden",
    });
  });

  it("rejects slug conflicts", async () => {
    const identity = fixture.createWorkosIdentity();
    const otherIdentity = fixture.createWorkosIdentity();
    await fixture.authHeadersFor(otherIdentity);
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].workspace.$patch(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
        json: { slug: otherIdentity.organization.slug },
      },
      { headers },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "workspace_slug_conflict",
    });
  });

  it("returns a clear stale slug response", async () => {
    resolveApiAuthContextFromSessionMock.mockRejectedValueOnce(
      new StaleOrganizationSlugError("old-workspace", "new-workspace"),
    );

    const response = await client.api.orgs[":organizationSlug"].workspace.$get(
      { param: { organizationSlug: "old-workspace" } },
      { headers: { cookie: "wos-session=test" } },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "stale_organization_slug",
      details: {
        requestedSlug: "old-workspace",
        currentSlug: "new-workspace",
        redirectTo: "/org/new-workspace/dashboard",
      },
    });
  });

  it("archives workspaces instead of hard deleting them", async () => {
    const identity = fixture.createWorkosIdentity();
    const headers = await fixture.authHeadersFor(identity);

    const response = await client.api.orgs[":organizationSlug"].workspace.$delete(
      {
        param: { organizationSlug: identity.organization.slug ?? "missing-slug" },
      },
      { headers },
    );

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();

    const [storedOrganization] = await db
      .select({
        lifecycleStatus: schema.organizations.lifecycleStatus,
        archivedAt: schema.organizations.archivedAt,
      })
      .from(schema.organizations)
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);
    expect(storedOrganization?.lifecycleStatus).toBe("archived");
    expect(storedOrganization?.archivedAt).toBeInstanceOf(Date);
  });
});
