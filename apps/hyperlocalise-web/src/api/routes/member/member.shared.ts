import { and, eq, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { hasCapability } from "@/api/auth/policy";
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
  isInvitedPlaceholderWorkosUserId,
  shouldCleanupPlaceholderUserOnMemberRemoval,
} from "@/lib/workos/constants";

import type { z } from "zod";

export {
  INVITED_WORKOS_USER_ID_PREFIX,
  isInvitedPlaceholderWorkosUserId,
  shouldCleanupPlaceholderUserOnMemberRemoval,
};

export function resolveMemberStatus(workosUserId: string): "active" | "invited" {
  return isInvitedPlaceholderWorkosUserId(workosUserId) ? "invited" : "active";
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

export function lastOwnerProtectedResponse(c: JsonContext) {
  return conflictResponse(c, "last_owner_protected", "The workspace must have at least one owner");
}

export function cannotManageOwnerResponse(c: JsonContext) {
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
  if (!isMemberManageAllowed(actorRole)) {
    return false;
  }

  if (actorRole === "admin") {
    if (targetRole === "owner") {
      return false;
    }

    if (nextRole === "owner") {
      return false;
    }
  }

  return true;
}

export async function countOrganizationOwners(
  organizationId: string,
  database: DatabaseClient = db,
) {
  const [result] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.organizationMemberships.role, "owner"),
      ),
    );

  return result?.count ?? 0;
}

export async function lockOrganizationOwnersAndCount(
  database: DatabaseClient,
  organizationId: string,
) {
  await database.execute(
    sql`SELECT id FROM organization_memberships WHERE organization_id = ${organizationId} AND role = 'owner' FOR UPDATE`,
  );

  return countOrganizationOwners(organizationId, database);
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
    role: OrganizationMembershipRole;
    createdAt: Date;
  },
  currentWorkosUserId: string,
): {
  workosUserId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  role: OrganizationMembershipRole;
  isCurrentUser: boolean;
  createdAt: string;
  status: "active" | "invited";
} {
  return {
    workosUserId: row.workosUserId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: formatMemberDisplayName(row),
    role: row.role,
    isCurrentUser: row.workosUserId === currentWorkosUserId,
    createdAt: row.createdAt.toISOString(),
    status: resolveMemberStatus(row.workosUserId),
  };
}
