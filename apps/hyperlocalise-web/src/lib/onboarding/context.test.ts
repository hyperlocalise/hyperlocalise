import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  withAuthMock,
  getStoredOnboardingStateMock,
  clearStoredOnboardingStateMock,
  setStoredOnboardingStateMock,
  setStoredActiveOrganizationSlugMock,
  resolveApiAuthContextFromSessionMock,
} = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  getStoredOnboardingStateMock: vi.fn(),
  clearStoredOnboardingStateMock: vi.fn(),
  setStoredOnboardingStateMock: vi.fn(),
  setStoredActiveOrganizationSlugMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

vi.mock("@/lib/workos/onboarding-state", () => ({
  getStoredOnboardingState: getStoredOnboardingStateMock,
  clearStoredOnboardingState: clearStoredOnboardingStateMock,
  setStoredOnboardingState: setStoredOnboardingStateMock,
}));

vi.mock("@/lib/workos/active-organization", () => ({
  setStoredActiveOrganizationSlug: setStoredActiveOrganizationSlugMock,
}));

vi.mock("@/api/auth/workos-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/auth/workos-session")>();
  return {
    ...actual,
    resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
  };
});

describe("loadOnboardingContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("clears stale onboarding state when the stored org is no longer accessible", async () => {
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: null,
    };
    withAuthMock.mockResolvedValue(session);
    getStoredOnboardingStateMock.mockResolvedValue({
      organizationSlug: "stale-org",
      providerSetupStatus: "pending",
    });
    resolveApiAuthContextFromSessionMock.mockRejectedValue(new Error("organization_access_denied"));

    const { loadOnboardingContext } = await import("./context");

    await expect(loadOnboardingContext()).resolves.toEqual({
      session,
      onboardingState: null,
      auth: null,
    });
    expect(resolveApiAuthContextFromSessionMock).toHaveBeenCalledWith({
      session,
      organizationSlug: "stale-org",
    });
    expect(clearStoredOnboardingStateMock).toHaveBeenCalledOnce();
  });

  it("repairs stored onboarding slug and retries auth when the workspace slug changed", async () => {
    const { StaleOrganizationSlugError } = await import("@/api/auth/workos-session");
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: "org_123",
    };
    const staleOnboardingState = {
      organizationSlug: "old-workspace",
      providerSetupStatus: "pending" as const,
    };
    const auth = {
      activeOrganization: { slug: "new-workspace", name: "Renamed Workspace" },
    };

    withAuthMock.mockResolvedValue(session);
    getStoredOnboardingStateMock.mockResolvedValue(staleOnboardingState);
    resolveApiAuthContextFromSessionMock
      .mockRejectedValueOnce(new StaleOrganizationSlugError("old-workspace", "new-workspace"))
      .mockResolvedValueOnce(auth);

    const { loadOnboardingContext } = await import("./context");

    await expect(loadOnboardingContext()).resolves.toEqual({
      session,
      onboardingState: {
        organizationSlug: "new-workspace",
        providerSetupStatus: "pending",
      },
      auth,
    });
    expect(setStoredOnboardingStateMock).toHaveBeenCalledWith({
      organizationSlug: "new-workspace",
      providerSetupStatus: "pending",
    });
    expect(setStoredActiveOrganizationSlugMock).toHaveBeenCalledWith(auth.activeOrganization.slug);
    expect(resolveApiAuthContextFromSessionMock).toHaveBeenNthCalledWith(2, {
      session,
      organizationSlug: "new-workspace",
    });
    expect(clearStoredOnboardingStateMock).not.toHaveBeenCalled();
  });

  it("clears onboarding state when slug repair still cannot resolve auth", async () => {
    const { StaleOrganizationSlugError } = await import("@/api/auth/workos-session");
    const session = {
      user: { id: "user_123", email: "person@example.com" },
      organizationId: "org_123",
    };

    withAuthMock.mockResolvedValue(session);
    getStoredOnboardingStateMock.mockResolvedValue({
      organizationSlug: "old-workspace",
      providerSetupStatus: "configured" as const,
    });
    resolveApiAuthContextFromSessionMock
      .mockRejectedValueOnce(new StaleOrganizationSlugError("old-workspace", "new-workspace"))
      .mockRejectedValueOnce(new Error("organization_access_denied"));

    const { loadOnboardingContext } = await import("./context");

    await expect(loadOnboardingContext()).resolves.toEqual({
      session,
      onboardingState: null,
      auth: null,
    });
    expect(clearStoredOnboardingStateMock).toHaveBeenCalledOnce();
  });
});
