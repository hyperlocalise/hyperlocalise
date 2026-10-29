/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  redirectMock,
  withAuthMock,
  resolveApiAuthContextFromSessionMock,
  getStoredActiveOrganizationSlugMock,
  setStoredActiveOrganizationSlugMock,
  redirectForMissingOrganizationAccessMock,
  hasPendingInvitationToOrganizationMock,
} = vi.hoisted(() => ({
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  withAuthMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(),
  getStoredActiveOrganizationSlugMock: vi.fn(),
  setStoredActiveOrganizationSlugMock: vi.fn(),
  redirectForMissingOrganizationAccessMock: vi.fn(async () => {
    throw new Error("redirect:/auth/onboarding");
  }),
  hasPendingInvitationToOrganizationMock: vi.fn(async () => false),
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
  setStoredActiveOrganizationSlug: setStoredActiveOrganizationSlugMock,
}));

vi.mock("@/lib/workos/missing-organization-access", () => ({
  redirectForMissingOrganizationAccess: redirectForMissingOrganizationAccessMock,
}));

vi.mock("@/lib/workos/pending-invitations", () => ({
  hasPendingInvitationToOrganization: hasPendingInvitationToOrganizationMock,
}));

describe("getAppAuthContextAllowingNoWorkspace", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["has no memberships", () => resolveApiAuthContextFromSessionMock.mockResolvedValue(null)],
    [
      "is refused access",
      () =>
        resolveApiAuthContextFromSessionMock.mockRejectedValue(
          new Error("organization_access_denied"),
        ),
    ],
  ])("returns no workspace instead of redirecting when the person %s", async (_case, arrange) => {
    const user = { id: "user_123", email: "person@example.com", emailVerified: true };
    withAuthMock.mockResolvedValue({ user, organizationId: null });
    arrange();

    const { getAppAuthContextAllowingNoWorkspace } = await import("./app-auth");

    expect(
      await getAppAuthContextAllowingNoWorkspace({ ignoreStoredActiveOrganization: true }),
    ).toEqual({ sessionUser: user, auth: null });
    expect(redirectForMissingOrganizationAccessMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

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

  it("routes missing organization access through the shared redirect helper", async () => {
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
    expect(redirectForMissingOrganizationAccessMock).toHaveBeenCalledWith({
      email: "person@example.com",
      workosUserId: "user_123",
    });
  });

  it("routes users without memberships through the shared redirect helper", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    withAuthMock.mockResolvedValue(session);
    getStoredActiveOrganizationSlugMock.mockResolvedValue(null);
    resolveApiAuthContextFromSessionMock.mockResolvedValue(null);

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext()).rejects.toThrow("redirect:/auth/onboarding");
    expect(redirectForMissingOrganizationAccessMock).toHaveBeenCalledWith({
      email: "person@example.com",
      workosUserId: "user_123",
    });
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

  it("preserves dashboard query params when redirecting a stale organization slug", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    const { StaleOrganizationSlugError } = await import("@/api/auth/workos-session");

    withAuthMock.mockResolvedValue(session);
    getStoredActiveOrganizationSlugMock.mockResolvedValue("old-slug");
    resolveApiAuthContextFromSessionMock.mockRejectedValue(
      new StaleOrganizationSlugError("old-slug", "new-slug"),
    );

    const { getDefaultOrganizationDashboardPath } = await import("./app-auth");

    await expect(
      getDefaultOrganizationDashboardPath({
        staleOrganizationRedirectSearch: "?error=oauth_callback",
      }),
    ).rejects.toThrow("redirect:/org/new-slug/dashboard?error=oauth_callback");
    expect(setStoredActiveOrganizationSlugMock).toHaveBeenCalledWith("new-slug");
    expect(redirectMock).toHaveBeenCalledWith("/org/new-slug/dashboard?error=oauth_callback");
  });

  it("offers the invitation instead of another workspace for an invited, unjoined workspace", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com", emailVerified: true },
      organizationId: "org_home",
    };
    const { StaleOrganizationSlugError } = await import("@/api/auth/workos-session");

    withAuthMock.mockResolvedValue(session);
    hasPendingInvitationToOrganizationMock.mockResolvedValueOnce(true);
    resolveApiAuthContextFromSessionMock.mockRejectedValue(
      new StaleOrganizationSlugError("invited-workspace", "home-workspace"),
    );

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext({ organizationSlug: "invited-workspace" })).rejects.toThrow(
      "redirect:/auth/select-organization",
    );
    expect(hasPendingInvitationToOrganizationMock).toHaveBeenCalledWith(
      "user_123",
      "invited-workspace",
    );
    expect(setStoredActiveOrganizationSlugMock).not.toHaveBeenCalled();
  });

  it("does not reveal invitations to a session whose email is not verified", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com", emailVerified: false },
      organizationId: "org_home",
    };
    const { StaleOrganizationSlugError } = await import("@/api/auth/workos-session");

    withAuthMock.mockResolvedValue(session);
    hasPendingInvitationToOrganizationMock.mockResolvedValue(true);
    resolveApiAuthContextFromSessionMock.mockRejectedValue(
      new StaleOrganizationSlugError("invited-workspace", "home-workspace"),
    );

    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext({ organizationSlug: "invited-workspace" })).rejects.toThrow(
      "redirect:/org/home-workspace/dashboard",
    );
    expect(hasPendingInvitationToOrganizationMock).not.toHaveBeenCalled();
  });
});
