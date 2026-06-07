import { describe, expect, it } from "vite-plus/test";

import { createTeamDetail, createTeamMember, createTeamSummary } from "./teams.fixture";
import {
  canRemoveTeamMember,
  canUpdateTeamMemberRole,
  listAssignableMembers,
  resolveTeamDetailPageState,
  resolveTeamsListPageState,
} from "./teams-settings-view-model";

describe("teams-settings-view-model", () => {
  it("enables team creation for workspace admins", () => {
    const state = resolveTeamsListPageState({
      teams: [createTeamSummary()],
      canManageTeams: true,
    });

    expect(state.canCreateTeam).toBe(true);
  });

  it("lets team managers manage members without workspace admin access", () => {
    const team = createTeamDetail({
      members: [
        createTeamMember({ workosUserId: "user_manager", role: "manager" }),
        createTeamMember({ workosUserId: "user_member", role: "member" }),
      ],
    });

    const state = resolveTeamDetailPageState({
      team,
      canManageTeams: false,
      currentUserWorkosId: "user_manager",
    });

    expect(state.canManageMembers).toBe(true);
  });

  it("filters already-assigned members out of the add-member picker", () => {
    const members = [createTeamMember({ workosUserId: "user_001", email: "mina@example.com" })];

    const assignable = listAssignableMembers({
      directory: [
        { workosUserId: "user_001", email: "mina@example.com" },
        { workosUserId: "user_002", email: "otto@example.com" },
      ],
      members,
    });

    expect(assignable).toEqual([{ workosUserId: "user_002", email: "otto@example.com" }]);
  });

  it("prevents removing the last team manager", () => {
    const members = [createTeamMember({ workosUserId: "user_manager", role: "manager" })];

    expect(
      canRemoveTeamMember({
        member: members[0]!,
        members,
        canManageMembers: true,
      }),
    ).toBe(false);
  });

  it("allows removing a manager when another manager remains", () => {
    const members = [
      createTeamMember({ workosUserId: "user_manager_a", role: "manager" }),
      createTeamMember({ workosUserId: "user_manager_b", role: "manager" }),
    ];

    expect(
      canRemoveTeamMember({
        member: members[0]!,
        members,
        canManageMembers: true,
      }),
    ).toBe(true);
  });

  it("prevents demoting the last team manager", () => {
    const members = [createTeamMember({ workosUserId: "user_manager", role: "manager" })];

    expect(
      canUpdateTeamMemberRole({
        member: members[0]!,
        members,
        canManageMembers: true,
      }),
    ).toBe(false);
  });
});
