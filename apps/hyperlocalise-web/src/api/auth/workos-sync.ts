import { and, eq, inArray, isNull, like, sql } from "drizzle-orm";

import * as schema from "@/lib/database/schema";
import type { OrganizationMembershipRole } from "@/lib/database/types";

import type { DatabaseClient } from "@/lib/database";
import {
  INVITED_WORKOS_USER_ID_PREFIX,
  isInvitedPlaceholderWorkosUserId,
  REPLACING_WORKOS_MEMBERSHIP_ID,
} from "@/lib/workos/constants";

export type WorkosUserSync = {
  workosUserId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
};

export type WorkosOrganizationSync = {
  workosOrganizationId: string;
  name: string;
  slug?: string;
};

export type WorkosMembershipSync = {
  workosMembershipId?: string;
  role: OrganizationMembershipRole;
};

export type WorkosIdentitySyncInput = {
  user: WorkosUserSync;
  organization: WorkosOrganizationSync;
  membership: WorkosMembershipSync;
};

export type WorkosSyncResult = {
  user: {
    id: string;
    workosUserId: string;
    email: string;
  };
  organization: {
    id: string;
    workosOrganizationId: string;
    name: string;
    slug: string | null;
  };
  membership: {
    role: OrganizationMembershipRole;
    workosMembershipId: string | null;
  };
};

export async function syncWorkosIdentity(
  database: DatabaseClient,
  identity: WorkosIdentitySyncInput,
): Promise<WorkosSyncResult> {
  return database.transaction(async (tx) => {
    const now = new Date();

    const [user] = await tx
      .insert(schema.users)
      .values({
        workosUserId: identity.user.workosUserId,
        email: identity.user.email,
        firstName: identity.user.firstName ?? null,
        lastName: identity.user.lastName ?? null,
        avatarUrl: identity.user.avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: schema.users.workosUserId,
        set: {
          email: identity.user.email,
          firstName: identity.user.firstName ?? null,
          lastName: identity.user.lastName ?? null,
          avatarUrl: identity.user.avatarUrl ?? null,
          updatedAt: now,
        },
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        workosUserId: schema.users.workosUserId,
      });

    const [organization] = await tx
      .insert(schema.organizations)
      .values({
        workosOrganizationId: identity.organization.workosOrganizationId,
        name: identity.organization.name,
        slug: identity.organization.slug ?? null,
      })
      .onConflictDoUpdate({
        target: schema.organizations.workosOrganizationId,
        set: {
          name: identity.organization.name,
          slug: identity.organization.slug ?? null,
          updatedAt: now,
        },
      })
      .returning({
        id: schema.organizations.id,
        name: schema.organizations.name,
        slug: schema.organizations.slug,
        workosOrganizationId: schema.organizations.workosOrganizationId,
      });

    const [membership] = await tx
      .insert(schema.organizationMemberships)
      .values({
        organizationId: organization.id,
        userId: user.id,
        workosMembershipId: identity.membership.workosMembershipId ?? null,
        role: identity.membership.role,
      })
      .onConflictDoUpdate({
        target: [
          schema.organizationMemberships.organizationId,
          schema.organizationMemberships.userId,
        ],
        set: {
          workosMembershipId: identity.membership.workosMembershipId ?? null,
          role: identity.membership.role,
          updatedAt: now,
        },
      })
      .returning({
        role: schema.organizationMemberships.role,
        workosMembershipId: schema.organizationMemberships.workosMembershipId,
      });

    return {
      user,
      organization,
      membership,
    };
  });
}

export async function promoteInvitedPlaceholderUser(
  database: DatabaseClient,
  input: { email: string; workosUserId: string },
): Promise<boolean> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const [invitedUser] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.email, normalizedEmail),
        like(schema.users.workosUserId, `${INVITED_WORKOS_USER_ID_PREFIX}%`),
      ),
    )
    .limit(1);

  if (!invitedUser) {
    return false;
  }

  await database
    .update(schema.users)
    .set({
      workosUserId: input.workosUserId,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, invitedUser.id));

  return true;
}

export async function syncWorkosUser(
  database: DatabaseClient,
  user: WorkosUserSync,
): Promise<{ id: string; workosUserId: string; email: string }> {
  const now = new Date();

  const [createdUser] = await database
    .insert(schema.users)
    .values({
      workosUserId: user.workosUserId,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      avatarUrl: user.avatarUrl ?? null,
    })
    .onConflictDoUpdate({
      target: schema.users.workosUserId,
      set: {
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        avatarUrl: user.avatarUrl ?? null,
        updatedAt: now,
      },
    })
    .returning({
      id: schema.users.id,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
    });

  return createdUser;
}

export async function syncWorkosOrganization(
  database: DatabaseClient,
  organization: WorkosOrganizationSync,
): Promise<{ id: string; workosOrganizationId: string; name: string; slug: string | null }> {
  const now = new Date();

  const [createdOrganization] = await database
    .insert(schema.organizations)
    .values({
      workosOrganizationId: organization.workosOrganizationId,
      name: organization.name,
      slug: organization.slug ?? null,
    })
    .onConflictDoUpdate({
      target: schema.organizations.workosOrganizationId,
      set: {
        name: organization.name,
        slug: organization.slug ?? null,
        updatedAt: now,
      },
    })
    .returning({
      id: schema.organizations.id,
      workosOrganizationId: schema.organizations.workosOrganizationId,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
    });

  return createdOrganization;
}

type RevocationTarget = {
  organizationId: string;
  userId: string;
};

export type RemoveWorkosMembershipResult = {
  organizationMembershipsDeleted: number;
  target: RevocationTarget | null;
};

export async function markPendingMembershipReplacingInvitation(
  database: DatabaseClient,
  membershipId: string,
): Promise<boolean> {
  const result = await database
    .update(schema.organizationMemberships)
    .set({ workosMembershipId: REPLACING_WORKOS_MEMBERSHIP_ID })
    .where(
      and(
        eq(schema.organizationMemberships.id, membershipId),
        isNull(schema.organizationMemberships.workosMembershipId),
      ),
    );

  return Number(result.rowCount ?? 0) > 0;
}

export async function clearPendingMembershipReplacingInvitation(
  database: DatabaseClient,
  membershipId: string,
): Promise<void> {
  await database
    .update(schema.organizationMemberships)
    .set({ workosMembershipId: null })
    .where(
      and(
        eq(schema.organizationMemberships.id, membershipId),
        eq(schema.organizationMemberships.workosMembershipId, REPLACING_WORKOS_MEMBERSHIP_ID),
      ),
    );
}

export async function removePendingOrganizationMembershipForInvite(
  database: DatabaseClient,
  input: { workosOrganizationId: string; email: string },
): Promise<number> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const [organization] = await database
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, input.workosOrganizationId))
    .limit(1);

  if (!organization) {
    return 0;
  }

  const [user] = await database
    .select({
      id: schema.users.id,
      workosUserId: schema.users.workosUserId,
    })
    .from(schema.users)
    .where(eq(schema.users.email, normalizedEmail))
    .limit(1);

  if (!user) {
    return 0;
  }

  const result = await database
    .delete(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organization.id),
        eq(schema.organizationMemberships.userId, user.id),
        isNull(schema.organizationMemberships.workosMembershipId),
      ),
    );

  if (isInvitedPlaceholderWorkosUserId(user.workosUserId) && Number(result.rowCount ?? 0) > 0) {
    await database.delete(schema.users).where(
      and(
        eq(schema.users.id, user.id),
        like(schema.users.workosUserId, `${INVITED_WORKOS_USER_ID_PREFIX}%`),
        sql`not exists (
          select 1
          from ${schema.organizationMemberships}
          where ${schema.organizationMemberships.userId} = ${schema.users.id}
        )`,
      ),
    );
  }

  return Number(result.rowCount ?? 0);
}

export async function removeWorkosMembership(
  database: DatabaseClient,
  input: {
    workosMembershipId?: string;
    workosOrganizationId?: string;
    workosUserId?: string;
  },
): Promise<RemoveWorkosMembershipResult> {
  if (input.workosMembershipId) {
    const deleted = await database
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.workosMembershipId, input.workosMembershipId))
      .returning({
        organizationId: schema.organizationMemberships.organizationId,
        userId: schema.organizationMemberships.userId,
      });

    if (!deleted[0]) {
      return { organizationMembershipsDeleted: 0, target: null };
    }

    return {
      organizationMembershipsDeleted: deleted.length,
      target: deleted[0],
    };
  }

  if (!input.workosOrganizationId || !input.workosUserId) {
    return { organizationMembershipsDeleted: 0, target: null };
  }

  const [organization] = await database
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, input.workosOrganizationId))
    .limit(1);

  const [user] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, input.workosUserId))
    .limit(1);

  if (!organization || !user) {
    return { organizationMembershipsDeleted: 0, target: null };
  }

  const target: RevocationTarget = {
    organizationId: organization.id,
    userId: user.id,
  };

  const result = await database
    .delete(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organization.id),
        eq(schema.organizationMemberships.userId, user.id),
      ),
    );

  const organizationMembershipsDeleted = Number(result.rowCount ?? 0);
  if (organizationMembershipsDeleted === 0) {
    return { organizationMembershipsDeleted: 0, target: null };
  }

  return { organizationMembershipsDeleted, target };
}

export type RevokeOrganizationMembershipAccessResult = {
  organizationMembershipsDeleted: number;
  teamMembershipsDeleted: number;
  mcpSessionsDeleted: number;
  apiKeysRevoked: number;
};

async function resolveRevocationTarget(
  database: DatabaseClient,
  input: {
    workosMembershipId?: string;
    workosOrganizationId?: string;
    workosUserId?: string;
  },
): Promise<{ organizationId: string; userId: string } | null> {
  if (input.workosMembershipId) {
    const [membership] = await database
      .select({
        organizationId: schema.organizationMemberships.organizationId,
        userId: schema.organizationMemberships.userId,
      })
      .from(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.workosMembershipId, input.workosMembershipId))
      .limit(1);

    if (membership) {
      return membership;
    }

    return null;
  }

  if (!input.workosOrganizationId || !input.workosUserId) {
    return null;
  }

  const [orgRow] = await database
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.workosOrganizationId, input.workosOrganizationId))
    .limit(1);

  const [userRow] = await database
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.workosUserId, input.workosUserId))
    .limit(1);

  const organization = orgRow;
  const user = userRow;

  if (!organization || !user) {
    return null;
  }

  return {
    organizationId: organization.id,
    userId: user.id,
  };
}

async function revokeOrganizationApiKeysForUser(
  database: DatabaseClient,
  target: RevocationTarget,
): Promise<Pick<RevokeOrganizationMembershipAccessResult, "apiKeysRevoked">> {
  const apiKeysRevoked = await database
    .update(schema.organizationApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.organizationApiKeys.organizationId, target.organizationId),
        eq(schema.organizationApiKeys.createdByUserId, target.userId),
        isNull(schema.organizationApiKeys.revokedAt),
      ),
    );

  return {
    apiKeysRevoked: Number(apiKeysRevoked.rowCount ?? 0),
  };
}

async function deleteTeamMembershipsAndMcpSessions(
  database: DatabaseClient,
  target: RevocationTarget,
): Promise<
  Pick<RevokeOrganizationMembershipAccessResult, "teamMembershipsDeleted" | "mcpSessionsDeleted">
> {
  const teamIds = database
    .select({ id: schema.teams.id })
    .from(schema.teams)
    .where(eq(schema.teams.organizationId, target.organizationId));

  const teamMembershipsDeleted = await database
    .delete(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, target.userId),
        inArray(schema.teamMemberships.teamId, teamIds),
      ),
    );

  const mcpSessionsDeleted = await database
    .delete(schema.mcpSessions)
    .where(
      and(
        eq(schema.mcpSessions.userId, target.userId),
        eq(schema.mcpSessions.organizationId, target.organizationId),
      ),
    );

  return {
    teamMembershipsDeleted: Number(teamMembershipsDeleted.rowCount ?? 0),
    mcpSessionsDeleted: Number(mcpSessionsDeleted.rowCount ?? 0),
  };
}

async function revokeMembershipAccessForTarget(
  database: DatabaseClient,
  target: RevocationTarget,
): Promise<RevokeOrganizationMembershipAccessResult> {
  const organizationMembershipsDeleted = await database
    .delete(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, target.organizationId),
        eq(schema.organizationMemberships.userId, target.userId),
      ),
    );

  const dependentDeletes = await deleteTeamMembershipsAndMcpSessions(database, target);
  const apiKeyRevocation = await revokeOrganizationApiKeysForUser(database, target);

  return {
    organizationMembershipsDeleted: Number(organizationMembershipsDeleted.rowCount ?? 0),
    ...dependentDeletes,
    ...apiKeyRevocation,
  };
}

export async function revokeOrganizationMembershipAccess(
  database: DatabaseClient,
  input: {
    workosMembershipId?: string;
    workosOrganizationId?: string;
    workosUserId?: string;
  },
): Promise<RevokeOrganizationMembershipAccessResult> {
  const target = await resolveRevocationTarget(database, input);

  if (!target) {
    return {
      organizationMembershipsDeleted: 0,
      teamMembershipsDeleted: 0,
      mcpSessionsDeleted: 0,
      apiKeysRevoked: 0,
    };
  }

  return revokeMembershipAccessForTarget(database, target);
}
