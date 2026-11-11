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
  loadOnboardingContext: vi.fn(),
  createWorkspaceForSessionUser: vi.fn(),
  setStoredActiveOrganizationSlug: vi.fn(),
  clearStoredOnboardingState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/onboarding/context", () => ({
  loadOnboardingContext: mocks.loadOnboardingContext,
}));
vi.mock("@/lib/onboarding/workspace", () => ({
  createWorkspaceForSessionUser: mocks.createWorkspaceForSessionUser,
}));
vi.mock("@/lib/workos/active-organization", () => ({
  setStoredActiveOrganizationSlug: mocks.setStoredActiveOrganizationSlug,
}));
vi.mock("@/lib/workos/onboarding-state", () => ({
  clearStoredOnboardingState: mocks.clearStoredOnboardingState,
  setStoredOnboardingState: vi.fn(),
}));
vi.mock("@/lib/linked-domains/claim-intent", () => ({
  getClaimDomainIntent: async () => null,
  clearClaimDomainIntent: vi.fn(),
  claimDomainPathForOrg: vi.fn(),
}));
vi.mock("@/lib/app-i18n/server-locale", () => ({ getAppLocale: async () => "en" }));

import { createWorkspaceAction } from "./actions";

function workspaceForm(intent?: string) {
  const formData = new FormData();
  formData.set("organizationName", "Second Workspace");
  if (intent) {
    formData.set("intent", intent);
  }
  return formData;
}

describe("createWorkspaceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOnboardingContext.mockResolvedValue({
      session: { user: { id: "user_1", email: "person@example.com" } },
      onboardingState: null,
      auth: { activeOrganization: { slug: "first-workspace" } },
    });
    mocks.createWorkspaceForSessionUser.mockResolvedValue({
      organization: { id: "org_2", name: "Second Workspace", slug: "second-workspace" },
    });
  });

  it("sends someone who already has a workspace back to it from onboarding", async () => {
    await expect(createWorkspaceAction({}, workspaceForm())).rejects.toThrow(
      "redirect:/org/first-workspace/dashboard",
    );
    expect(mocks.createWorkspaceForSessionUser).not.toHaveBeenCalled();
  });

  it("creates another workspace and opens it", async () => {
    await expect(createWorkspaceAction({}, workspaceForm("another"))).rejects.toThrow(
      "redirect:/org/second-workspace/dashboard",
    );
    expect(mocks.createWorkspaceForSessionUser).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationName: "Second Workspace",
        source: "another_workspace",
      }),
    );
    expect(mocks.setStoredActiveOrganizationSlug).toHaveBeenCalledWith("second-workspace");
  });
});
