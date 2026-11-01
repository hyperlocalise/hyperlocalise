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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  getAppAuthContextAllowingNoWorkspace: vi.fn(),
  listPendingInvitations: vi.fn(),
}));

vi.mock("@/lib/app-i18n/server-locale", () => ({ getAppLocale: async () => "en" }));
vi.mock("@/lib/workos/app-auth", () => ({
  getAppAuthContextAllowingNoWorkspace: mocks.getAppAuthContextAllowingNoWorkspace,
}));
vi.mock("@/lib/workos/pending-invitations", () => ({
  listPendingInvitations: mocks.listPendingInvitations,
}));
vi.mock("./_components/accept-invitation-form", () => ({
  AcceptInvitationForm: ({ organizationName }: { organizationName: string }) => (
    <button type="button">{`Accept ${organizationName}`}</button>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ href, ...props }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props} />
  ),
}));

import SelectOrganizationPage from "./page";

describe("SelectOrganizationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPendingInvitations.mockResolvedValue([
      { organizationName: "Gamma", organizationSlug: "gamma" },
    ]);
  });

  it("offers invitations and Create workspace to someone with no workspace", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue({
      sessionUser: { id: "user_1", emailVerified: true },
      auth: null,
    });

    render(await SelectOrganizationPage());

    expect(screen.getByRole("button", { name: "Accept Gamma" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create workspace" }).getAttribute("href")).toBe(
      "/auth/new-workspace",
    );
    expect(mocks.getAppAuthContextAllowingNoWorkspace).toHaveBeenCalledWith({
      ignoreStoredActiveOrganization: true,
    });
  });

  it("asks an unverified person to verify their email instead of listing invitations", async () => {
    mocks.getAppAuthContextAllowingNoWorkspace.mockResolvedValue({
      sessionUser: { id: "user_1", emailVerified: false },
      auth: null,
    });

    render(await SelectOrganizationPage());

    expect(screen.getByText(/Verify your email address to see invitations/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept Gamma" })).toBeNull();
    expect(mocks.listPendingInvitations).not.toHaveBeenCalled();
  });
});
