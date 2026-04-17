import "dotenv/config";

process.env.WORKOS_COOKIE_PASSWORD ??= "test-workos-cookie-password-at-least-32-chars";
process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ??= "http://localhost:3000/auth/callback";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  withAuthMock,
  getSignInUrlMock,
  listOrganizationMembershipsMock,
  getOrganizationMock,
  syncWorkosUserMock,
  syncWorkosIdentityMock,
  headersMock,
  redirectMock,
} = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  getSignInUrlMock: vi.fn(),
  listOrganizationMembershipsMock: vi.fn(),
  getOrganizationMock: vi.fn(),
  syncWorkosUserMock: vi.fn(),
  syncWorkosIdentityMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
  getSignInUrl: getSignInUrlMock,
  getWorkOS: () => ({
    userManagement: {
      listOrganizationMemberships: listOrganizationMembershipsMock,
    },
    organizations: {
      getOrganization: getOrganizationMock,
    },
  }),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
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

    headersMock.mockResolvedValue(new Headers({ "x-url": "http://localhost:3000/dashboard" }));
    getSignInUrlMock.mockResolvedValue("https://auth.example.com/sign-in");
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

  it("marks signed-out sessions as unauthenticated", async () => {
    withAuthMock.mockResolvedValue({ user: null });

    const { getWorkosAppAuthState } = await import("./auth");
    await expect(getWorkosAppAuthState()).resolves.toEqual({
      kind: "unauthenticated",
    });
  });

  it("returns a ready state when the session has an active organization", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      organizationId: "org_123",
      accessToken: "token",
    });

    const { getWorkosAppAuthState } = await import("./auth");
    const result = await getWorkosAppAuthState();

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") {
      throw new Error("expected ready state");
    }

    expect(result.activeOrganization.name).toBe("Example Org");
    expect(result.auth.organization.localOrganizationId).toBe("local_org_123");
  });

  it("redirects multi-org users to the organization picker until an org is selected", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      accessToken: "token",
    });
    listOrganizationMembershipsMock.mockResolvedValue({
      data: [
        {
          id: "membership_123",
          organizationId: "org_123",
          role: { slug: "owner" },
          status: "active",
        },
        {
          id: "membership_456",
          organizationId: "org_456",
          role: { slug: "admin" },
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

      if (organizationId === "org_456") {
        return {
          id: "org_456",
          name: "Second Org",
          slug: "second-org",
        };
      }

      throw new Error(`unknown organization:${organizationId}`);
    });

    const { requireWorkosAppAuth } = await import("./auth");

    await expect(requireWorkosAppAuth("/dashboard")).rejects.toThrow(
      "redirect:/auth/organizations?returnTo=%2Fdashboard",
    );
  });

  it("redirects single-org users into an auto-activation flow when no org is active yet", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      accessToken: "token",
    });

    const { requireWorkosAppAuth } = await import("./auth");

    await expect(requireWorkosAppAuth("/dashboard")).rejects.toThrow(
      "redirect:/auth/organizations/activate?organizationId=org_123&returnTo=%2Fdashboard",
    );
  });

  it("returns access denied when no active memberships are available", async () => {
    withAuthMock.mockResolvedValue({
      user: baseUser,
      accessToken: "token",
    });
    listOrganizationMembershipsMock.mockResolvedValue({
      data: [],
    });

    const { getWorkosAppAuthState } = await import("./auth");
    const result = await getWorkosAppAuthState();

    expect(result.kind).toBe("access_denied");
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
});
