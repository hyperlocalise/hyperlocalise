import "dotenv/config";

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { LOCAL_ORG_WORKOS_ID_PREFIX } from "@/lib/billing/autumn-customer";
import { db, schema } from "@/lib/database";

const { provisionWorkspaceInWorkosMock } = vi.hoisted(() => ({
  provisionWorkspaceInWorkosMock: vi.fn(),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "WORKOS_API_KEY") {
          return "sk_test_migrate_local_org";
        }

        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({}),
}));

vi.mock("@/lib/workos/provision-workspace-in-workos", () => ({
  provisionWorkspaceInWorkos: provisionWorkspaceInWorkosMock,
}));

const { createWorkosIdentity, cleanup } = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  provisionWorkspaceInWorkosMock.mockReset();
  await cleanup();
});

describe("migrateLocalOrgWorkspaceToWorkos", () => {
  it("promotes a local_org workspace and updates membership ids", async () => {
    const identity = createWorkosIdentity();
    const synced = await syncWorkosIdentity(db, identity);
    const localOrgId = `${LOCAL_ORG_WORKOS_ID_PREFIX}${synced.organization.id}`;

    await db
      .update(schema.organizations)
      .set({ workosOrganizationId: localOrgId, lifecycleStatus: "deprecated" })
      .where(eq(schema.organizations.id, synced.organization.id));

    const organization = { id: synced.organization.id };

    const promotedWorkosOrganizationId = `org_workos_promoted_${randomUUID()}`;
    const promotedWorkosMembershipId = `om_workos_promoted_${randomUUID()}`;

    provisionWorkspaceInWorkosMock.mockResolvedValue({
      workosOrganizationId: promotedWorkosOrganizationId,
      members: [
        {
          workosUserId: identity.user.workosUserId,
          workosMembershipId: promotedWorkosMembershipId,
          role: identity.membership.role,
        },
      ],
    });

    const { migrateLocalOrgWorkspaceToWorkos } = await import("./migrate-local-org-to-workos");

    const result = await migrateLocalOrgWorkspaceToWorkos(db, organization.id);

    expect(provisionWorkspaceInWorkosMock).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: "migrated",
      workosOrganizationId: promotedWorkosOrganizationId,
      membershipsUpdated: 1,
    });

    const [updatedOrganization] = await db
      .select({
        workosOrganizationId: schema.organizations.workosOrganizationId,
        lifecycleStatus: schema.organizations.lifecycleStatus,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, organization.id))
      .limit(1);

    expect(updatedOrganization).toEqual({
      workosOrganizationId: promotedWorkosOrganizationId,
      lifecycleStatus: "active",
    });

    const [updatedMembership] = await db
      .select({ workosMembershipId: schema.organizationMemberships.workosMembershipId })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .where(eq(schema.users.workosUserId, identity.user.workosUserId))
      .limit(1);

    expect(updatedMembership?.workosMembershipId).toBe(promotedWorkosMembershipId);
  });

  it("skips organizations that already use real WorkOS ids", async () => {
    const identity = createWorkosIdentity();
    const synced = await syncWorkosIdentity(db, identity);

    const { migrateLocalOrgWorkspaceToWorkos } = await import("./migrate-local-org-to-workos");

    const result = await migrateLocalOrgWorkspaceToWorkos(db, synced.organization.id);

    expect(result).toEqual({ status: "skipped", reason: "not_local_org" });
    expect(provisionWorkspaceInWorkosMock).not.toHaveBeenCalled();
  });
});
