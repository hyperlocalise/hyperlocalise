import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  redirectMock,
  withAuthMock,
  resolveApiAuthContextFromSessionMock,
  getStoredActiveOrganizationSlugMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  withAuthMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(),
  getStoredActiveOrganizationSlugMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

vi.mock("@/lib/workos/active-organization", () => ({
  getStoredActiveOrganizationSlug: getStoredActiveOrganizationSlugMock,
}));

describe("requireAppAuthContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the organization picker when the requested slug cannot be resolved", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    const { OrganizationSlugUnresolvableError } = await import("@/api/auth/workos-session");

    withAuthMock.mockResolvedValue(session);
    getStoredActiveOrganizationSlugMock.mockResolvedValue(null);
    resolveApiAuthContextFromSessionMock.mockRejectedValue(
      new OrganizationSlugUnresolvableError("stale-slug"),
    );

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext({ organizationSlug: "stale-slug" })).rejects.toThrow(
      "redirect:/auth/select-organization",
    );
    expect(redirectMock).toHaveBeenCalledWith("/auth/select-organization");
  });

  it("redirects to onboarding when org access is denied", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    withAuthMock.mockResolvedValue(session);
    getStoredActiveOrganizationSlugMock.mockResolvedValue(null);
    resolveApiAuthContextFromSessionMock.mockRejectedValue(new Error("organization_access_denied"));

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext({ organizationSlug: "stale-slug" })).rejects.toThrow(
      "redirect:/auth/onboarding",
    );
    expect(redirectMock).toHaveBeenCalledWith("/auth/onboarding");
  });

  it("redirects to onboarding when the signed-in user has no memberships yet", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    withAuthMock.mockResolvedValue(session);
    getStoredActiveOrganizationSlugMock.mockResolvedValue(null);
    resolveApiAuthContextFromSessionMock.mockResolvedValue(null);

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext()).rejects.toThrow("redirect:/auth/onboarding");
    expect(redirectMock).toHaveBeenCalledWith("/auth/onboarding");
  });

  it("can ignore the stored active organization when resolving memberships", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    const auth = {
      user: { localUserId: "user_123" },
      activeOrganization: { localOrganizationId: "org_1", slug: "current-org" },
      organizations: [{ localOrganizationId: "org_1", slug: "current-org" }],
    };
    withAuthMock.mockResolvedValue(session);
    resolveApiAuthContextFromSessionMock.mockResolvedValue(auth);

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(
      requireAppAuthContext({ ignoreStoredActiveOrganization: true }),
    ).resolves.toMatchObject(auth);
    expect(getStoredActiveOrganizationSlugMock).not.toHaveBeenCalled();
    expect(resolveApiAuthContextFromSessionMock).toHaveBeenCalledWith({
      organizationSlug: undefined,
      session,
    });
  });
});
