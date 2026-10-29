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

import { switchableWorkspaces } from "./switchable-workspaces";

describe("switchableWorkspaces", () => {
  it("keeps workspaces with an address that the person has joined in WorkOS", () => {
    const joined = { slug: "acme", membership: { workosMembershipId: "om_1" } };

    expect(
      switchableWorkspaces([
        joined,
        { slug: "invited", membership: { workosMembershipId: null } },
        { slug: null, membership: { workosMembershipId: "om_2" } },
      ]),
    ).toEqual([joined]);
  });
});
