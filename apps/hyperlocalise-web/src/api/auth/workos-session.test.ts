import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database";
import { eq } from "drizzle-orm";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";
import { setMembershipReplacingSentinelForTest } from "@/api/test-cleanup";

const { withAuthMock, reconcileWorkosMembershipsMock } = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  reconcileWorkosMembershipsMock: vi.fn().mockResolvedValue({ status: "skipped" }),
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

describe("resolveApiAuthContextFromSession", () => {
  const fixture = createProjectTestFixture();

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
    reconcileWorkosMembershipsMock.mockResolvedValue({ status: "skipped" });
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
    ).rejects.toThrow("organization_access_denied");
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
    ).rejects.toThrow("organization_access_denied");

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
    ).rejects.toThrow("organization_access_denied");

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
