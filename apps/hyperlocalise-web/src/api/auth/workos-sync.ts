import { and, eq } from "drizzle-orm";

import * as schema from "@/lib/database/schema";
import type { OrganizationMembershipRole } from "@/lib/database/types";

type DatabaseClient = (typeof import("@/lib/database"))["db"];

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

export async function removeWorkosMembership(
  database: DatabaseClient,
  input: {
    workosMembershipId?: string;
    workosOrganizationId?: string;
    workosUserId?: string;
  },
): Promise<number> {
  if (input.workosMembershipId) {
    const result = await database
      .delete(schema.organizationMemberships)
      .where(eq(schema.organizationMemberships.workosMembershipId, input.workosMembershipId));

    return Number(result.rowCount ?? 0);
  }

  if (!input.workosOrganizationId || !input.workosUserId) {
    return 0;
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
    return 0;
  }

  const result = await database
    .delete(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, organization.id),
        eq(schema.organizationMemberships.userId, user.id),
      ),
    );

  return Number(result.rowCount ?? 0);
}
