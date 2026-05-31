import { describe, expect, it } from "vite-plus/test";

import {
  assignableRolesForActor,
  canActorAssignRole,
  canActorManageTarget,
  getMembershipStatusLabel,
  getRoleLabel,
  memberRowCapabilities,
} from "./member-management";

describe("member-management", () => {
  it("labels membership status for the members UI", () => {
    expect(getMembershipStatusLabel("invited")).toBe("Pending");
    expect(getMembershipStatusLabel("active")).toBe("Active");
  });

  it("exposes localization role labels from WorkOS definitions", () => {
    expect(getRoleLabel("localization_manager")).toBe("Localization manager");
    expect(getRoleLabel("contractor")).toBe("Contractor");
  });

  it("lets admins assign every role including admin", () => {
    expect(assignableRolesForActor("admin")).toContain("admin");
    expect(canActorAssignRole("admin", "contractor")).toBe(true);
    expect(canActorManageTarget("admin", "localization_manager", "reviewer")).toBe(true);
  });

  it("lets localization managers assign non-admin roles only", () => {
    expect(assignableRolesForActor("localization_manager")).not.toContain("admin");
    expect(canActorAssignRole("localization_manager", "reviewer")).toBe(true);
    expect(canActorAssignRole("localization_manager", "admin")).toBe(false);
    expect(canActorManageTarget("localization_manager", "admin")).toBe(false);
    expect(canActorManageTarget("localization_manager", "reviewer", "translator")).toBe(true);
  });

  it("denies member management affordances for read-only members", () => {
    expect(assignableRolesForActor("member")).toEqual([]);
    expect(
      memberRowCapabilities({
        actorRole: "member",
        targetRole: "translator",
        isCurrentUser: false,
      }),
    ).toEqual({ canUpdateRole: false, canRemove: false });
  });

  it("hides self-management actions for the signed-in user", () => {
    expect(
      memberRowCapabilities({
        actorRole: "admin",
        targetRole: "admin",
        isCurrentUser: true,
      }),
    ).toEqual({ canUpdateRole: false, canRemove: false });
  });
});
