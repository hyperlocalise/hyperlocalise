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

const { requireAppCapabilityMock } = vi.hoisted(() => ({
  requireAppCapabilityMock: vi.fn(),
}));

vi.mock("@/lib/workos/app-auth", () => ({
  requireAppCapability: requireAppCapabilityMock,
}));

vi.mock("../_components/personal-access-tokens-page-content", () => ({
  PersonalAccessTokensPageContent: () => null,
}));

import PersonalAccessTokensSettingsPage from "./page";

describe("PersonalAccessTokensSettingsPage", () => {
  beforeEach(() => {
    requireAppCapabilityMock.mockResolvedValue({
      user: { localUserId: "user_1" },
    });
  });

  it("gates the route on api_keys:write and renders the signed-in user's tokens", async () => {
    const element = await PersonalAccessTokensSettingsPage({
      params: Promise.resolve({ organizationSlug: "acme" }),
    });

    expect(requireAppCapabilityMock).toHaveBeenCalledWith("api_keys:write", {
      organizationSlug: "acme",
    });
    expect(element.props).toEqual({
      canManageTokens: true,
      currentUserId: "user_1",
      organizationSlug: "acme",
    });
  });
});
