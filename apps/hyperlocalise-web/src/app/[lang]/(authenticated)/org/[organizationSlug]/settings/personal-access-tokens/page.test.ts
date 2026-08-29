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

const { requireAppAuthContextMock } = vi.hoisted(() => ({
  requireAppAuthContextMock: vi.fn(),
}));

vi.mock("@/lib/workos/app-auth", () => ({
  requireAppAuthContext: requireAppAuthContextMock,
}));

vi.mock("../_components/personal-access-tokens-page-content", () => ({
  PersonalAccessTokensPageContent: () => null,
}));

import PersonalAccessTokensSettingsPage from "./page";

describe("PersonalAccessTokensSettingsPage", () => {
  beforeEach(() => {
    requireAppAuthContextMock.mockResolvedValue({
      user: { localUserId: "user_1" },
    });
  });

  it("requires organization membership and renders the signed-in user's tokens", async () => {
    const element = await PersonalAccessTokensSettingsPage({
      params: Promise.resolve({ organizationSlug: "acme" }),
    });

    expect(requireAppAuthContextMock).toHaveBeenCalledWith({
      organizationSlug: "acme",
    });
    expect(element.props).toEqual({
      canManageTokens: true,
      currentUserId: "user_1",
      organizationSlug: "acme",
    });
  });
});
