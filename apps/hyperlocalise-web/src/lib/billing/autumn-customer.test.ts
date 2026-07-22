/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import type { ApiAuthContext } from "@/api/auth/workos";
import { resolveAutumnCustomerIdentity } from "@/lib/billing/autumn-customer";
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
        role: "admin",
        accessSource: "workos_authoritative",
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
        role: "admin",
        accessSource: "workos_authoritative",
      },
      ...overrides,
    },
    membership: {
      workosMembershipId: "membership_test",
      role: "admin",
      accessSource: "workos_authoritative",
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
});
