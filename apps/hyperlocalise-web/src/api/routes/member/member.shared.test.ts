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
