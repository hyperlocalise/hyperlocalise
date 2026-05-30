import { describe, expect, it } from "vite-plus/test";

import { REPLACING_WORKOS_MEMBERSHIP_ID } from "@/lib/workos/constants";
import {
  grantsOrganizationAccess,
  resolveOrganizationMembershipAccessSource,
} from "@/lib/workos/membership-access";

describe("resolveOrganizationMembershipAccessSource", () => {
  it("treats active WorkOS membership ids as authoritative", () => {
    expect(resolveOrganizationMembershipAccessSource("om_123")).toBe("workos_authoritative");
    expect(grantsOrganizationAccess("workos_authoritative")).toBe(true);
  });

  it("treats pending invites without WorkOS membership as non-authoritative", () => {
    expect(resolveOrganizationMembershipAccessSource(null)).toBe("pending_invite");
    expect(resolveOrganizationMembershipAccessSource(undefined)).toBe("pending_invite");
    expect(grantsOrganizationAccess("pending_invite")).toBe(false);
  });

  it("treats replacing sentinel as non-authoritative", () => {
    expect(resolveOrganizationMembershipAccessSource(REPLACING_WORKOS_MEMBERSHIP_ID)).toBe(
      "replacing_invite",
    );
    expect(grantsOrganizationAccess("replacing_invite")).toBe(false);
  });
});
