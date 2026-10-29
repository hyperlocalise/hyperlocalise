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
  requireAppAuthContext: vi.fn(),
  getStoredActiveOrganizationSlug: vi.fn(),
}));

vi.mock("@/lib/workos/app-auth", () => ({ requireAppAuthContext: mocks.requireAppAuthContext }));
vi.mock("@/lib/workos/active-organization", () => ({
  getStoredActiveOrganizationSlug: mocks.getStoredActiveOrganizationSlug,
}));
vi.mock("@/app/auth/onboarding/_components/onboarding-wizard", () => ({
  OnboardingWizard: () => null,
}));

import NewWorkspacePage from "./page";

function authWith(activeSlug: string | null, slugs: Array<string | null>) {
  return {
    activeOrganization: { slug: activeSlug },
    organizations: slugs.map((slug) => ({ slug })),
  };
}

async function cancelHref() {
  const element = (await NewWorkspacePage()) as ReactElement<{ cancelHref: string }>;
  return element.props.cancelHref;
}

describe("NewWorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Cancel to the workspace the person was last in", async () => {
    mocks.requireAppAuthContext.mockResolvedValue(authWith("alpha", ["alpha", "beta"]));
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("beta");

    expect(await cancelHref()).toBe("/org/beta/dashboard");
    expect(mocks.requireAppAuthContext).toHaveBeenCalledWith({
      ignoreStoredActiveOrganization: true,
    });
  });

  it("ignores a remembered workspace the person has left", async () => {
    mocks.requireAppAuthContext.mockResolvedValue(authWith("alpha", ["alpha"]));
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue("gone");

    expect(await cancelHref()).toBe("/org/alpha/dashboard");
  });

  it("still offers the form when no workspace has an address", async () => {
    mocks.requireAppAuthContext.mockResolvedValue(authWith(null, [null]));
    mocks.getStoredActiveOrganizationSlug.mockResolvedValue(null);

    expect(await cancelHref()).toBe("/auth/select-organization");
  });
});
