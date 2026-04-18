import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const {
  withAuthMock,
  getStoredOnboardingStateMock,
  clearStoredOnboardingStateMock,
  resolveApiAuthContextFromSessionMock,
} = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  getStoredOnboardingStateMock: vi.fn(),
  clearStoredOnboardingStateMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  withAuth: withAuthMock,
}));

vi.mock("@/lib/workos/onboarding-state", () => ({
  getStoredOnboardingState: getStoredOnboardingStateMock,
  clearStoredOnboardingState: clearStoredOnboardingStateMock,
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

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
});
