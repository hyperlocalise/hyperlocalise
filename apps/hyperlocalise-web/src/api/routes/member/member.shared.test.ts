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
import { describe, expect, it } from "vite-plus/test";

import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";

import { resolveMemberStatus } from "./member.shared";

describe("resolveMemberStatus", () => {
  it("marks memberships without WorkOS confirmation as invited", () => {
    expect(resolveMemberStatus({ workosMembershipId: null })).toBe("invited");
  });

  it("marks memberships with WorkOS confirmation as active", () => {
    expect(resolveMemberStatus({ workosMembershipId: "om_123" })).toBe("active");
  });

  it("marks in-flight invite replacement as invited", () => {
    expect(resolveMemberStatus({ workosMembershipId: REPLACING_WORKOS_MEMBERSHIP_ID })).toBe(
      "invited",
    );
  });
});
