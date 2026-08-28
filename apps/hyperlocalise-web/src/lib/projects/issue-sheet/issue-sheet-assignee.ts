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
import { and, eq, inArray } from "drizzle-orm";

import { hasCapability } from "@/api/auth/policy";
import { formatMemberDisplayName } from "@/api/routes/member/member.shared";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { backfillOrganizationProjectTeams } from "@/lib/teams/default-workspace-team";
import { isActiveOrganizationMembership } from "@/lib/workos/constants";

export type IssueAssigneeNotAssignableError = {
  code: "assignee_not_assignable";
};

export type AssignableIssueMember = {
  userId: string;
  workosUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  avatarUrl: string | null;
  isCurrentUser: boolean;
};

async function ensureProjectTeamBackfilled(
  organizationId: string,
  projectId: string,
  database: DatabaseClient,
) {
  const [project] = await database
    .select({
      id: schema.projects.id,
      teamId: schema.projects.teamId,
    })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.id, projectId)),
    )
    .limit(1);

  if (!project) {
    return null;
  }

  if (project.teamId) {
    return project;
  }

  await backfillOrganizationProjectTeams(organizationId);

  const [refreshed] = await database
    .select({
      id: schema.projects.id,
      teamId: schema.projects.teamId,
    })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.organizationId, organizationId), eq(schema.projects.id, projectId)),
    )
    .limit(1);

  return refreshed ?? null;
}

function membershipHasProjectAccess(
  role: OrganizationMembershipRole,
  projectTeamId: string | null,
  memberTeamIds: Set<string>,
) {
  if (hasCapability(role, "teams:write")) {
    return true;
  }
  if (!projectTeamId) {
    return false;
  }
  return memberTeamIds.has(projectTeamId);
}

/**
 * Returns whether a user may be newly assigned to issues on this project.
 * Unassign (`null`) is always allowed by callers without calling this helper.
 */
export async function assertAssignableIssueAssignee(input: {
  organizationId: string;
  projectId: string;
  assigneeUserId: string;
  database?: DatabaseClient;
}): Promise<Result<void, IssueAssigneeNotAssignableError>> {
  const database = input.database ?? db;

  const project = await ensureProjectTeamBackfilled(
    input.organizationId,
    input.projectId,
    database,
  );
  if (!project) {
    return err({ code: "assignee_not_assignable" });
  }

  const [membership] = await database
    .select({
      userId: schema.organizationMemberships.userId,
      role: schema.organizationMemberships.role,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
    })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.organizationMemberships.userId, input.assigneeUserId),
      ),
    )
    .limit(1);

  if (!membership || !isActiveOrganizationMembership(membership.workosMembershipId)) {
    return err({ code: "assignee_not_assignable" });
  }

  if (hasCapability(membership.role, "teams:write")) {
    return ok(undefined);
  }

  if (!project.teamId) {
    return err({ code: "assignee_not_assignable" });
  }

  const [teamMembership] = await database
    .select({ teamId: schema.teamMemberships.teamId })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, input.assigneeUserId),
        eq(schema.teamMemberships.teamId, project.teamId),
      ),
    )
    .limit(1);

  if (!teamMembership) {
    return err({ code: "assignee_not_assignable" });
  }

  return ok(undefined);
}

export async function userHasIssueProjectAccess(input: {
  organizationId: string;
  projectId: string;
  userId: string;
  database?: DatabaseClient;
}): Promise<boolean> {
  const result = await assertAssignableIssueAssignee({
    organizationId: input.organizationId,
    projectId: input.projectId,
    assigneeUserId: input.userId,
    database: input.database,
  });
  return !isErr(result);
}

export async function listAssignableIssueMembers(input: {
  organizationId: string;
  projectId: string;
  actorUserId?: string;
  database?: DatabaseClient;
}): Promise<AssignableIssueMember[]> {
  const database = input.database ?? db;

  const project = await ensureProjectTeamBackfilled(
    input.organizationId,
    input.projectId,
    database,
  );
  if (!project) {
    return [];
  }

  const memberships = await database
    .select({
      userId: schema.users.id,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      avatarUrl: schema.users.avatarUrl,
      role: schema.organizationMemberships.role,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .where(eq(schema.organizationMemberships.organizationId, input.organizationId));

  const activeMemberships = memberships.filter((row) =>
    isActiveOrganizationMembership(row.workosMembershipId),
  );

  if (activeMemberships.length === 0) {
    return [];
  }

  const userIds = activeMemberships.map((row) => row.userId);
  const teamRows =
    project.teamId == null
      ? []
      : await database
          .select({
            userId: schema.teamMemberships.userId,
            teamId: schema.teamMemberships.teamId,
          })
          .from(schema.teamMemberships)
          .where(
            and(
              inArray(schema.teamMemberships.userId, userIds),
              eq(schema.teamMemberships.teamId, project.teamId),
            ),
          );

  const memberTeamIdsByUser = new Map<string, Set<string>>();
  for (const row of teamRows) {
    const set = memberTeamIdsByUser.get(row.userId) ?? new Set<string>();
    set.add(row.teamId);
    memberTeamIdsByUser.set(row.userId, set);
  }

  return activeMemberships
    .filter((row) =>
      membershipHasProjectAccess(
        row.role,
        project.teamId,
        memberTeamIdsByUser.get(row.userId) ?? new Set(),
      ),
    )
    .map((row) => ({
      userId: row.userId,
      workosUserId: row.workosUserId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: formatMemberDisplayName(row),
      avatarUrl: row.avatarUrl,
      isCurrentUser: input.actorUserId != null && row.userId === input.actorUserId,
    }))
    .toSorted(
      (a, b) => a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email),
    );
}

export async function filterAssignableAssigneeUserIds(input: {
  organizationId: string;
  projectId: string;
  userIds: string[];
  database?: DatabaseClient;
}): Promise<Set<string>> {
  const uniqueIds = [...new Set(input.userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Set();
  }

  const requestedIds = new Set(uniqueIds);
  const members = await listAssignableIssueMembers({
    organizationId: input.organizationId,
    projectId: input.projectId,
    database: input.database,
  });

  return new Set(
    members.map((member) => member.userId).filter((userId) => requestedIds.has(userId)),
  );
}
