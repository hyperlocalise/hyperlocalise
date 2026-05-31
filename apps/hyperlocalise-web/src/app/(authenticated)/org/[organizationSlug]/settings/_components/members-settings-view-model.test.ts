import { describe, expect, it } from "vite-plus/test";

import { resolveMembersPageState, shouldShowContractorNotice } from "./members-settings-view-model";

describe("resolveMembersPageState", () => {
  it("uses server-provided member management capabilities", () => {
    const state = resolveMembersPageState({
      members: [
        {
          workosUserId: "user_1",
          email: "a@example.com",
          displayName: "Alex",
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

describe("shouldShowContractorNotice", () => {
  it("shows contractor guidance only for contractor invites", () => {
    expect(shouldShowContractorNotice("contractor")).toBe(true);
    expect(shouldShowContractorNotice("translator")).toBe(false);
  });
});
