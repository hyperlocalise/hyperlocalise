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
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  refreshSession: vi.fn(),
  resolveApiAuthContextFromSession: vi.fn(),
  leftOrganizationRows: vi.fn(),
  getStoredActiveOrganizationSlug: vi.fn(),
  setStoredActiveOrganizationSlug: vi.fn(),
  clearStoredActiveOrganizationSlug: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({ refreshSession: mocks.refreshSession }));
vi.mock("@/lib/workos/server-auth", () => ({ withAuth: mocks.withAuth }));
vi.mock("@/api/auth/workos-session", () => ({
  resolveApiAuthContextFromSession: mocks.resolveApiAuthContextFromSession,
}));
vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => mocks.leftOrganizationRows() }) }),
    }),
  },
  schema: { organizations: { workosOrganizationId: "workos_organization_id", slug: "slug" } },
}));
vi.mock("@/lib/workos/active-organization", () => ({
  getStoredActiveOrganizationSlug: mocks.getStoredActiveOrganizationSlug,
  setStoredActiveOrganizationSlug: mocks.setStoredActiveOrganizationSlug,
  clearStoredActiveOrganizationSlug: mocks.clearStoredActiveOrganizationSlug,
}));

import { finishLeavingWorkspaceAction } from "./actions";

function workspace(slug: string, workosMembershipId: string | null = `om_${slug}`) {
  return {
    workosOrganizationId: `org_${slug}`,
    localOrganizationId: `local-${slug}`,
    name: slug,
    slug,
    membership: { workosMembershipId, role: "member", accessSource: "workos" },
  };
}

function sessionFor(organizationId?: string) {
  return { user: { id: "user_1", email: "person@example.com" }, organizationId };
}

describe("finishLeavingWorkspaceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leftOrganizationRows.mockResolvedValue([{ workosOrganizationId: "org_acme" }]);
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue(null);
  });

  it("moves a session issued for the left workspace to the next one", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_acme"));
    mocks.resolveApiAuthContextFromSession.mockResolvedValue({
      organizations: [workspace("beta")],
    });

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({
      redirectTo: "/org/beta/dashboard",
    });
    expect(mocks.refreshSession).toHaveBeenCalledWith({ organizationId: "org_beta" });
    expect(mocks.setStoredActiveOrganizationSlug).toHaveBeenCalledWith("beta");
  });

  it("leaves a session issued for another workspace alone", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_beta"));
    mocks.resolveApiAuthContextFromSession.mockResolvedValue({
      organizations: [workspace("beta")],
    });

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({
      redirectTo: "/org/beta/dashboard",
    });
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it("prefers the remembered workspace and skips ones not joined yet", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_acme"));
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("gamma");
    mocks.resolveApiAuthContextFromSession.mockResolvedValue({
      organizations: [
        workspace("acme"),
        workspace("pending", null),
        workspace("beta"),
        workspace("gamma"),
      ],
    });

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({
      redirectTo: "/org/gamma/dashboard",
    });
    expect(mocks.refreshSession).toHaveBeenCalledWith({ organizationId: "org_gamma" });
  });

  it("still opens the next workspace when the session cannot be moved", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_acme"));
    mocks.resolveApiAuthContextFromSession.mockResolvedValue({
      organizations: [workspace("beta")],
    });
    mocks.refreshSession.mockRejectedValue(new Error("refresh refused"));

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({
      redirectTo: "/org/beta/dashboard",
    });
  });

  it("signs out when the session was for the only workspace left", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_acme"));
    mocks.resolveApiAuthContextFromSession.mockResolvedValue(null);

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({
      redirectTo: "/auth/sign-out?returnTo=%2Fdashboard",
    });
    expect(mocks.clearStoredActiveOrganizationSlug).toHaveBeenCalled();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it("sends a session without a workspace to the dashboard when none is left", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor(undefined));
    mocks.resolveApiAuthContextFromSession.mockResolvedValue({ organizations: [] });

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({ redirectTo: "/dashboard" });
    expect(mocks.clearStoredActiveOrganizationSlug).toHaveBeenCalled();
  });

  it("goes to the dashboard when the remaining workspaces cannot be read", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_beta"));
    mocks.resolveApiAuthContextFromSession.mockRejectedValue(new Error("lookup failed"));

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({ redirectTo: "/dashboard" });
    expect(mocks.clearStoredActiveOrganizationSlug).not.toHaveBeenCalled();
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it("ends a session for the left workspace when the others cannot be read", async () => {
    mocks.withAuth.mockResolvedValue(sessionFor("org_acme"));
    mocks.resolveApiAuthContextFromSession.mockRejectedValue(new Error("lookup failed"));

    expect(await finishLeavingWorkspaceAction("acme")).toEqual({
      redirectTo: "/auth/sign-out?returnTo=%2Fdashboard",
    });
  });

  it("sends someone who is not signed in to sign in", async () => {
    mocks.withAuth.mockResolvedValue({ user: null });

    await expect(finishLeavingWorkspaceAction("acme")).rejects.toThrow("redirect:/auth/sign-in");
  });
});
