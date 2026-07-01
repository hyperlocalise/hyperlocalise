import { and, eq, isNotNull, ne } from "drizzle-orm";
import type { OrganizationMembership } from "@workos-inc/node";

import {
  promoteInvitedPlaceholderUser,
  revokeOrganizationMembershipAccess,
  syncWorkosIdentity,
  syncWorkosOrganization,
  syncWorkosUser,
} from "@/api/auth/workos-sync";
import type { DatabaseClient } from "@/lib/database";
import type { OrganizationMembershipRole } from "@/lib/database/types";
import * as schema from "@/lib/database/schema";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/log";
import {
  isInvitedPlaceholderWorkosUserId,
  isLiveWorkosApiKey,
  REPLACING_WORKOS_MEMBERSHIP_ID,
} from "@/lib/workos/constants";
import { membershipRoleFromUnknownRoleField } from "@/lib/workos/membership-role";
import { getWorkosServerClient } from "@/lib/workos/server-client";

const logger = createLogger("workos-membership-reconcile");

/** Reuse cached membership decisions for this long when WorkOS lookup fails. */
export const WORKOS_MEMBERSHIP_RECONCILE_TTL_MS = 5 * 60 * 1000;

export type ReconcileWorkosMembershipsResult =
  | {
      status: "reconciled";
      added: number;
      updated: number;
      revoked: number;
    }
  | {
      status: "skipped";
    }
  | {
      status: "lookup_failed";
      lastReconciledAt: Date | null;
    };

type ReconcileWorkosMembershipsInput = {
  workosUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  /** When set, only reconcile membership for this WorkOS organization. */
  workosOrganizationId?: string;
  /** Bypass the per-user reconcile TTL. */
  force?: boolean;
  /**
   * When true, update workosMembershipsReconciledAt after a scoped reconcile completes.
   * Use for high-frequency scoped auth (for example MCP bearer) to avoid WorkOS API churn.
   */
  refreshReconcileTtl?: boolean;
};

function isWorkosMembershipApiEnabled() {
  if (
    !isLiveWorkosApiKey({
      workosEnabled: env.WORKOS_ENABLED,
      apiKey: env.WORKOS_API_KEY,
    })
  ) {
    return false;
  }

  return getWorkosServerClient() !== null;
}

async function readLastMembershipReconcileAt(
  database: DatabaseClient,
  workosUserId: string,
): Promise<Date | null> {
  const [user] = await database
    .select({ workosMembershipsReconciledAt: schema.users.workosMembershipsReconciledAt })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, workosUserId))
    .limit(1);

  return user?.workosMembershipsReconciledAt ?? null;
}

async function markMembershipsReconciled(database: DatabaseClient, workosUserId: string) {
  await database
    .update(schema.users)
    .set({ workosMembershipsReconciledAt: new Date() })
    .where(eq(schema.users.workosUserId, workosUserId));
}

async function listActiveWorkosMembershipsForUser(input: {
  workosUserId: string;
  workosOrganizationId?: string;
}): Promise<OrganizationMembership[]> {
  const workos = getWorkosServerClient();
  if (!workos) {
    return [];
  }

  if (input.workosOrganizationId) {
    const page = await workos.userManagement.listOrganizationMemberships({
      userId: input.workosUserId,
      organizationId: input.workosOrganizationId,
      statuses: ["active"],
    });
    return page.autoPagination();
  }

  const page = await workos.userManagement.listOrganizationMemberships({
    userId: input.workosUserId,
    statuses: ["active"],
  });
  return page.autoPagination();
}

async function findLocalOrganizationMembership(input: {
  database: DatabaseClient;
  workosUserId: string;
  email: string;
  workosOrganizationId: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();

  const membershipSelection = {
    workosMembershipId: schema.organizationMemberships.workosMembershipId,
    role: schema.organizationMemberships.role,
  };

  const [byWorkosUserId] = await input.database
    .select(membershipSelection)
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, input.workosUserId),
        eq(schema.organizations.workosOrganizationId, input.workosOrganizationId),
      ),
    )
    .limit(1);

  if (byWorkosUserId) {
    return byWorkosUserId;
  }

  const [byEmail] = await input.database
    .select(membershipSelection)
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.users.email, normalizedEmail),
        eq(schema.organizations.workosOrganizationId, input.workosOrganizationId),
      ),
    )
    .limit(1);

  return byEmail ?? null;
}

async function findPendingLocalMembershipRole(input: {
  database: DatabaseClient;
  workosUserId: string;
  email: string;
  workosOrganizationId: string;
}): Promise<OrganizationMembershipRole | null> {
  const membership = await findLocalOrganizationMembership(input);
  if (!membership) {
    return null;
  }

  const isPending =
    membership.workosMembershipId == null ||
    membership.workosMembershipId === REPLACING_WORKOS_MEMBERSHIP_ID;

  return isPending ? membership.role : null;
}

async function ensureLocalOrganizationForWorkosMembership(
  database: DatabaseClient,
  membership: OrganizationMembership,
) {
  const workos = getWorkosServerClient();
  if (!workos) {
    return null;
  }

  const [existing] = await database
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, membership.organizationId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const remoteOrganization = await workos.organizations.getOrganization(membership.organizationId);

  return syncWorkosOrganization(database, {
    workosOrganizationId: remoteOrganization.id,
    name: remoteOrganization.name,
  });
}

export async function reconcileWorkosMembershipsForUser(
  database: DatabaseClient,
  input: ReconcileWorkosMembershipsInput,
): Promise<ReconcileWorkosMembershipsResult> {
  if (isInvitedPlaceholderWorkosUserId(input.workosUserId)) {
    return { status: "skipped" };
  }

  if (!isWorkosMembershipApiEnabled()) {
    return { status: "skipped" };
  }

  const lastReconciledAt = await readLastMembershipReconcileAt(database, input.workosUserId);
  if (
    !input.force &&
    lastReconciledAt &&
    Date.now() - lastReconciledAt.getTime() < WORKOS_MEMBERSHIP_RECONCILE_TTL_MS
  ) {
    return { status: "skipped" };
  }

  let remoteMemberships: OrganizationMembership[];

  try {
    remoteMemberships = await listActiveWorkosMembershipsForUser({
      workosUserId: input.workosUserId,
      workosOrganizationId: input.workosOrganizationId,
    });
  } catch (error) {
    logger.warn("workos_membership_lookup_failed", {
      workosUserId: input.workosUserId,
      workosOrganizationId: input.workosOrganizationId,
      errorName: error instanceof Error ? error.name : "unknown_error",
    });

    return {
      status: "lookup_failed",
      lastReconciledAt,
    };
  }

  if (input.email) {
    await promoteInvitedPlaceholderUser(database, {
      email: input.email,
      workosUserId: input.workosUserId,
    });
  }

  await syncWorkosUser(database, {
    workosUserId: input.workosUserId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    avatarUrl: input.avatarUrl,
  });

  const authoritativeMembershipIds = new Set<string>();
  let added = 0;
  let updated = 0;

  for (const remoteMembership of remoteMemberships) {
    if (remoteMembership.status !== "active") {
      continue;
    }

    let role = membershipRoleFromUnknownRoleField(remoteMembership.role);
    if (!role) {
      role = await findPendingLocalMembershipRole({
        database,
        workosUserId: input.workosUserId,
        email: input.email,
        workosOrganizationId: remoteMembership.organizationId,
      });

      if (!role) {
        logger.warn("workos_membership_unknown_role_slug", {
          workosUserId: input.workosUserId,
          workosMembershipId: remoteMembership.id,
          workosOrganizationId: remoteMembership.organizationId,
        });
        continue;
      }

      logger.info("workos_membership_linked_pending_invite_with_local_role", {
        workosUserId: input.workosUserId,
        workosMembershipId: remoteMembership.id,
        workosOrganizationId: remoteMembership.organizationId,
        role,
      });
    }

    authoritativeMembershipIds.add(remoteMembership.id);

    const organization = await ensureLocalOrganizationForWorkosMembership(
      database,
      remoteMembership,
    );
    if (!organization) {
      continue;
    }

    const existingMembership = await findLocalOrganizationMembership({
      database,
      workosUserId: input.workosUserId,
      email: input.email,
      workosOrganizationId: remoteMembership.organizationId,
    });

    await syncWorkosIdentity(database, {
      user: {
        workosUserId: input.workosUserId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        avatarUrl: input.avatarUrl,
      },
      organization: {
        workosOrganizationId: remoteMembership.organizationId,
        name: organization.name,
        slug: organization.slug ?? undefined,
      },
      membership: {
        workosMembershipId: remoteMembership.id,
        role,
      },
    });

    if (!existingMembership) {
      added += 1;
      continue;
    }

    if (
      existingMembership.workosMembershipId !== remoteMembership.id ||
      existingMembership.role !== role
    ) {
      updated += 1;
    }
  }

  const [localUser] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, input.workosUserId))
    .limit(1);

  if (!localUser) {
    if (!input.workosOrganizationId || input.refreshReconcileTtl) {
      await markMembershipsReconciled(database, input.workosUserId);
    }
    return { status: "reconciled", added, updated, revoked: 0 };
  }

  const localMembershipConditions = [
    eq(schema.organizationMemberships.userId, localUser.id),
    isNotNull(schema.organizationMemberships.workosMembershipId),
    ne(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
  ];

  if (input.workosOrganizationId) {
    localMembershipConditions.push(
      eq(schema.organizations.workosOrganizationId, input.workosOrganizationId),
    );
  }

  const localActiveMemberships = await database
    .select({
      workosMembershipId: schema.organizationMemberships.workosMembershipId,
      workosOrganizationId: schema.organizations.workosOrganizationId,
    })
    .from(schema.organizationMemberships)
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(and(...localMembershipConditions));

  let revoked = 0;

  for (const localMembership of localActiveMemberships) {
    const workosMembershipId = localMembership.workosMembershipId;
    if (!workosMembershipId || authoritativeMembershipIds.has(workosMembershipId)) {
      continue;
    }

    const result = await revokeOrganizationMembershipAccess(database, {
      workosMembershipId,
      workosOrganizationId: localMembership.workosOrganizationId,
      workosUserId: input.workosUserId,
    });

    if (result.organizationMembershipsDeleted > 0) {
      revoked += 1;
    }
  }

  // Scoped reconcile only checks one organization. Do not refresh the global TTL unless
  // explicitly requested, or session bootstrap may skip full membership revocation for
  // other workspaces.
  if (!input.workosOrganizationId || input.refreshReconcileTtl) {
    await markMembershipsReconciled(database, input.workosUserId);
  }

  return {
    status: "reconciled",
    added,
    updated,
    revoked,
  };
}

export function isMembershipReconcileFresh(lastReconciledAt: Date | null) {
  if (!lastReconciledAt) {
    return false;
  }

  return Date.now() - lastReconciledAt.getTime() < WORKOS_MEMBERSHIP_RECONCILE_TTL_MS;
}

export async function assertWorkosMembershipReconcileAllowsAccess(
  database: DatabaseClient,
  workosUserId: string,
  reconcileResult: ReconcileWorkosMembershipsResult,
) {
  if (reconcileResult.status !== "lookup_failed") {
    return;
  }

  const lastReconciledAt =
    reconcileResult.lastReconciledAt ??
    (await readLastMembershipReconcileAt(database, workosUserId));

  if (!isMembershipReconcileFresh(lastReconciledAt)) {
    throw new Error("workos_membership_lookup_failed");
  }
}
