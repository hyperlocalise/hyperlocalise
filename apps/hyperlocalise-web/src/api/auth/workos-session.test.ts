import "dotenv/config";

import { randomUUID } from "node:crypto";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { syncWorkosIdentity, promoteInvitedPlaceholderUser } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { setMembershipReplacingSentinelForTest } from "@/api/test-cleanup";
import { INVITED_WORKOS_USER_ID_PREFIX } from "@/lib/workos/constants";

const { withAuthMock, reconcileWorkosMembershipsMock, promoteInvitedPlaceholderUserMock } =
  vi.hoisted(() => ({
    withAuthMock: vi.fn(),
    reconcileWorkosMembershipsMock: vi.fn().mockResolvedValue({ status: "skipped" }),
    promoteInvitedPlaceholderUserMock: vi.fn().mockResolvedValue(false),
  }));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

vi.mock("./workos-membership-reconcile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./workos-membership-reconcile")>();
  return {
    ...actual,
    reconcileWorkosMembershipsForUser: reconcileWorkosMembershipsMock,
  };
});

vi.mock("@/api/auth/workos-sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-sync")>();
  return {
    ...actual,
    promoteInvitedPlaceholderUser: promoteInvitedPlaceholderUserMock,
  };
});

describe("resolveApiAuthContextFromSession", () => {
  const fixture = createProjectTestFixture();

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    reconcileWorkosMembershipsMock.mockResolvedValue({ status: "skipped" });
    promoteInvitedPlaceholderUserMock.mockResolvedValue(false);
    await fixture.cleanup();
  });

  it("resolves a single active organization for a user", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);
    withAuthMock.mockResolvedValue({
      user: { id: identity.user.workosUserId },
      organizationId: identity.organization.workosOrganizationId,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    const auth = await resolveApiAuthContextFromSession();

    expect(auth?.user.workosUserId).toBe(identity.user.workosUserId);
    expect(auth?.organizations).toHaveLength(1);
    expect(auth?.activeOrganization.slug).toBe(identity.organization.slug);
    expect(auth?.activeOrganization.membership.role).toBe(identity.membership.role);
    expect(auth?.membership.accessSource).toBe("workos_authoritative");
    expect(auth?.activeTeam).toBeNull();
  });

  it("selects the requested organization slug for a multi-org user", async () => {
    const primaryIdentity = fixture.createWorkosIdentity();
    const secondaryIdentity = {
      ...fixture.createWorkosIdentity(),
      user: primaryIdentity.user,
      membership: {
        workosMembershipId: `${primaryIdentity.membership.workosMembershipId}-secondary`,
        role: "admin",
      },
    } satisfies WorkosAuthIdentity;

    await syncWorkosIdentity(db, primaryIdentity);
    await syncWorkosIdentity(db, secondaryIdentity);

    withAuthMock.mockResolvedValue({
      user: { id: primaryIdentity.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    const auth = await resolveApiAuthContextFromSession({
      organizationSlug: secondaryIdentity.organization.slug,
    });

    expect(auth?.organizations).toHaveLength(2);
    expect(auth?.activeOrganization.workosOrganizationId).toBe(
      secondaryIdentity.organization.workosOrganizationId,
    );
    expect(auth?.membership.role).toBe("admin");
  });

  it("redirects multi-org users away from archived workspace slugs", async () => {
    const primaryIdentity = fixture.createWorkosIdentity();
    const secondaryIdentity = {
      ...fixture.createWorkosIdentity(),
      user: primaryIdentity.user,
      membership: {
        workosMembershipId: `${primaryIdentity.membership.workosMembershipId}-secondary`,
        role: "admin",
      },
    } satisfies WorkosAuthIdentity;

    await syncWorkosIdentity(db, primaryIdentity);
    await syncWorkosIdentity(db, secondaryIdentity);

    await db
      .update(schema.organizations)
      .set({ lifecycleStatus: "archived", archivedAt: new Date() })
      .where(
        eq(
          schema.organizations.workosOrganizationId,
          primaryIdentity.organization.workosOrganizationId,
        ),
      );

    withAuthMock.mockResolvedValue({
      user: { id: primaryIdentity.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession, StaleOrganizationSlugError } =
      await import("./workos-session");

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: primaryIdentity.organization.slug,
      }),
    ).rejects.toBeInstanceOf(StaleOrganizationSlugError);

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: primaryIdentity.organization.slug,
      }),
    ).rejects.toMatchObject({
      requestedSlug: primaryIdentity.organization.slug,
      currentSlug: secondaryIdentity.organization.slug,
    });
  });

  it("rejects archived-only workspace slugs with a dedicated error", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    await db
      .update(schema.organizations)
      .set({ lifecycleStatus: "archived", archivedAt: new Date() })
      .where(
        eq(schema.organizations.workosOrganizationId, identity.organization.workosOrganizationId),
      );

    withAuthMock.mockResolvedValue({
      user: { id: identity.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: identity.organization.slug,
      }),
    ).rejects.toThrow("archived_organization_access");
  });

  it("sends multi-org users with unknown slugs to the organization picker", async () => {
    const primaryIdentity = fixture.createWorkosIdentity();
    const secondaryIdentity = {
      ...fixture.createWorkosIdentity(),
      user: primaryIdentity.user,
      membership: {
        workosMembershipId: `${primaryIdentity.membership.workosMembershipId}-secondary`,
        role: "admin",
      },
    } satisfies WorkosAuthIdentity;

    await syncWorkosIdentity(db, primaryIdentity);
    await syncWorkosIdentity(db, secondaryIdentity);

    withAuthMock.mockResolvedValue({
      user: { id: primaryIdentity.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession, OrganizationSlugUnresolvableError } =
      await import("./workos-session");

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: "not-a-real-membership",
      }),
    ).rejects.toBeInstanceOf(OrganizationSlugUnresolvableError);
  });

  it("rejects an organization slug when the user has no memberships", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.workosUserId, identity.user.workosUserId))
      .limit(1);

    await db
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.userId, user.id));

    withAuthMock.mockResolvedValue({
      user: { id: identity.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: "not-a-real-membership",
      }),
    ).resolves.toBeNull();
  });

  it("does not grant access while invite replacement sentinel is set on membership", async () => {
    const identity = fixture.createWorkosIdentity();
    const synced = await syncWorkosIdentity(db, identity);

    await setMembershipReplacingSentinelForTest(db, {
      organizationId: synced.organization.id,
      userId: synced.user.id,
    });

    withAuthMock.mockResolvedValue({
      user: { id: synced.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: identity.organization.slug,
      }),
    ).resolves.toBeNull();

    await expect(resolveApiAuthContextFromSession()).resolves.toBeNull();
  });

  it("does not grant access for pending invitations without WorkOS membership confirmation", async () => {
    const pendingOnlyIdentity = fixture.createWorkosIdentity();
    const synced = await syncWorkosIdentity(db, pendingOnlyIdentity);

    await db
      .update(schema.organizationMemberships)
      .set({ workosMembershipId: null })
      .where(eq(schema.organizationMemberships.organizationId, synced.organization.id));

    withAuthMock.mockResolvedValue({
      user: { id: synced.user.workosUserId },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(
      resolveApiAuthContextFromSession({
        organizationSlug: pendingOnlyIdentity.organization.slug,
      }),
    ).resolves.toBeNull();

    await expect(resolveApiAuthContextFromSession()).resolves.toBeNull();
  });

  it("rejects session bootstrap when WorkOS membership lookup fails without fresh reconcile", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

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

    reconcileWorkosMembershipsMock.mockResolvedValueOnce({
      status: "lookup_failed",
      lastReconciledAt: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");

    await expect(resolveApiAuthContextFromSession()).rejects.toThrow(
      "workos_membership_lookup_failed",
    );
  });

  it("forces membership reconcile when the WorkOS session includes an organization", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    withAuthMock.mockResolvedValue({
      user: {
        id: identity.user.workosUserId,
        email: identity.user.email,
        firstName: identity.user.firstName ?? null,
        lastName: identity.user.lastName ?? null,
        profilePictureUrl: identity.user.avatarUrl ?? null,
      },
      organizationId: identity.organization.workosOrganizationId,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    await resolveApiAuthContextFromSession();

    expect(promoteInvitedPlaceholderUserMock).toHaveBeenCalledWith(db, {
      email: identity.user.email,
      workosUserId: identity.user.workosUserId,
    });
    expect(reconcileWorkosMembershipsMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workosUserId: identity.user.workosUserId,
        workosOrganizationId: identity.organization.workosOrganizationId,
        force: true,
      }),
    );
  });

  it("forces membership reconcile when an invited placeholder user is promoted", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    promoteInvitedPlaceholderUserMock.mockResolvedValueOnce(true);
    withAuthMock.mockResolvedValue({
      user: {
        id: identity.user.workosUserId,
        email: identity.user.email,
      },
      organizationId: null,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    await resolveApiAuthContextFromSession();

    expect(reconcileWorkosMembershipsMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workosUserId: identity.user.workosUserId,
        force: true,
      }),
    );
  });

  it("reconciles all WorkOS memberships when the user still has a pending local invite", async () => {
    const ownerIdentity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, ownerIdentity);

    const pendingEmail = `pending-session-${randomUUID()}@example.com`;
    const realWorkosUserId = `user_${randomUUID()}`;

    await syncWorkosIdentity(db, {
      user: {
        workosUserId: `${INVITED_WORKOS_USER_ID_PREFIX}${randomUUID()}`,
        email: pendingEmail,
      },
      organization: ownerIdentity.organization,
      membership: {
        role: "member",
      },
    });

    await promoteInvitedPlaceholderUser(db, {
      email: pendingEmail,
      workosUserId: realWorkosUserId,
    });

    withAuthMock.mockResolvedValue({
      user: {
        id: realWorkosUserId,
        email: pendingEmail,
        firstName: null,
        lastName: null,
        profilePictureUrl: null,
      },
      organizationId: "org_unrelated_session_pointer",
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    await resolveApiAuthContextFromSession();

    expect(reconcileWorkosMembershipsMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        workosUserId: realWorkosUserId,
        force: true,
        workosOrganizationId: undefined,
      }),
    );
  });

  it("skips placeholder promotion when the session user has no email", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    withAuthMock.mockResolvedValue({
      user: { id: identity.user.workosUserId },
      organizationId: identity.organization.workosOrganizationId,
    });

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    await resolveApiAuthContextFromSession();

    expect(promoteInvitedPlaceholderUserMock).not.toHaveBeenCalled();
    expect(reconcileWorkosMembershipsMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        force: true,
      }),
    );
  });

  it("uses the injected session without performing another withAuth lookup", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);

    const { resolveApiAuthContextFromSession } = await import("./workos-session");
    const auth = await resolveApiAuthContextFromSession({
      session: {
        user: {
          id: identity.user.workosUserId,
          email: identity.user.email,
          firstName: identity.user.firstName ?? null,
          lastName: identity.user.lastName ?? null,
          profilePictureUrl: identity.user.avatarUrl ?? null,
        },
        organizationId: identity.organization.workosOrganizationId,
      } as Awaited<ReturnType<typeof withAuthMock>>,
    });

    expect(auth?.user.workosUserId).toBe(identity.user.workosUserId);
    expect(withAuthMock).not.toHaveBeenCalled();
  });
});
