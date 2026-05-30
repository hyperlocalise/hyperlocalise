import "dotenv/config";

import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db, schema } from "@/lib/database";
import { INVITED_WORKOS_USER_ID_PREFIX } from "@/lib/workos/constants";

const { listMembershipsMock, getOrganizationMock } = vi.hoisted(() => ({
  listMembershipsMock: vi.fn(),
  getOrganizationMock: vi.fn(),
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "WORKOS_API_KEY") {
          return "sk_test_reconcile";
        }

        return Reflect.get(target, property, receiver);
      },
    }),
  };
});

vi.mock("@/lib/workos/server-client", () => ({
  getWorkosServerClient: () => ({
    userManagement: {
      listOrganizationMemberships: listMembershipsMock,
    },
    organizations: {
      getOrganization: getOrganizationMock,
    },
  }),
}));

const { createWorkosIdentity, cleanup } = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  listMembershipsMock.mockReset();
  getOrganizationMock.mockReset();
  await cleanup();
});

describe("reconcileWorkosMembershipsForUser", () => {
  it("skips placeholder invited users", async () => {
    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");

    const result = await reconcileWorkosMembershipsForUser(db, {
      workosUserId: `${INVITED_WORKOS_USER_ID_PREFIX}abc`,
      email: "invite@example.com",
      force: true,
    });

    expect(result).toEqual({ status: "skipped" });
    expect(listMembershipsMock).not.toHaveBeenCalled();
  });

  it("revokes local memberships removed from WorkOS", async () => {
    const primary = createWorkosIdentity();
    const secondary = {
      ...createWorkosIdentity(),
      user: primary.user,
      membership: {
        workosMembershipId: `${primary.membership.workosMembershipId}-secondary`,
        role: "admin" as const,
      },
    };

    await syncWorkosIdentity(db, primary);
    await syncWorkosIdentity(db, secondary);

    listMembershipsMock.mockResolvedValue({
      autoPagination: async () => [
        {
          id: primary.membership.workosMembershipId,
          organizationId: primary.organization.workosOrganizationId,
          status: "active",
          role: { slug: "owner" },
        },
      ],
    });

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    const result = await reconcileWorkosMembershipsForUser(db, {
      workosUserId: primary.user.workosUserId,
      email: primary.user.email,
      force: true,
    });

    expect(result).toMatchObject({ status: "reconciled", revoked: 1 });

    const memberships = await db
      .select({
        workosOrganizationId: schema.organizations.workosOrganizationId,
      })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMemberships.organizationId, schema.organizations.id),
      )
      .where(eq(schema.users.workosUserId, primary.user.workosUserId));

    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.workosOrganizationId).toBe(primary.organization.workosOrganizationId);
  });

  it("syncs memberships returned from WorkOS", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, {
      ...identity,
      membership: {
        role: "member",
      },
    });

    const remoteMembershipId = `om_${identity.membership.workosMembershipId}`;
    listMembershipsMock.mockResolvedValue({
      autoPagination: async () => [
        {
          id: remoteMembershipId,
          organizationId: identity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "admin" },
        },
      ],
    });
    getOrganizationMock.mockResolvedValue({
      id: identity.organization.workosOrganizationId,
      name: identity.organization.name,
    });

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    const result = await reconcileWorkosMembershipsForUser(db, {
      workosUserId: identity.user.workosUserId,
      email: identity.user.email,
      force: true,
    });

    expect(result).toMatchObject({ status: "reconciled", updated: 1 });

    const [membership] = await db
      .select({
        workosMembershipId: schema.organizationMemberships.workosMembershipId,
        role: schema.organizationMemberships.role,
      })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMemberships.organizationId, schema.organizations.id),
      )
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      )
      .limit(1);

    expect(membership?.workosMembershipId).toBe(remoteMembershipId);
    expect(membership?.role).toBe("admin");
  });

  it("returns lookup_failed when WorkOS membership listing errors", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    listMembershipsMock.mockRejectedValue(new Error("workos_unavailable"));

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    const result = await reconcileWorkosMembershipsForUser(db, {
      workosUserId: identity.user.workosUserId,
      email: identity.user.email,
      force: true,
    });

    expect(result.status).toBe("lookup_failed");
  });
});

describe("assertWorkosMembershipReconcileAllowsAccess", () => {
  it("fails closed when lookup fails without a fresh reconcile timestamp", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    const { assertWorkosMembershipReconcileAllowsAccess } =
      await import("./workos-membership-reconcile");

    await expect(
      assertWorkosMembershipReconcileAllowsAccess(db, identity.user.workosUserId, {
        status: "lookup_failed",
        lastReconciledAt: null,
      }),
    ).rejects.toThrow("workos_membership_lookup_failed");
  });

  it("allows access when lookup fails but reconcile is still fresh", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    await db
      .update(schema.users)
      .set({ workosMembershipsReconciledAt: new Date() })
      .where(eq(schema.users.workosUserId, identity.user.workosUserId));

    const { assertWorkosMembershipReconcileAllowsAccess } =
      await import("./workos-membership-reconcile");

    await expect(
      assertWorkosMembershipReconcileAllowsAccess(db, identity.user.workosUserId, {
        status: "lookup_failed",
        lastReconciledAt: new Date(),
      }),
    ).resolves.toBeUndefined();
  });
});
