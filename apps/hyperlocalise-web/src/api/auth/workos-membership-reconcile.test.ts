import "dotenv/config";

import { randomUUID } from "node:crypto";
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

        if (property === "WORKOS_ENABLED") {
          return true;
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
          role: { slug: "admin" },
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

  it("does not refresh global reconcile TTL for organization-scoped reconcile", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    const existingReconciledAt = new Date("2020-01-01T00:00:00.000Z");
    await db
      .update(schema.users)
      .set({ workosMembershipsReconciledAt: existingReconciledAt })
      .where(eq(schema.users.workosUserId, identity.user.workosUserId));

    listMembershipsMock.mockResolvedValue({
      autoPagination: async () => [
        {
          id: identity.membership.workosMembershipId,
          organizationId: identity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "admin" },
        },
      ],
    });

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    await reconcileWorkosMembershipsForUser(db, {
      workosUserId: identity.user.workosUserId,
      email: identity.user.email,
      workosOrganizationId: identity.organization.workosOrganizationId,
      force: true,
    });

    const [user] = await db
      .select({ workosMembershipsReconciledAt: schema.users.workosMembershipsReconciledAt })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, identity.user.workosUserId))
      .limit(1);

    expect(user?.workosMembershipsReconciledAt).toEqual(existingReconciledAt);
  });

  it("refreshes global reconcile TTL for scoped reconcile when refreshReconcileTtl is set", async () => {
    const identity = createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    const existingReconciledAt = new Date("2020-01-01T00:00:00.000Z");
    await db
      .update(schema.users)
      .set({ workosMembershipsReconciledAt: existingReconciledAt })
      .where(eq(schema.users.workosUserId, identity.user.workosUserId));

    listMembershipsMock.mockResolvedValue({
      autoPagination: async () => [
        {
          id: identity.membership.workosMembershipId,
          organizationId: identity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "admin" },
        },
      ],
    });

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    await reconcileWorkosMembershipsForUser(db, {
      workosUserId: identity.user.workosUserId,
      email: identity.user.email,
      workosOrganizationId: identity.organization.workosOrganizationId,
      refreshReconcileTtl: true,
      force: true,
    });

    const [user] = await db
      .select({ workosMembershipsReconciledAt: schema.users.workosMembershipsReconciledAt })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, identity.user.workosUserId))
      .limit(1);

    expect(user?.workosMembershipsReconciledAt).not.toEqual(existingReconciledAt);
    expect(user?.workosMembershipsReconciledAt?.getTime()).toBeGreaterThan(
      existingReconciledAt.getTime(),
    );
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

  it("skips memberships when WorkOS returns an unknown role slug", async () => {
    const ownerIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);

    const pendingEmail = `pending-role-${randomUUID()}@example.com`;
    const realWorkosUserId = `user_${randomUUID()}`;
    const workosMembershipId = `om_${randomUUID()}`;

    await syncWorkosIdentity(db, {
      user: {
        workosUserId: `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`,
        email: pendingEmail,
      },
      organization: ownerIdentity.organization,
      membership: {
        role: "admin",
      },
    });

    listMembershipsMock.mockResolvedValue({
      autoPagination: async () => [
        {
          id: workosMembershipId,
          organizationId: ownerIdentity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "unsupported-workos-role" },
        },
      ],
    });
    getOrganizationMock.mockResolvedValue({
      id: ownerIdentity.organization.workosOrganizationId,
      name: ownerIdentity.organization.name,
    });

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    const result = await reconcileWorkosMembershipsForUser(db, {
      workosUserId: realWorkosUserId,
      email: pendingEmail,
      force: true,
    });

    expect(result).toMatchObject({ status: "reconciled", added: 0, updated: 0 });

    const [membership] = await db
      .select({
        workosMembershipId: schema.organizationMemberships.workosMembershipId,
        role: schema.organizationMemberships.role,
        workosUserId: schema.users.workosUserId,
      })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .innerJoin(
        schema.organizations,
        eq(schema.organizationMemberships.organizationId, schema.organizations.id),
      )
      .where(eq(schema.users.email, pendingEmail))
      .limit(1);

    expect(membership?.workosUserId).toBe(realWorkosUserId);
    expect(membership?.workosMembershipId).toBeNull();
    expect(membership?.role).toBe("admin");
  });

  it("does not create memberships when WorkOS returns an unknown role slug and no local invite exists", async () => {
    const ownerIdentity = createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);

    const workosUserId = `user_${randomUUID()}`;
    const workosMembershipId = `om_${randomUUID()}`;
    const email = `workos-only-${randomUUID()}@example.com`;

    listMembershipsMock.mockResolvedValue({
      autoPagination: async () => [
        {
          id: workosMembershipId,
          organizationId: ownerIdentity.organization.workosOrganizationId,
          status: "active",
          role: { slug: "unsupported-workos-role" },
        },
      ],
    });
    getOrganizationMock.mockResolvedValue({
      id: ownerIdentity.organization.workosOrganizationId,
      name: ownerIdentity.organization.name,
    });

    const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
    const result = await reconcileWorkosMembershipsForUser(db, {
      workosUserId,
      email,
      force: true,
    });

    expect(result).toMatchObject({ status: "reconciled", added: 0 });

    const memberships = await db
      .select({ workosMembershipId: schema.organizationMemberships.workosMembershipId })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .where(eq(schema.users.workosUserId, workosUserId));

    expect(memberships).toHaveLength(0);
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
