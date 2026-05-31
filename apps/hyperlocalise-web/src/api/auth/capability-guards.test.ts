import { describe, expect, it } from "vite-plus/test";

import type { OrganizationMembershipRole } from "@/lib/database/types";

import {
  isAiActionAllowed,
  isIntegrationsReadAllowed,
  isJobCreateAllowed,
  isJobMutationAllowed,
  isJobProviderActionAllowed,
  isProjectCreateAllowed,
  isProjectWriteAllowed,
  isProviderCredentialReadAllowed,
  isReviewApproveAllowed,
  isWriteBackApproveAllowed,
} from "./capability-guards";

const LOCALIZATION_ROLES = [
  "admin",
  "localization_manager",
  "developer",
  "reviewer",
  "translator",
  "member",
] as const satisfies readonly OrganizationMembershipRole[];

type Guard = (role: OrganizationMembershipRole) => boolean;

function expectRoles(guard: Guard, allowed: OrganizationMembershipRole[]) {
  const allowedSet = new Set(allowed);

  for (const role of LOCALIZATION_ROLES) {
    expect(guard(role)).toBe(allowedSet.has(role));
  }
}

describe("capability guards", () => {
  it("scopes project create to operators and developers", () => {
    expectRoles(isProjectCreateAllowed, ["admin", "localization_manager", "developer"]);
  });

  it("scopes project write to operators and developers", () => {
    expectRoles(isProjectWriteAllowed, ["admin", "localization_manager", "developer"]);
  });

  it("scopes job create to contributor roles", () => {
    expectRoles(isJobCreateAllowed, [
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
    ]);
  });

  it("scopes job mutation to contributor roles", () => {
    expectRoles(isJobMutationAllowed, [
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
    ]);
  });

  it("scopes AI actions to contributor roles", () => {
    expectRoles(isAiActionAllowed, [
      "admin",
      "localization_manager",
      "developer",
      "reviewer",
      "translator",
    ]);
  });

  it("scopes review approval to reviewers and operators", () => {
    expectRoles(isReviewApproveAllowed, ["admin", "localization_manager", "reviewer"]);
  });

  it("scopes write-back approval to reviewers and operators", () => {
    expectRoles(isWriteBackApproveAllowed, ["admin", "localization_manager", "reviewer"]);
  });

  it("scopes integrations read to operators and developers", () => {
    expectRoles(isIntegrationsReadAllowed, ["admin", "localization_manager", "developer"]);
  });

  it("scopes provider credential read to operators only", () => {
    expectRoles(isProviderCredentialReadAllowed, ["admin", "localization_manager"]);
  });

  describe("isJobProviderActionAllowed", () => {
    it("requires write-back approval for push_approved_changes", () => {
      expect(isJobProviderActionAllowed("translator", "push_approved_changes")).toBe(false);
      expect(isJobProviderActionAllowed("reviewer", "push_approved_changes")).toBe(true);
      expect(isJobProviderActionAllowed("developer", "push_approved_changes")).toBe(false);
    });

    it("requires AI execution for other provider actions", () => {
      expect(isJobProviderActionAllowed("translator", "qa_check")).toBe(true);
      expect(isJobProviderActionAllowed("member", "qa_check")).toBe(false);
      expect(isJobProviderActionAllowed("reviewer", "review_with_agent")).toBe(true);
    });
  });
});
