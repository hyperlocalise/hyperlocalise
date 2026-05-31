import { describe, expect, it } from "vite-plus/test";

import {
  membershipRoleFromUnknownRoleField,
  membershipRoleToWorkosRoleSlug,
  workosRoleSlugToMembershipRole,
} from "./membership-role";

describe("membershipRoleToWorkosRoleSlug", () => {
  it("maps admin and member to WorkOS slugs", () => {
    expect(membershipRoleToWorkosRoleSlug("admin")).toBe("admin");
    expect(membershipRoleToWorkosRoleSlug("member")).toBe("member");
  });
});

describe("workosRoleSlugToMembershipRole", () => {
  it("maps WorkOS slugs to local roles", () => {
    expect(workosRoleSlugToMembershipRole("admin")).toBe("admin");
    expect(workosRoleSlugToMembershipRole("member")).toBe("member");
    expect(workosRoleSlugToMembershipRole(undefined)).toBe("member");
  });
});

describe("membershipRoleFromUnknownRoleField", () => {
  it("reads slug objects from WorkOS membership payloads", () => {
    expect(membershipRoleFromUnknownRoleField({ slug: "admin" })).toBe("admin");
  });
});
