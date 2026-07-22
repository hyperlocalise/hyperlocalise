/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";
import {
  grantsOrganizationAccess,
  resolveOrganizationMembershipAccessSource,
} from "@/lib/workos/membership-access";

describe("resolveOrganizationMembershipAccessSource", () => {
  it("treats active WorkOS membership ids as authoritative", () => {
    expect(resolveOrganizationMembershipAccessSource("om_123")).toBe("workos_authoritative");
    expect(grantsOrganizationAccess("workos_authoritative")).toBe(true);
  });

  it("treats pending invites without WorkOS membership as non-authoritative", () => {
    expect(resolveOrganizationMembershipAccessSource(null)).toBe("pending_invite");
    expect(resolveOrganizationMembershipAccessSource(undefined)).toBe("pending_invite");
    expect(grantsOrganizationAccess("pending_invite")).toBe(false);
  });

  it("treats replacing sentinel as non-authoritative", () => {
    expect(resolveOrganizationMembershipAccessSource(REPLACING_WORKOS_MEMBERSHIP_ID)).toBe(
      "replacing_invite",
    );
    expect(grantsOrganizationAccess("replacing_invite")).toBe(false);
  });
});
