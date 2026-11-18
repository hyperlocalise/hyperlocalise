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
import "dotenv/config";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { refuseVendorUnlessAllowed } from "@/api/auth/vendor-access";

const { redirectMock, withAuthMock, sessionMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((location: string) => {
    throw new Error(`redirect:${location}`);
  }),
  withAuthMock: vi.fn(),
  sessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: withAuthMock }));
vi.mock("@/api/auth/workos-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/auth/workos-session")>()),
  resolveApiAuthContextFromSession: sessionMock,
}));
vi.mock("@/lib/workos/active-organization", () => ({
  getStoredActiveOrganizationSlug: vi.fn(async () => null),
  setStoredActiveOrganizationSlug: vi.fn(),
}));

/** A session function that refuses a vendor as the real one does. */
function signInAs(role: string) {
  withAuthMock.mockResolvedValue({
    user: { id: "user_1", email: "person@example.com", emailVerified: true },
    organizationId: null,
  });
  sessionMock.mockImplementation(async (options: { allowVendor?: boolean }) => {
    const auth = { membership: { role }, activeOrganization: { slug: "acme" } };
    refuseVendorUnlessAllowed(auth, options.allowVendor);
    return auth;
  });
}

describe("a page opened by a vendor", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends them to My jobs unless the page says vendors may open it", async () => {
    signInAs("vendor");
    const { requireAppAuthContext } = await import("./app-auth");

    await expect(requireAppAuthContext({ organizationSlug: "acme" })).rejects.toThrow(
      "redirect:/org/acme/my-jobs",
    );

    const opened = await requireAppAuthContext({ organizationSlug: "acme", allowVendor: true });
    expect(opened.membership.role).toBe("vendor");
  });

  it("changes nothing for another role", async () => {
    signInAs("translator");
    const { requireAppAuthContext } = await import("./app-auth");

    const opened = await requireAppAuthContext({ organizationSlug: "acme" });
    expect(opened.membership.role).toBe("translator");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("is still told which workspaces they have, so they can switch or leave", async () => {
    signInAs("vendor");
    const { getAppAuthContextAllowingNoWorkspace } = await import("./app-auth");

    const result = await getAppAuthContextAllowingNoWorkspace({});
    expect(result.auth?.membership.role).toBe("vendor");
  });
});
