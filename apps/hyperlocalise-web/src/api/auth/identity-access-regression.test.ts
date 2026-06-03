import "dotenv/config";

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { testClient } from "hono/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { createApp } from "@/api/app";
import {
  promoteInvitedPlaceholderUser,
  revokeOrganizationMembershipAccess,
  syncWorkosIdentity,
} from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { setMembershipReplacingSentinelForTest } from "@/api/test-cleanup";
import { db, schema } from "@/lib/database";
import { INVITED_WORKOS_USER_ID_PREFIX } from "@/lib/workos/constants";

const { withAuthMock, listMembershipsMock, getOrganizationMock } = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  listMembershipsMock: vi.fn(),
  getOrganizationMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(actual.env, {
      get(target, property, receiver) {
        if (property === "WORKOS_API_KEY") {
          return "sk_test_identity_regression";
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

const { createWorkosIdentity, cleanup, trackWorkosUserId } = createAuthTestFixture();
const client = testClient(createApp());
const sessionHeaders = { headers: { cookie: "wos-session=identity-regression" } };

function mockWorkosSessionForIdentity(identity: ReturnType<typeof createWorkosIdentity>) {
  withAuthMock.mockResolvedValue({
    user: {
      id: identity.user.workosUserId,
      email: identity.user.email,
      firstName: null,
      lastName: null,
      profilePictureUrl: null,
    },
    organizationId: identity.organization.workosOrganizationId,
  });
}

function mockWorkosActiveMembership(identity: ReturnType<typeof createWorkosIdentity>) {
  listMembershipsMock.mockResolvedValue({
    autoPagination: async () => [
      {
        id: identity.membership.workosMembershipId,
        organizationId: identity.organization.workosOrganizationId,
        status: "active",
        role: { slug: identity.membership.role },
      },
    ],
  });
  getOrganizationMock.mockResolvedValue({
    id: identity.organization.workosOrganizationId,
    name: identity.organization.name,
  });
}

async function requestOrgProjects(organizationSlug: string) {
  return client.api.orgs[":organizationSlug"].projects.$get(
    { param: { organizationSlug } },
    sessionHeaders,
  );
}

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  withAuthMock.mockReset();
  listMembershipsMock.mockReset();
  getOrganizationMock.mockReset();
  await cleanup();
});

describe("enterprise identity access regression", () => {
  describe("session bootstrap access gate", () => {
    it("grants access for accepted WorkOS members with authoritative membership", async () => {
      const identity = createWorkosIdentity();
      await syncWorkosIdentity(db, identity);
      mockWorkosActiveMembership(identity);
      mockWorkosSessionForIdentity(identity);

      const { resolveApiAuthContextFromSession } = await import("./workos-session");
      const auth = await resolveApiAuthContextFromSession();

      expect(auth?.membership.accessSource).toBe("workos_authoritative");
      expect(auth?.activeOrganization.slug).toBe(identity.organization.slug);

      const response = await requestOrgProjects(identity.organization.slug!);
      expect(response.status).toBe(200);
    });

    it("denies access for pending invites without WorkOS membership confirmation", async () => {
      const ownerIdentity = createWorkosIdentity();
      await syncWorkosIdentity(db, ownerIdentity);

      const pendingEmail = `pending-${randomUUID()}@example.com`;
      const placeholderUserId = `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`;
      trackWorkosUserId(placeholderUserId);
      await syncWorkosIdentity(db, {
        user: {
          workosUserId: placeholderUserId,
          email: pendingEmail,
        },
        organization: ownerIdentity.organization,
        membership: {
          role: "member",
        },
      });

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      withAuthMock.mockResolvedValue({
        user: {
          id: placeholderUserId,
          email: pendingEmail,
          firstName: null,
          lastName: null,
          profilePictureUrl: null,
        },
        organizationId: null,
      });

      const { resolveApiAuthContextFromSession } = await import("./workos-session");

      await expect(
        resolveApiAuthContextFromSession({
          organizationSlug: ownerIdentity.organization.slug,
        }),
      ).resolves.toBeNull();

      await expect(resolveApiAuthContextFromSession()).resolves.toBeNull();
    });

    it("denies access for existing local users invited but not yet accepted in WorkOS", async () => {
      const ownerIdentity = createWorkosIdentity();
      const existingUserIdentity = createWorkosIdentity();
      const ownerSynced = await syncWorkosIdentity(db, ownerIdentity);
      const existingSynced = await syncWorkosIdentity(db, existingUserIdentity);

      await db.insert(schema.organizationMemberships).values({
        organizationId: ownerSynced.organization.id,
        userId: existingSynced.user.id,
        role: "member",
        workosMembershipId: null,
      });

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      withAuthMock.mockResolvedValue({
        user: {
          id: existingUserIdentity.user.workosUserId,
          email: existingUserIdentity.user.email,
          firstName: null,
          lastName: null,
          profilePictureUrl: null,
        },
        organizationId: null,
      });

      const { resolveApiAuthContextFromSession } = await import("./workos-session");

      await expect(
        resolveApiAuthContextFromSession({
          organizationSlug: ownerIdentity.organization.slug,
        }),
      ).resolves.toBeNull();
    });

    it("denies access while invite replacement sentinel is set", async () => {
      const identity = createWorkosIdentity();
      const synced = await syncWorkosIdentity(db, identity);

      await setMembershipReplacingSentinelForTest(db, {
        organizationId: synced.organization.id,
        userId: synced.user.id,
      });

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      mockWorkosSessionForIdentity(identity);

      const { resolveApiAuthContextFromSession } = await import("./workos-session");

      await expect(
        resolveApiAuthContextFromSession({
          organizationSlug: identity.organization.slug,
        }),
      ).resolves.toBeNull();
    });

    it("does not grant access from local membership alone when WorkOS no longer lists the member", async () => {
      const identity = createWorkosIdentity();
      await syncWorkosIdentity(db, identity);

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      mockWorkosSessionForIdentity(identity);

      const { resolveApiAuthContextFromSession } = await import("./workos-session");

      await expect(
        resolveApiAuthContextFromSession({
          organizationSlug: identity.organization.slug,
        }),
      ).resolves.toBeNull();

      const response = await requestOrgProjects(identity.organization.slug!);
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "organization_access_denied",
      });
    });
  });

  describe("membership reconciliation during login", () => {
    it("revokes removed WorkOS members during session bootstrap", async () => {
      const identity = createWorkosIdentity();
      await syncWorkosIdentity(db, identity);

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      mockWorkosSessionForIdentity(identity);

      const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
      const result = await reconcileWorkosMembershipsForUser(db, {
        workosUserId: identity.user.workosUserId,
        email: identity.user.email,
        force: true,
      });

      expect(result).toMatchObject({ status: "reconciled", revoked: 1 });

      const memberships = await db
        .select({ id: schema.organizationMemberships.id })
        .from(schema.organizationMemberships)
        .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
        .where(eq(schema.users.workosUserId, identity.user.workosUserId));

      expect(memberships).toEqual([]);

      const { resolveApiAuthContextFromSession } = await import("./workos-session");
      await expect(
        resolveApiAuthContextFromSession({
          organizationSlug: identity.organization.slug,
        }),
      ).resolves.toBeNull();
    });

    it("skips reconcile for placeholder invited users", async () => {
      const placeholderUserId = `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`;

      const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");
      const result = await reconcileWorkosMembershipsForUser(db, {
        workosUserId: placeholderUserId,
        email: "placeholder@example.com",
        force: true,
      });

      expect(result).toEqual({ status: "skipped" });
      expect(listMembershipsMock).not.toHaveBeenCalled();
    });

    it("respects reconcile TTL unless force is set", async () => {
      const identity = createWorkosIdentity();
      await syncWorkosIdentity(db, identity);

      await db
        .update(schema.users)
        .set({ workosMembershipsReconciledAt: new Date() })
        .where(eq(schema.users.workosUserId, identity.user.workosUserId));

      const { reconcileWorkosMembershipsForUser } = await import("./workos-membership-reconcile");

      const skipped = await reconcileWorkosMembershipsForUser(db, {
        workosUserId: identity.user.workosUserId,
        email: identity.user.email,
      });
      expect(skipped).toEqual({ status: "skipped" });
      expect(listMembershipsMock).not.toHaveBeenCalled();

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      const forced = await reconcileWorkosMembershipsForUser(db, {
        workosUserId: identity.user.workosUserId,
        email: identity.user.email,
        force: true,
      });
      expect(forced.status).toBe("reconciled");
      expect(listMembershipsMock).toHaveBeenCalled();
    });
  });

  describe("revocation and placeholder promotion", () => {
    it("revokes local access when WorkOS membership is deleted", async () => {
      const identity = createWorkosIdentity();
      const synced = await syncWorkosIdentity(db, identity);

      const result = await revokeOrganizationMembershipAccess(db, {
        workosMembershipId: identity.membership.workosMembershipId,
        workosOrganizationId: identity.organization.workosOrganizationId,
        workosUserId: identity.user.workosUserId,
      });

      expect(result.organizationMembershipsDeleted).toBe(1);

      const remaining = await db
        .select({ id: schema.organizationMemberships.id })
        .from(schema.organizationMemberships)
        .where(eq(schema.organizationMemberships.organizationId, synced.organization.id));

      expect(remaining).toEqual([]);
    });

    it("promotes placeholder users on WorkOS user.created", async () => {
      const ownerIdentity = createWorkosIdentity();
      await syncWorkosIdentity(db, ownerIdentity);

      const pendingEmail = `promote-${randomUUID()}@example.com`;
      const placeholderUserId = `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`;
      const realWorkosUserId = `user_${randomUUID()}`;

      trackWorkosUserId(placeholderUserId);

      await syncWorkosIdentity(db, {
        user: {
          workosUserId: placeholderUserId,
          email: pendingEmail,
        },
        organization: ownerIdentity.organization,
        membership: {
          role: "member",
        },
      });

      const promoted = await promoteInvitedPlaceholderUser(db, {
        email: pendingEmail,
        workosUserId: realWorkosUserId,
      });

      expect(promoted).toBe(true);
      trackWorkosUserId(realWorkosUserId);

      const [user] = await db
        .select({ workosUserId: schema.users.workosUserId })
        .from(schema.users)
        .where(eq(schema.users.email, pendingEmail))
        .limit(1);

      expect(user?.workosUserId).toBe(realWorkosUserId);
    });
  });

  describe("route authorization for membership states", () => {
    it("returns 403 for removed members on org-scoped routes after reconcile", async () => {
      const identity = createWorkosIdentity();
      await syncWorkosIdentity(db, identity);

      listMembershipsMock.mockResolvedValue({ autoPagination: async () => [] });
      mockWorkosSessionForIdentity(identity);

      const response = await requestOrgProjects(identity.organization.slug!);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "organization_access_denied",
      });
    });

    it("returns workos_membership_lookup_failed when reconcile cannot verify membership", async () => {
      const identity = createWorkosIdentity();
      await syncWorkosIdentity(db, identity);

      listMembershipsMock.mockRejectedValue(new Error("workos_unavailable"));
      mockWorkosSessionForIdentity(identity);

      const response = await requestOrgProjects(identity.organization.slug!);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: "workos_membership_lookup_failed",
      });
    });
  });
});
