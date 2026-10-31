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

import { err, ok } from "@/lib/primitives/result/results";

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(),
  acceptPendingInvitation: vi.fn(),
  setStoredActiveOrganizationSlug: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/workos/server-auth", () => ({ withAuth: mocks.withAuth }));
vi.mock("@/lib/workos/pending-invitations", () => ({
  acceptPendingInvitation: mocks.acceptPendingInvitation,
}));
vi.mock("@/lib/workos/active-organization", () => ({
  setStoredActiveOrganizationSlug: mocks.setStoredActiveOrganizationSlug,
}));

import { acceptInvitationAction } from "./actions";

const sessionUser = { id: "user_1", email: "person@example.com", emailVerified: true };

function invitationForm(organizationSlug?: string) {
  const formData = new FormData();
  if (organizationSlug) {
    formData.set("organizationSlug", organizationSlug);
  }
  return formData;
}

describe("acceptInvitationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAuth.mockResolvedValue({ user: sessionUser });
  });

  it("opens the workspace once the invitation is accepted", async () => {
    mocks.acceptPendingInvitation.mockResolvedValue(ok({ organizationSlug: "beta" }));

    await expect(acceptInvitationAction({}, invitationForm("beta"))).rejects.toThrow(
      "redirect:/org/beta/dashboard",
    );
    expect(mocks.acceptPendingInvitation).toHaveBeenCalledWith({
      sessionUser,
      organizationSlug: "beta",
    });
    expect(mocks.setStoredActiveOrganizationSlug).toHaveBeenCalledWith("beta");
  });

  it("returns the reason when the invitation cannot be accepted", async () => {
    mocks.acceptPendingInvitation.mockResolvedValue(err({ code: "workos_accept_failed" }));

    expect(await acceptInvitationAction({}, invitationForm("beta"))).toEqual({
      error: "workos_accept_failed",
    });
    expect(mocks.setStoredActiveOrganizationSlug).not.toHaveBeenCalled();
  });

  it("refuses a form without a workspace", async () => {
    expect(await acceptInvitationAction({}, invitationForm())).toEqual({
      error: "invitation_not_found",
    });
    expect(mocks.acceptPendingInvitation).not.toHaveBeenCalled();
  });
});
