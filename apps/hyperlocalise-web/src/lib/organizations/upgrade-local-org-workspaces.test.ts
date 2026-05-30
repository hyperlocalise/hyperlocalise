import { withAuth } from "@workos-inc/authkit-nextjs";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const {
  migrateLocalOrgWorkspacesForUserMock,
  reconcileWorkosMembershipsForUserMock,
  resolveApiAuthContextFromSessionMock,
} = vi.hoisted(() => ({
  migrateLocalOrgWorkspacesForUserMock: vi.fn(),
  reconcileWorkosMembershipsForUserMock: vi.fn(),
  resolveApiAuthContextFromSessionMock: vi.fn(),
}));

vi.mock("@/lib/organizations/migrate-local-org-to-workos", () => ({
  migrateLocalOrgWorkspacesForUser: migrateLocalOrgWorkspacesForUserMock,
}));

vi.mock("@/api/auth/workos-membership-reconcile", () => ({
  reconcileWorkosMembershipsForUser: reconcileWorkosMembershipsForUserMock,
}));

vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: resolveApiAuthContextFromSessionMock,
}));

import { executeLegacyWorkspaceUpgrade } from "./upgrade-local-org-workspaces";

const session = {
  user: {
    id: "user_123",
    email: "user@example.com",
    firstName: "Test",
    lastName: "User",
    profilePictureUrl: null,
  },
} as NonNullable<Awaited<ReturnType<typeof withAuth>>>;

describe("executeLegacyWorkspaceUpgrade", () => {
  beforeEach(() => {
    migrateLocalOrgWorkspacesForUserMock.mockReset();
    reconcileWorkosMembershipsForUserMock.mockReset();
    resolveApiAuthContextFromSessionMock.mockReset();
    reconcileWorkosMembershipsForUserMock.mockResolvedValue(undefined);
  });

  it("returns failed when migration fails entirely", async () => {
    migrateLocalOrgWorkspacesForUserMock.mockResolvedValue({
      migrated: 0,
      failed: 1,
      skipped: 0,
    });

    const result = await executeLegacyWorkspaceUpgrade({ session });

    expect(result).toMatchObject({
      status: "failed",
      error: "workspace_upgrade_failed",
    });
    expect(reconcileWorkosMembershipsForUserMock).not.toHaveBeenCalled();
  });

  it("redirects to dashboard when auth resolves after migration", async () => {
    migrateLocalOrgWorkspacesForUserMock.mockResolvedValue({
      migrated: 1,
      failed: 0,
      skipped: 0,
    });
    resolveApiAuthContextFromSessionMock.mockResolvedValue({
      activeOrganization: { slug: "example-org" },
    });

    const result = await executeLegacyWorkspaceUpgrade({ session });

    expect(result).toEqual({
      status: "complete",
      redirectTo: "/org/example-org/dashboard",
      migration: { migrated: 1, failed: 0, skipped: 0 },
    });
    expect(reconcileWorkosMembershipsForUserMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workosUserId: "user_123", force: true }),
    );
  });

  it("returns onboarding redirect when nothing was migrated and auth is still empty", async () => {
    migrateLocalOrgWorkspacesForUserMock.mockResolvedValue({
      migrated: 0,
      failed: 0,
      skipped: 1,
    });
    resolveApiAuthContextFromSessionMock.mockResolvedValue(null);

    const result = await executeLegacyWorkspaceUpgrade({ session });

    expect(result).toMatchObject({
      status: "onboarding",
      redirectTo: "/auth/onboarding",
    });
  });
});
