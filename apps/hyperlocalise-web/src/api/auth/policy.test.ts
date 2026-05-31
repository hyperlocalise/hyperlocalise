import { describe, expect, it } from "vite-plus/test";

import {
  assertCapability,
  getCapabilitiesForRole,
  hasCapability,
  isAdminRole,
  isOrganizationAdminRole,
  isWorkspaceOperatorRole,
  ORGANIZATION_CAPABILITIES,
  resolveCapabilitiesFromWorkosRoleSlug,
  type OrganizationCapability,
} from "./policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

const MEMBER_READ_CAPABILITIES: OrganizationCapability[] = [
  "workspace:read",
  "projects:read",
  "teams:read",
  "glossaries:read",
  "memories:read",
  "jobs:read",
];

const CONTRIBUTOR_CAPABILITIES: OrganizationCapability[] = [
  "jobs:create",
  "jobs:write",
  "ai_actions:run",
];

const WRITE_BACK_TRANSLATION_CAPABILITIES: OrganizationCapability[] = ["write_back:translation"];

const REVIEW_CAPABILITIES: OrganizationCapability[] = [
  "reviews:read",
  "reviews:approve",
  "write_back:approve",
  "agent_write:approve",
];

const OPERATOR_CAPABILITIES: OrganizationCapability[] = [
  "workspace:update",
  "members:invite",
  "teams:write",
  "projects:create",
  "projects:write",
  "glossaries:write",
  "memories:write",
  "provider_credentials:read",
  "provider_credentials:write",
  "api_keys:read",
  "api_keys:write",
  "integrations:read",
  "integrations:write",
  "billing:read",
];

const ADMIN_ONLY_CAPABILITIES: OrganizationCapability[] = ["billing:write"];

const SENSITIVE_ADMIN_CAPABILITIES: OrganizationCapability[] = [
  "billing:write",
  "billing:read",
  "members:invite",
  "provider_credentials:write",
  "provider_credentials:read",
  "integrations:write",
  "workspace:update",
];

const DEVELOPER_CAPABILITIES: OrganizationCapability[] = [
  "projects:create",
  "projects:write",
  "integrations:read",
];

const ALL_ROLES = [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
] as const satisfies readonly OrganizationMembershipRole[];

describe("organization capability policy", () => {
  it("defines every expected capability", () => {
    expect([...ORGANIZATION_CAPABILITIES].sort()).toEqual(
      [
        ...MEMBER_READ_CAPABILITIES,
        ...CONTRIBUTOR_CAPABILITIES,
        ...WRITE_BACK_TRANSLATION_CAPABILITIES,
        ...REVIEW_CAPABILITIES,
        ...OPERATOR_CAPABILITIES,
        ...ADMIN_ONLY_CAPABILITIES,
      ].sort(),
    );
  });

  describe("admin role", () => {
    it("grants every defined capability", () => {
      for (const capability of ORGANIZATION_CAPABILITIES) {
        expect(hasCapability("admin", capability)).toBe(true);
      }

      expect(getCapabilitiesForRole("admin").sort()).toEqual([...ORGANIZATION_CAPABILITIES].sort());
    });

    it("is the only organization admin role", () => {
      expect(isOrganizationAdminRole("admin")).toBe(true);
      for (const role of ALL_ROLES) {
        if (role === "admin") {
          continue;
        }
        expect(isOrganizationAdminRole(role)).toBe(false);
      }
    });
  });

  describe("localization_manager role", () => {
    it("grants operational admin capabilities except billing write", () => {
      for (const capability of [
        ...MEMBER_READ_CAPABILITIES,
        ...CONTRIBUTOR_CAPABILITIES,
        ...REVIEW_CAPABILITIES,
        ...OPERATOR_CAPABILITIES,
      ]) {
        expect(hasCapability("localization_manager", capability)).toBe(true);
      }

      expect(hasCapability("localization_manager", "billing:write")).toBe(false);
    });

    it("is a workspace operator", () => {
      expect(isWorkspaceOperatorRole("localization_manager")).toBe(true);
      expect(isAdminRole("localization_manager")).toBe(true);
    });
  });

  describe("developer role", () => {
    it("grants project and job capabilities without review or org admin", () => {
      for (const capability of [
        ...MEMBER_READ_CAPABILITIES,
        ...CONTRIBUTOR_CAPABILITIES,
        ...WRITE_BACK_TRANSLATION_CAPABILITIES,
        ...DEVELOPER_CAPABILITIES,
      ]) {
        expect(hasCapability("developer", capability)).toBe(true);
      }

      for (const capability of REVIEW_CAPABILITIES) {
        expect(hasCapability("developer", capability)).toBe(false);
      }

      for (const capability of SENSITIVE_ADMIN_CAPABILITIES) {
        expect(hasCapability("developer", capability)).toBe(false);
      }

      expect(hasCapability("developer", "integrations:write")).toBe(false);
      expect(hasCapability("developer", "glossaries:write")).toBe(false);
    });

    it("is not a workspace operator", () => {
      expect(isWorkspaceOperatorRole("developer")).toBe(false);
    });
  });

  describe("reviewer role", () => {
    it("grants review and write-back approval but not org administration", () => {
      for (const capability of REVIEW_CAPABILITIES) {
        expect(hasCapability("reviewer", capability)).toBe(true);
      }

      for (const capability of OPERATOR_CAPABILITIES) {
        expect(hasCapability("reviewer", capability)).toBe(false);
      }

      expect(hasCapability("reviewer", "write_back:translation")).toBe(true);
      expect(hasCapability("reviewer", "billing:write")).toBe(false);
    });

    it("is not a workspace operator", () => {
      expect(isWorkspaceOperatorRole("reviewer")).toBe(false);
    });
  });

  describe("translator role", () => {
    it("grants job contribution and draft write-back only", () => {
      for (const capability of CONTRIBUTOR_CAPABILITIES) {
        expect(hasCapability("translator", capability)).toBe(true);
      }

      for (const capability of REVIEW_CAPABILITIES) {
        expect(hasCapability("translator", capability)).toBe(false);
      }

      for (const capability of SENSITIVE_ADMIN_CAPABILITIES) {
        expect(hasCapability("translator", capability)).toBe(false);
      }
    });
  });

  describe("member role", () => {
    it("grants baseline read capabilities", () => {
      for (const capability of MEMBER_READ_CAPABILITIES) {
        expect(hasCapability("member", capability)).toBe(true);
      }

      expect(getCapabilitiesForRole("member").sort()).toEqual([...MEMBER_READ_CAPABILITIES].sort());
    });

    it("denies contributor, review, and admin capabilities", () => {
      for (const capability of [
        ...CONTRIBUTOR_CAPABILITIES,
        ...REVIEW_CAPABILITIES,
        ...OPERATOR_CAPABILITIES,
        ...ADMIN_ONLY_CAPABILITIES,
      ]) {
        expect(hasCapability("member", capability)).toBe(false);
      }
    });
  });

  describe("resolveCapabilitiesFromWorkosRoleSlug", () => {
    it("maps known WorkOS slugs to the same capabilities as local roles", () => {
      expect(resolveCapabilitiesFromWorkosRoleSlug("reviewer").sort()).toEqual(
        getCapabilitiesForRole("reviewer").sort(),
      );
    });

    it("returns no capabilities for unknown slugs", () => {
      expect(resolveCapabilitiesFromWorkosRoleSlug("owner")).toEqual([]);
      expect(resolveCapabilitiesFromWorkosRoleSlug(undefined)).toEqual([]);
    });

    it("maps contractor slug to limited contributor capabilities", () => {
      expect(resolveCapabilitiesFromWorkosRoleSlug("contractor").sort()).toEqual(
        getCapabilitiesForRole("contractor").sort(),
      );
    });
  });

  describe("unrecognized local roles", () => {
    const unknownRole = "guest" as OrganizationMembershipRole;

    it("returns no capabilities", () => {
      expect(getCapabilitiesForRole(unknownRole)).toEqual([]);
    });

    it("denies every capability", () => {
      for (const capability of ORGANIZATION_CAPABILITIES) {
        expect(hasCapability(unknownRole, capability)).toBe(false);
      }
    });
  });

  describe("assertCapability", () => {
    it("throws when the role lacks the requested capability", () => {
      expect(() => assertCapability("member", "members:invite")).toThrow("forbidden");
      expect(() => assertCapability("translator", "reviews:approve")).toThrow("forbidden");
    });

    it("does not throw when the role has the requested capability", () => {
      expect(() => assertCapability("admin", "members:invite")).not.toThrow();
      expect(() => assertCapability("reviewer", "reviews:approve")).not.toThrow();
    });
  });
});
