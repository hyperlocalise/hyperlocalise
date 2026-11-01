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
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getAppAuthContextAllowingNoWorkspace: vi.fn(),
  getStoredActiveOrganizationSlug: vi.fn(),
  listPendingInvitations: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/workos/app-auth", () => ({
  getAppAuthContextAllowingNoWorkspace: mocks.getAppAuthContextAllowingNoWorkspace,
}));
vi.mock("@/lib/workos/pending-invitations", () => ({
  listPendingInvitations: mocks.listPendingInvitations,
}));
vi.mock("@/lib/workos/active-organization", () => ({
  getStoredActiveOrganizationSlug: mocks.getStoredActiveOrganizationSlug,
}));
vi.mock("@/app/auth/onboarding/_components/onboarding-wizard", () => ({
  OnboardingWizard: () => null,
}));

import NewWorkspacePage from "./page";

const sessionUser = { id: "user_1", emailVerified: true };

function authWith(activeSlug: string | null, slugs: Array<string | null>) {
  return {
    sessionUser,
    auth: {
      activeOrganization: { slug: activeSlug },
      organizations: slugs.map((slug) => ({ slug })),
    },
  };
}

async function wizardProps(from?: string) {
  const element = (await NewWorkspacePage({
    searchParams: Promise.resolve({ from }),
  })) as ReactElement<{ cancelHref: string; createsAnotherWorkspace: boolean }>;
  return element.props;
}

async function cancelHref(from?: string) {
  return (await wizardProps(from)).cancelHref;
}

describe("NewWorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Cancel to the workspace the person was last in", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue(
      authWith("alpha", ["alpha", "beta"]),
    );
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("beta");

    expect(await wizardProps()).toMatchObject({
      cancelHref: "/org/beta/dashboard",
      createsAnotherWorkspace: true,
    });
    expect(mocks.getAppAuthContextAllowingNoWorkspace).toHaveBeenCalledWith({
      ignoreStoredActiveOrganization: true,
    });
  });

  it("prefers the workspace the switcher was opened from", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue(
      authWith("alpha", ["alpha", "beta"]),
    );
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("alpha");

    expect(await cancelHref("beta")).toBe("/org/beta/dashboard");
    expect(await cancelHref("not-mine")).toBe("/org/alpha/dashboard");
  });

  it("ignores a remembered workspace the person has left", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue(authWith("alpha", ["alpha"]));
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("gone");

    expect(await cancelHref()).toBe("/org/alpha/dashboard");
  });

  it("still offers the form when no workspace has an address", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue(authWith(null, [null]));
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue(null);

    expect(await cancelHref()).toBe("/auth/select-organization");
  });

  it("offers the form to someone with no workspace and an invitation, returning to the picker", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue({ sessionUser, auth: null });
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("left-workspace");
    mocks.listPendingInvitations.mockResolvedValue([
      { organizationName: "Gamma", organizationSlug: "gamma" },
    ]);

    expect(await wizardProps()).toMatchObject({
      cancelHref: "/auth/select-organization",
      createsAnotherWorkspace: false,
    });
  });

  it("sends someone with no workspace and no invitation to onboarding", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue({ sessionUser, auth: null });
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue(null);
    mocks.listPendingInvitations.mockResolvedValue([]);

    await expect(cancelHref()).rejects.toThrow("redirect:/auth/onboarding");
  });
});
