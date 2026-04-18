import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { db } from "@/lib/database";
import type { WorkosAuthIdentity } from "@/api/auth/workos";
import { createProjectTestFixture } from "@/api/routes/project/project.fixture";

const { withAuthMock } = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

describe("resolveApiAuthContextFromSession", () => {
  const fixture = createProjectTestFixture();

  beforeAll(async () => {
    await db.$client.query("select 1");
  });

  afterEach(async () => {
    vi.clearAllMocks();
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

  it("rejects an organization slug the user does not belong to", async () => {
    const identity = fixture.createWorkosIdentity();
    await syncWorkosIdentity(db, identity);
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
