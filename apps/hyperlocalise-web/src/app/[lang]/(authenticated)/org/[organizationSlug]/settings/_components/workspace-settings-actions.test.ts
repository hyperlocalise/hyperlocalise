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
  requireAppAuthContext: vi.fn(),
  setStoredActiveOrganizationSlug: vi.fn(),
}));

vi.mock("@/lib/workos/app-auth", () => ({
  requireAppAuthContext: mocks.requireAppAuthContext,
}));
vi.mock("@/lib/workos/active-organization", () => ({
  setStoredActiveOrganizationSlug: mocks.setStoredActiveOrganizationSlug,
}));

import { storeActiveOrganizationSlugAction } from "./workspace-settings-actions";

describe("storeActiveOrganizationSlugAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores the slug the caller can access", async () => {
    mocks.requireAppAuthContext.mockResolvedValue({
      activeOrganization: { slug: "acme-localization" },
    });

    await storeActiveOrganizationSlugAction("acme-localization");

    expect(mocks.requireAppAuthContext).toHaveBeenCalledWith({
      organizationSlug: "acme-localization",
    });
    expect(mocks.setStoredActiveOrganizationSlug).toHaveBeenCalledWith("acme-localization");
  });

  it("does not write a cookie when the workspace has no slug", async () => {
    mocks.requireAppAuthContext.mockResolvedValue({
      activeOrganization: { slug: null },
    });

    await storeActiveOrganizationSlugAction("missing");

    expect(mocks.setStoredActiveOrganizationSlug).not.toHaveBeenCalled();
  });
});
