import { describe, expect, it } from "vite-plus/test";

import {
  getCapabilitiesForRole,
  hasCapability,
  isAdminRole,
  ORGANIZATION_CAPABILITIES,
  type OrganizationCapability,
} from "./policy";

const MEMBER_READ_CAPABILITIES: OrganizationCapability[] = [
  "workspace:read",
  "projects:read",
  "teams:read",
  "glossaries:read",
  "memories:read",
];

const ADMIN_ONLY_CAPABILITIES: OrganizationCapability[] = [
  "billing:read",
  "api_keys:read",
  "provider_credentials:read",
  "integrations:read",
  "workspace:update",
  "members:invite",
  "teams:write",
  "projects:create",
  "projects:write",
  "glossaries:write",
  "memories:write",
  "provider_credentials:write",
  "api_keys:write",
  "integrations:write",
  "agent_write:approve",
];

describe("organization capability policy", () => {
  it("defines every expected capability", () => {
    expect([...ORGANIZATION_CAPABILITIES].sort()).toEqual(
      [...MEMBER_READ_CAPABILITIES, ...ADMIN_ONLY_CAPABILITIES].sort(),
    );
  });

  describe.each(["owner", "admin"] as const)("%s role", (role) => {
    it("grants every defined capability", () => {
      for (const capability of ORGANIZATION_CAPABILITIES) {
        expect(hasCapability(role, capability)).toBe(true);
      }

      expect(getCapabilitiesForRole(role).sort()).toEqual([...ORGANIZATION_CAPABILITIES].sort());
    });
  });

  describe("member role", () => {
    it("grants baseline read capabilities", () => {
      for (const capability of MEMBER_READ_CAPABILITIES) {
        expect(hasCapability("member", capability)).toBe(true);
      }

      expect(getCapabilitiesForRole("member").sort()).toEqual([...MEMBER_READ_CAPABILITIES].sort());
    });

    it("denies admin-only read and write capabilities", () => {
      for (const capability of ADMIN_ONLY_CAPABILITIES) {
        expect(hasCapability("member", capability)).toBe(false);
      }
    });
  });

  describe("isAdminRole", () => {
    it("returns false for unrecognized role strings", () => {
      expect(isAdminRole("guest")).toBe(false);
      expect(isAdminRole("")).toBe(false);
    });
  });
});
