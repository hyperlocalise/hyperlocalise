import { and, eq, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
import {
  canActorManageTarget as canActorManageTargetMember,
  memberRowCapabilities,
} from "@/lib/members/member-management";

export {
  assignableRolesForActor,
  buildMemberManagementContext,
  canActorAssignRole,
  getMembershipStatusDescription,
  getMembershipStatusLabel,
  getRoleDescription,
  getRoleLabel,
} from "@/lib/members/member-management";
import {
  conflictResponse,
  forbiddenResponse as sharedForbiddenResponse,
  notFoundResponse,
  validationErrorResponse,
  type JsonContext,
} from "@/api/errors";
import { db, schema, type DatabaseClient } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import {
  INVITED_WORKOS_USER_ID_PREFIX,
  isActiveOrganizationMembership,
  isInvitedPlaceholderWorkosUserId,
  isPendingOrganizationMembership,
  shouldCleanupPlaceholderUserOnMemberRemoval,
} from "@/lib/workos/constants";

import type { z } from "zod";

export {
  INVITED_WORKOS_USER_ID_PREFIX,
  isActiveOrganizationMembership,
  isInvitedPlaceholderWorkosUserId,
  isPendingOrganizationMembership,
  shouldCleanupPlaceholderUserOnMemberRemoval,
};

export function resolveMemberStatus(input: {
  workosMembershipId: string | null;
}): "active" | "invited" {
  return isPendingOrganizationMembership(input.workosMembershipId) ? "invited" : "active";
}

export function forbiddenResponse(c: JsonContext) {
  return sharedForbiddenResponse(c, "forbidden", "Insufficient permissions");
}

export function memberNotFoundResponse(c: JsonContext) {
  return notFoundResponse(c, "member_not_found", "Workspace member not found");
}

export function invalidMemberPayloadResponse(c: JsonContext, issues?: z.ZodIssue[]) {
  return validationErrorResponse(c, "invalid_member_payload", "Invalid member payload", issues);
}

export function memberAlreadyExistsResponse(c: JsonContext) {
  return conflictResponse(c, "member_already_exists", "This user is already a workspace member");
}

export function lastAdminProtectedResponse(c: JsonContext) {
  return conflictResponse(c, "last_admin_protected", "The workspace must have at least one admin");
}

export function cannotManageMemberResponse(c: JsonContext) {
  return forbiddenResponse(c);
}

export function isMemberListAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "workspace:read");
}

export function isMemberManageAllowed(role: ApiAuthContext["membership"]["role"]) {
  return hasCapability(role, "members:invite");
}

export function formatMemberDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const parts = [input.firstName, input.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : input.email;
}

export function canActorManageTarget(
  actorRole: OrganizationMembershipRole,
  targetRole: OrganizationMembershipRole,
  nextRole?: OrganizationMembershipRole,
) {
  return canActorManageTargetMember(actorRole, targetRole, nextRole);
}

export async function countOrganizationAdmins(
  organizationId: string,
  database: DatabaseClient = db,
) {
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.organizationMemberships.role, "admin"),
      ),
    );

  return result?.count ?? 0;
}

export async function lockOrganizationAdminsAndCount(
  database: DatabaseClient,
  organizationId: string,
) {
  await database.execute(
    sql`SELECT id FROM organization_memberships WHERE organization_id = ${organizationId} AND role = 'admin' FOR UPDATE`,
  );

  return countOrganizationAdmins(organizationId, database);
}

export async function getOrganizationMember(organizationId: string, workosUserId: string) {
  const [row] = await db
    .select({
      membershipId: schema.organizationMemberships.id,
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      role: schema.organizationMemberships.role,
      createdAt: schema.organizationMemberships.createdAt,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      avatarUrl: schema.users.avatarUrl,
      localUserId: schema.users.id,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.users.workosUserId, workosUserId),
      ),
    )
    .limit(1);

  return row ?? null;
}

export function toMemberSummary(
  row: {
    workosUserId: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl?: string | null;
    role: OrganizationMembershipRole;
    createdAt: Date;
    workosMembershipId: string | null;
  },
  currentWorkosUserId: string,
  actorRole?: OrganizationMembershipRole,
): {
  workosUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: OrganizationMembershipRole;
  isCurrentUser: boolean;
  createdAt: string;
  status: "active" | "invited";
  canUpdateRole?: boolean;
  canRemove?: boolean;
} {
  const isCurrentUser = row.workosUserId === currentWorkosUserId;
  const capabilities =
    actorRole === undefined
      ? undefined
      : memberRowCapabilities({
          actorRole,
          targetRole: row.role,
          isCurrentUser,
        });

  return {
    workosUserId: row.workosUserId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: formatMemberDisplayName(row),
    avatarUrl: row.avatarUrl ?? null,
    role: row.role,
    isCurrentUser,
    createdAt: row.createdAt.toISOString(),
    status: resolveMemberStatus({ workosMembershipId: row.workosMembershipId }),
    ...(capabilities
      ? {
          canUpdateRole: capabilities.canUpdateRole,
          canRemove: capabilities.canRemove,
        }
      : {}),
  };
}
