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
import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { reconcileWorkosMembershipsForUser } from "@/api/auth/workos-membership-reconcile";
import { promoteInvitedPlaceholderUser } from "@/api/auth/workos-sync";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { isReplacingWorkosMembershipSql } from "@/lib/workos/constants";

const logger = createLogger("missing-organization-access");

const pendingMembershipConditions = [
  eq(schema.organizations.lifecycleStatus, "active"),
  or(
    isNull(schema.organizationMemberships.workosMembershipId),
    isReplacingWorkosMembershipSql(schema.organizationMemberships.workosMembershipId),
  ),
];

export async function hasPendingOrganizationMembership(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  const [membership] = await db
    .select({ id: schema.organizationMemberships.id })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(and(eq(schema.users.email, normalizedEmail), ...pendingMembershipConditions))
    .limit(1);

  return Boolean(membership);
}

export async function hasPendingOrganizationMembershipForWorkosUser(
  workosUserId: string,
): Promise<boolean> {
  const [membership] = await db
    .select({ id: schema.organizationMemberships.id })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(and(eq(schema.users.workosUserId, workosUserId), ...pendingMembershipConditions))
    .limit(1);

  return Boolean(membership);
}

type RedirectForMissingOrganizationAccessInput = {
  email: string;
  workosUserId?: string;
  emailVerified?: boolean;
};

export async function redirectForMissingOrganizationAccess(
  input: RedirectForMissingOrganizationAccessInput | string,
): Promise<never> {
  const { email, workosUserId, emailVerified } =
    typeof input === "string"
      ? { email: input, workosUserId: undefined, emailVerified: false }
      : input;

  if (await hasPendingOrganizationMembership(email)) {
    if (workosUserId) {
      await promoteInvitedPlaceholderUser(db, {
        email,
        workosUserId,
      });

      const reconcileResult = await reconcileWorkosMembershipsForUser(db, {
        workosUserId,
        email,
        force: true,
      });

      if (!(await hasPendingOrganizationMembership(email))) {
        redirect("/dashboard");
      }

      logger.warn("pending_invite_reconcile_did_not_clear_membership", {
        workosUserId,
        reconcileStatus: reconcileResult.status,
        ...(reconcileResult.status === "reconciled"
          ? {
              added: reconcileResult.added,
              updated: reconcileResult.updated,
              revoked: reconcileResult.revoked,
            }
          : {}),
      });
    }

    // The picker lists a verified person's invitations with Accept, and lets them create
    // a workspace when none can be accepted, such as one being replaced.
    if (workosUserId && emailVerified) {
      redirect("/auth/select-organization");
    }

    redirect("/auth/access-denied?reason=pending-invite");
  }

  redirect("/auth/onboarding");
}
