import { describe, expect, it } from "vite-plus/test";

import { resolveMemberStatus } from "./member.shared";

describe("resolveMemberStatus", () => {
  it("marks memberships without WorkOS confirmation as invited", () => {
    expect(resolveMemberStatus({ workosMembershipId: null })).toBe("invited");
  });

  it("marks memberships with WorkOS confirmation as active", () => {
    expect(resolveMemberStatus({ workosMembershipId: "om_123" })).toBe("active");
  });
});
