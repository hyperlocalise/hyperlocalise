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
  pendingRows: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/lib/database/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({ where: () => ({ limit: () => mocks.pendingRows() }) }),
        }),
      }),
    }),
  },
  schema: {
    organizations: {},
    organizationMemberships: {},
    users: {},
  },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
  or: vi.fn(),
}));
vi.mock("@/lib/workos/constants", () => ({ isReplacingWorkosMembershipSql: vi.fn() }));
vi.mock("@/api/auth/workos-membership-reconcile", () => ({
  reconcileWorkosMembershipsForUser: vi.fn(async () => ({ status: "skipped" })),
}));
vi.mock("@/api/auth/workos-sync", () => ({ promoteInvitedPlaceholderUser: vi.fn() }));

import { redirectForMissingOrganizationAccess } from "./missing-organization-access";

const invitee = { email: "person@example.com", workosUserId: "user_1" };

describe("redirectForMissingOrganizationAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendingRows.mockResolvedValue([{ id: "membership-1" }]);
  });

  it("sends a verified person with invitations to the picker, where they can accept", async () => {
    await expect(
      redirectForMissingOrganizationAccess({ ...invitee, emailVerified: true }),
    ).rejects.toThrow("redirect:/auth/select-organization");
  });

  it("keeps an unverified person on the invitation pending page", async () => {
    await expect(
      redirectForMissingOrganizationAccess({ ...invitee, emailVerified: false }),
    ).rejects.toThrow("redirect:/auth/access-denied?reason=pending-invite");
  });

  it("sends someone with no invitation to onboarding", async () => {
    mocks.pendingRows.mockResolvedValue([]);

    await expect(
      redirectForMissingOrganizationAccess({ ...invitee, emailVerified: true }),
    ).rejects.toThrow("redirect:/auth/onboarding");
  });

  it("treats an email given alone as unverified", async () => {
    await expect(redirectForMissingOrganizationAccess(invitee.email)).rejects.toThrow(
      "redirect:/auth/access-denied?reason=pending-invite",
    );
  });
});
