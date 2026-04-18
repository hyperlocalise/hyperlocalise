import "dotenv/config";

process.env.WORKOS_COOKIE_PASSWORD ??= "test-workos-cookie-password-at-least-32-chars";
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??= "http://localhost:3000/auth/callback";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  withAuthMock,
  listOrganizationMembershipsMock,
  getOrganizationMock,
  syncWorkosUserMock,
  syncWorkosIdentityMock,
  redirectMock,
} = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  listOrganizationMembershipsMock: vi.fn(),
  getOrganizationMock: vi.fn(),
  syncWorkosUserMock: vi.fn(),
  syncWorkosIdentityMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
  getWorkOS: () => ({
    userManagement: {
      listOrganizationMemberships: listOrganizationMembershipsMock,
    },
    organizations: {
      getOrganization: getOrganizationMock,
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/api/auth/workos-sync", () => ({
  syncWorkosUser: syncWorkosUserMock,
  syncWorkosIdentity: syncWorkosIdentityMock,
}));

const baseUser = {
  id: "user_123",
  email: "user@example.com",
  firstName: "Pat",
  lastName: "Lee",
  profilePictureUrl: "https://example.com/avatar.png",
};

describe("workos auth helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    listOrganizationMembershipsMock.mockResolvedValue({
      data: [
        {
          id: "membership_123",
          organizationId: "org_123",
          role: { slug: "owner" },
          status: "active",
        },
      ],
    });
    getOrganizationMock.mockImplementation(async (organizationId: string) => {
      if (organizationId === "org_123") {
        return {
          id: "org_123",
          name: "Example Org",
          slug: "example-org",
        };
      }

      throw new Error(`unknown organization:${organizationId}`);
    });
    syncWorkosUserMock.mockResolvedValue({
      id: "local_user_123",
      workosUserId: "user_123",
      email: "user@example.com",
    });
    syncWorkosIdentityMock.mockResolvedValue({
      user: {
        id: "local_user_123",
        workosUserId: "user_123",
        email: "user@example.com",
      },
      organization: {
        id: "local_org_123",
        workosOrganizationId: "org_123",
        name: "Example Org",
        slug: "example-org",
      },
      membership: {
        workosMembershipId: "membership_123",
        role: "owner",
      },
    });
  });

  it("returns a ready state when the session has an active organization", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      organizationId: "org_123",
      accessToken: "token",
    });

    const { requireWorkosAppAuth } = await import("./auth");
    const result = await requireWorkosAppAuth();

    expect(result.auth.organization.localOrganizationId).toBe("local_org_123");
    expect(result.auth.organization.name).toBe("Example Org");
    expect(result.user.email).toBe("user@example.com");
  });

  it("redirects to access denied when no active memberships are available", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      accessToken: "token",
    });
    listOrganizationMembershipsMock.mockResolvedValue({
      data: [],
    });

    const { requireWorkosAppAuth } = await import("./auth");

    await expect(requireWorkosAppAuth()).rejects.toThrow("redirect:/auth/access-denied");
  });

  it("resolves API auth context from the current first-party WorkOS session", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      organizationId: "org_123",
      accessToken: "token",
    });

    const { resolveApiAuthContextFromSession } = await import("./auth");
    const result = await resolveApiAuthContextFromSession();

    expect(result).toEqual({
      user: {
        workosUserId: "user_123",
        localUserId: "local_user_123",
        email: "user@example.com",
      },
      organization: {
        workosOrganizationId: "org_123",
        localOrganizationId: "local_org_123",
        name: "Example Org",
        slug: "example-org",
      },
      membership: {
        workosMembershipId: "membership_123",
        role: "owner",
      },
    });
  });

  it("returns null when the session has no active organization", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      accessToken: "token",
    });

    const { resolveApiAuthContextFromSession } = await import("./auth");

    await expect(resolveApiAuthContextFromSession()).resolves.toBeNull();
  });
});
