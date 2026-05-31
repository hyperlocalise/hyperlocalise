import { describe, expect, it } from "vite-plus/test";

import {
  membershipRoleFromUnknownRoleField,
  membershipRoleToWorkosRoleSlug,
  workosRoleSlugToMembershipRole,
} from "./membership-role";

describe("membershipRoleToWorkosRoleSlug", () => {
  it("maps every localization role to an identical WorkOS slug", () => {
    expect(membershipRoleToWorkosRoleSlug("admin")).toBe("admin");
    expect(membershipRoleToWorkosRoleSlug("localization_manager")).toBe("localization_manager");
    expect(membershipRoleToWorkosRoleSlug("developer")).toBe("developer");
    expect(membershipRoleToWorkosRoleSlug("reviewer")).toBe("reviewer");
    expect(membershipRoleToWorkosRoleSlug("translator")).toBe("translator");
    expect(membershipRoleToWorkosRoleSlug("contractor")).toBe("contractor");
    expect(membershipRoleToWorkosRoleSlug("member")).toBe("member");
  });
});

describe("workosRoleSlugToMembershipRole", () => {
  it("maps known WorkOS slugs to local roles", () => {
    expect(workosRoleSlugToMembershipRole("admin")).toBe("admin");
    expect(workosRoleSlugToMembershipRole("localization_manager")).toBe("localization_manager");
    expect(workosRoleSlugToMembershipRole("developer")).toBe("developer");
    expect(workosRoleSlugToMembershipRole("reviewer")).toBe("reviewer");
    expect(workosRoleSlugToMembershipRole("translator")).toBe("translator");
    expect(workosRoleSlugToMembershipRole("contractor")).toBe("contractor");
    expect(workosRoleSlugToMembershipRole("member")).toBe("member");
  });

  it("returns null for unknown or missing slugs", () => {
    expect(workosRoleSlugToMembershipRole("owner")).toBeNull();
    expect(workosRoleSlugToMembershipRole(undefined)).toBeNull();
  });
});

describe("membershipRoleFromUnknownRoleField", () => {
  it("reads slug objects from WorkOS membership payloads", () => {
    expect(membershipRoleFromUnknownRoleField({ slug: "reviewer" })).toBe("reviewer");
    expect(membershipRoleFromUnknownRoleField("translator")).toBe("translator");
  });

  it("returns null for unrecognized slug values", () => {
    expect(membershipRoleFromUnknownRoleField({ slug: "owner" })).toBeNull();
  });
});
