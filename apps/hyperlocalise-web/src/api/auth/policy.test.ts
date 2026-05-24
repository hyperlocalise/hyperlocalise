import { describe, expect, it } from "vite-plus/test";

import {
  getCapabilitiesForRole,
  hasCapability,
  ORGANIZATION_CAPABILITIES,
  type OrganizationCapability,
} from "./policy";

const ADMIN_ONLY_CAPABILITIES: OrganizationCapability[] = [
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
    expect([...ORGANIZATION_CAPABILITIES].sort()).toEqual([...ADMIN_ONLY_CAPABILITIES].sort());
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
    it("denies every defined capability", () => {
      for (const capability of ORGANIZATION_CAPABILITIES) {
        expect(hasCapability("member", capability)).toBe(false);
      }

      expect(getCapabilitiesForRole("member")).toEqual([]);
    });
  });
});
