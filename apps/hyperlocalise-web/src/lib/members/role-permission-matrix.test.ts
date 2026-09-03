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

import { hasCapability } from "@/api/auth/policy";

import {
  groupRolePermissionRows,
  ROLE_PERMISSION_MATRIX_ROLES,
  ROLE_PERMISSION_ROWS,
  roleHasPermissionRow,
} from "./role-permission-matrix";

describe("role-permission-matrix", () => {
  it("groups consecutive rows by section", () => {
    const groups = groupRolePermissionRows();

    expect(groups.map((group) => group.id)).toEqual(["work", "people", "workspace"]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      "view-workspace",
      "view-projects",
      "view-jobs",
      "work-jobs",
      "run-ai",
      "push-drafts",
      "approve-reviews",
      "approve-write-back",
      "create-projects",
      "manage-projects",
    ]);
    expect(groups[1]?.rows.map((row) => row.id)).toEqual(["invite-people", "manage-teams"]);
    expect(groups[2]?.rows.map((row) => row.id)).toEqual([
      "edit-glossaries",
      "edit-memories",
      "view-integrations",
      "manage-integrations",
      "manage-credentials",
      "update-settings",
      "manage-billing",
    ]);
  });

  it("uses one capability per row", () => {
    expect(ROLE_PERMISSION_ROWS.map((row) => row.capability)).toEqual([
      "workspace:read",
      "projects:read",
      "jobs:read",
      "jobs:write",
      "ai_actions:run",
      "write_back:translation",
      "reviews:approve",
      "write_back:approve",
      "projects:create",
      "projects:write",
      "members:invite",
      "teams:write",
      "glossaries:write",
      "memories:write",
      "integrations:read",
      "integrations:write",
      "provider_credentials:write",
      "workspace:update",
      "billing:write",
    ]);
  });

  it("marks a cell allowed only when the role has that capability", () => {
    expect(roleHasPermissionRow("member", "workspace:read")).toBe(true);
    expect(roleHasPermissionRow("member", "jobs:write")).toBe(false);
    expect(roleHasPermissionRow("developer", "reviews:approve")).toBe(false);
    expect(roleHasPermissionRow("localization_manager", "billing:write")).toBe(false);
    expect(roleHasPermissionRow("admin", "billing:write")).toBe(true);
  });

  it("stays aligned with policy.ts for every matrix cell", () => {
    for (const row of ROLE_PERMISSION_ROWS) {
      for (const role of ROLE_PERMISSION_MATRIX_ROLES) {
        expect(roleHasPermissionRow(role, row.capability), `${row.id}:${role}`).toBe(
          hasCapability(role, row.capability),
        );
      }
    }
  });
});
