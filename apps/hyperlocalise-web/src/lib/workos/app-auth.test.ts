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

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

vi.mock("@/lib/workos/active-organization", () => ({
  getStoredActiveOrganizationSlug: getStoredActiveOrganizationSlugMock,
}));

describe("requireAppAuthContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to the org access-denied page when the requested org is not accessible", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    withAuthMock.mockResolvedValue(session);
    getStoredActiveOrganizationSlugMock.mockResolvedValue(null);
    resolveApiAuthContextFromSessionMock.mockRejectedValue(new Error("organization_access_denied"));

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext({ organizationSlug: "stale-slug" })).rejects.toThrow(
      "redirect:/auth/access-denied?reason=organization-access-denied",
    );
    expect(redirectMock).toHaveBeenCalledWith(
      "/auth/access-denied?reason=organization-access-denied",
    );
    expect(resolveApiAuthContextFromSessionMock).toHaveBeenCalledWith({
      organizationSlug: "stale-slug",
      session,
    });
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
});
