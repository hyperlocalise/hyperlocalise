import { describe, expect, it } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import {
  isDeprecatedLocalOrgWorkosId,
  LOCAL_ORG_WORKOS_ID_PREFIX,
  resolveAutumnCustomerIdentity,
} from "@/lib/billing/autumn-customer";
import { isErr } from "@/lib/primitives/result/results";

function createAuthContext(
  overrides: Partial<ApiAuthContext["organization"]> = {},
): ApiAuthContext {
  return {
    user: {
      workosUserId: "user_test",
      localUserId: "00000000-0000-4000-8000-000000000001",
      email: "owner@example.com",
    },
    organizations: [],
    organization: {
      workosOrganizationId: "org_test",
      localOrganizationId: "00000000-0000-4000-8000-000000000010",
      name: "Example Workspace",
      slug: "example-workspace",
      membership: {
        workosMembershipId: "membership_test",
        role: "owner",
      },
      ...overrides,
    },
    activeOrganization: {
      workosOrganizationId: "org_test",
      localOrganizationId: "00000000-0000-4000-8000-000000000010",
      name: "Example Workspace",
      slug: "example-workspace",
      membership: {
        workosMembershipId: "membership_test",
        role: "owner",
      },
      ...overrides,
    },
    membership: {
      workosMembershipId: "membership_test",
      role: "owner",
    },
    activeTeam: null,
    capabilities: [],
  };
}

describe("autumn customer identity", () => {
  it("maps organizations to stable Autumn customer IDs", () => {
    const auth = createAuthContext();
    const identity = resolveAutumnCustomerIdentity(auth);

    expect(isErr(identity)).toBe(false);
    if (isErr(identity)) {
      throw new Error("Expected Autumn customer identity to resolve");
    }

    expect(identity.value).toEqual({
      customerId: "00000000-0000-4000-8000-000000000010",
      customerData: {
        name: "Example Workspace",
        email: "owner@example.com",
      },
    });
  });

  it("rejects deprecated local_org workspaces", () => {
    const auth = createAuthContext({
      workosOrganizationId: `${LOCAL_ORG_WORKOS_ID_PREFIX}legacy`,
    });

    expect(isDeprecatedLocalOrgWorkosId(auth.organization.workosOrganizationId)).toBe(true);
    expect(resolveAutumnCustomerIdentity(auth)).toMatchObject({
      ok: false,
      error: { code: "billing_customer_unavailable" },
    });
  });
});
