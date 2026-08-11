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

import { resolveMembersPageState } from "./members-settings-view-model";

describe("resolveMembersPageState", () => {
  it("uses server-provided member management capabilities", () => {
    const state = resolveMembersPageState({
      members: [
        {
          workosUserId: "user_1",
          email: "a@example.com",
          displayName: "Alex",
          avatarUrl: null,
          role: "reviewer",
          isCurrentUser: false,
          status: "active",
          canUpdateRole: true,
          canRemove: true,
        },
      ],
      memberManagement: {
        canInvite: true,
        assignableRoles: ["localization_manager", "reviewer", "member"],
      },
    });

    expect(state.canInvite).toBe(true);
    expect(state.assignableRoles).toEqual(["localization_manager", "reviewer", "member"]);
    expect(state.members[0]?.canUpdateRole).toBe(true);
  });

  it("defaults to read-only when management metadata is missing", () => {
    const state = resolveMembersPageState({
      members: [
        {
          workosUserId: "user_2",
          email: "b@example.com",
          displayName: "Bailey",
          avatarUrl: null,
          role: "member",
          isCurrentUser: true,
          status: "invited",
        },
      ],
    });

    expect(state.canInvite).toBe(false);
    expect(state.assignableRoles).toEqual([]);
  });
});
