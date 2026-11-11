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
import { and, eq, isNull } from "drizzle-orm";

import { reconcileWorkosMembershipsForUser } from "@/api/auth/workos-membership-reconcile";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { getWorkosServerClient } from "@/lib/workos/server-client";

const logger = createLogger("pending-invitations");

export type PendingInvitation = {
  organizationName: string;
  organizationSlug: string;
};

export type AcceptInvitationError = {
  code:
    | "invitation_not_found"
    | "email_not_verified"
    | "workos_unavailable"
    | "workos_accept_failed"
    | "membership_not_activated";
};

type InvitedSessionUser = {
  id: string;
  email: string;
  emailVerified?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  profilePictureUrl?: string | null;
};

function pendingMembershipsForWorkosUser(workosUserId: string) {
  return db
    .select({
      organizationName: schema.organizations.name,
      organizationSlug: schema.organizations.slug,
      workosOrganizationId: schema.organizations.workosOrganizationId,
    })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .innerJoin(
      schema.organizations,
      eq(schema.organizationMemberships.organizationId, schema.organizations.id),
    )
    .where(
      and(
        eq(schema.users.workosUserId, workosUserId),
        eq(schema.organizations.lifecycleStatus, "active"),
        // A membership being replaced has an invite change in flight; leave it until it settles.
        isNull(schema.organizationMemberships.workosMembershipId),
      ),
    );
}

/** Workspaces the signed-in person has been invited to and not yet joined. */
export async function listPendingInvitations(workosUserId: string): Promise<PendingInvitation[]> {
  const rows = await pendingMembershipsForWorkosUser(workosUserId);

  return rows.flatMap((row) =>
    row.organizationSlug
      ? [{ organizationName: row.organizationName, organizationSlug: row.organizationSlug }]
      : [],
  );
}

export async function hasPendingInvitationToOrganization(
  workosUserId: string,
  organizationSlug: string,
): Promise<boolean> {
  const rows = await pendingMembershipsForWorkosUser(workosUserId);
  return rows.some((row) => row.organizationSlug === organizationSlug);
}

/**
 * Accepts the signed-in person's WorkOS invitation to a workspace and activates the local
 * membership. WorkOS leaves checking that the invitation belongs to this person to the app,
 * so the invitation's email must be the person's verified email.
 */
export async function acceptPendingInvitation(input: {
  sessionUser: InvitedSessionUser;
  organizationSlug: string;
}): Promise<Result<{ organizationSlug: string }, AcceptInvitationError>> {
  const { sessionUser, organizationSlug } = input;

  if (!sessionUser.emailVerified) {
    return err({ code: "email_not_verified" });
  }

  const pending = (await pendingMembershipsForWorkosUser(sessionUser.id)).find(
    (row) => row.organizationSlug === organizationSlug,
  );
  if (!pending?.workosOrganizationId) {
    return err({ code: "invitation_not_found" });
  }

  const workos = getWorkosServerClient();
  if (!workos) {
    return err({ code: "workos_unavailable" });
  }

  const email = sessionUser.email.trim().toLowerCase();

  try {
    const invitations = await workos.userManagement.listInvitations({
      organizationId: pending.workosOrganizationId,
      email,
    });
    // The newest invitation decides: an older accepted one may be from an earlier membership.
    const [latest] = invitations.data
      .filter((candidate) => candidate.email.trim().toLowerCase() === email)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          Number(b.state === "pending") - Number(a.state === "pending"),
      );
    if (latest?.state === "pending") {
      await workos.userManagement.acceptInvitation(latest.id);
    } else if (latest?.state !== "accepted") {
      // Accepted already (an earlier click, or the email link) falls through to the
      // reconcile below, which picks up the membership WorkOS made.
      return err({ code: "invitation_not_found" });
    }
  } catch (error) {
    logger.warn("accept_invitation_failed", {
      workosUserId: sessionUser.id,
      workosOrganizationId: pending.workosOrganizationId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return err({ code: "workos_accept_failed" });
  }

  await reconcileWorkosMembershipsForUser(db, {
    workosUserId: sessionUser.id,
    email,
    firstName: sessionUser.firstName ?? undefined,
    lastName: sessionUser.lastName ?? undefined,
    avatarUrl: sessionUser.profilePictureUrl ?? undefined,
    force: true,
  });

  if (await hasPendingInvitationToOrganization(sessionUser.id, organizationSlug)) {
    return err({ code: "membership_not_activated" });
  }

  return ok({ organizationSlug });
}
