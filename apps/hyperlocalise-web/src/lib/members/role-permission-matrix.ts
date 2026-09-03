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
import { hasCapability, type OrganizationCapability } from "@/api/auth/policy";
import type { OrganizationMembershipRole } from "@/lib/database/types";

/** Least privilege first, matching the admin-facing matrix. */
export const ROLE_PERMISSION_MATRIX_ROLES = [
  "member",
  "translator",
  "reviewer",
  "developer",
  "localization_manager",
  "admin",
] as const satisfies readonly OrganizationMembershipRole[];

export type RolePermissionGroupId = "work" | "people" | "workspace";

export type RolePermissionRowId =
  | "view-workspace"
  | "view-projects"
  | "view-jobs"
  | "work-jobs"
  | "run-ai"
  | "push-drafts"
  | "approve-reviews"
  | "approve-write-back"
  | "create-projects"
  | "manage-projects"
  | "invite-people"
  | "manage-teams"
  | "edit-glossaries"
  | "edit-memories"
  | "view-integrations"
  | "manage-integrations"
  | "manage-credentials"
  | "update-settings"
  | "manage-billing";

export type RolePermissionRow = {
  id: RolePermissionRowId;
  group: RolePermissionGroupId;
  capability: OrganizationCapability;
};

export const ROLE_PERMISSION_ROWS: readonly RolePermissionRow[] = [
  { id: "view-workspace", group: "work", capability: "workspace:read" },
  { id: "view-projects", group: "work", capability: "projects:read" },
  { id: "view-jobs", group: "work", capability: "jobs:read" },
  { id: "work-jobs", group: "work", capability: "jobs:write" },
  { id: "run-ai", group: "work", capability: "ai_actions:run" },
  { id: "push-drafts", group: "work", capability: "write_back:translation" },
  { id: "approve-reviews", group: "work", capability: "reviews:approve" },
  { id: "approve-write-back", group: "work", capability: "write_back:approve" },
  { id: "create-projects", group: "work", capability: "projects:create" },
  { id: "manage-projects", group: "work", capability: "projects:write" },
  { id: "invite-people", group: "people", capability: "members:invite" },
  { id: "manage-teams", group: "people", capability: "teams:write" },
  { id: "edit-glossaries", group: "workspace", capability: "glossaries:write" },
  { id: "edit-memories", group: "workspace", capability: "memories:write" },
  { id: "view-integrations", group: "workspace", capability: "integrations:read" },
  { id: "manage-integrations", group: "workspace", capability: "integrations:write" },
  { id: "manage-credentials", group: "workspace", capability: "provider_credentials:write" },
  { id: "update-settings", group: "workspace", capability: "workspace:update" },
  { id: "manage-billing", group: "workspace", capability: "billing:write" },
];

export type RolePermissionGroup = {
  id: RolePermissionGroupId;
  rows: readonly RolePermissionRow[];
};

export function groupRolePermissionRows(
  rows: readonly RolePermissionRow[] = ROLE_PERMISSION_ROWS,
): RolePermissionGroup[] {
  const groups: RolePermissionGroup[] = [];

  for (const row of rows) {
    const last = groups.at(-1);
    if (last && last.id === row.group) {
      groups[groups.length - 1] = { id: last.id, rows: [...last.rows, row] };
      continue;
    }

    groups.push({ id: row.group, rows: [row] });
  }

  return groups;
}

export function roleHasPermissionRow(
  role: OrganizationMembershipRole,
  capability: OrganizationCapability,
): boolean {
  return hasCapability(role, capability);
}
