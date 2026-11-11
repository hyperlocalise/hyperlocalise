/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { describe, expect, it } from "vite-plus/test";

import { getCapabilitiesForRole } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import {
  apiKeyScopeCapabilityMap,
  getGrantableApiKeyPermissions,
  getRefusedApiKeyPermissions,
  ownerCanExerciseApiKeyPermission,
} from "./api-key.permissions";
import { defaultApiKeyPermissions } from "./api-key.schema";

const localizationOperators: OrganizationMembershipRole[] = ["admin", "localization_manager"];

const jobContributors: OrganizationMembershipRole[] = ["developer", "reviewer", "translator"];

describe("getGrantableApiKeyPermissions", () => {
  it("grants every scope to localization operators", () => {
    for (const role of localizationOperators) {
      const capabilities = new Set(getCapabilitiesForRole(role));

      expect(getGrantableApiKeyPermissions(role)).toEqual([...defaultApiKeyPermissions]);
      expect(
        defaultApiKeyPermissions.every((scope) =>
          capabilities.has(apiKeyScopeCapabilityMap[scope]),
        ),
      ).toBe(true);
    }
  });

  it("grants memories:read but not memories:write to job contributors", () => {
    const expected = defaultApiKeyPermissions.filter((scope) => scope !== "memories:write");
    for (const role of jobContributors) {
      expect(getGrantableApiKeyPermissions(role)).toEqual(expected);
    }
  });

  it("limits a member to read scopes", () => {
    expect(getGrantableApiKeyPermissions("member")).toEqual([
      "jobs:read",
      "files:read",
      "memories:read",
    ]);
  });

  it("refuses write scopes a member cannot back", () => {
    expect(
      getRefusedApiKeyPermissions("member", ["jobs:read", "jobs:write", "files:write"]),
    ).toEqual(["jobs:write", "files:write"]);
  });
});

describe("ownerCanExerciseApiKeyPermission", () => {
  it("stops a member-owned token from writing jobs even when the token lists the scope", () => {
    expect(ownerCanExerciseApiKeyPermission("member", "jobs:write")).toBe(false);
    expect(ownerCanExerciseApiKeyPermission("translator", "jobs:write")).toBe(true);
    expect(ownerCanExerciseApiKeyPermission("member", "jobs:read")).toBe(true);
    expect(ownerCanExerciseApiKeyPermission("translator", "memories:write")).toBe(false);
    expect(ownerCanExerciseApiKeyPermission("admin", "memories:write")).toBe(true);
    expect(ownerCanExerciseApiKeyPermission("member", "memories:read")).toBe(true);
  });

  it("fails closed for an unknown scope", () => {
    expect(ownerCanExerciseApiKeyPermission("admin", "api_keys:write")).toBe(false);
  });
});
