"use server";

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
import { refreshSession } from "@workos-inc/authkit-nextjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import {
  clearStoredActiveOrganizationSlug,
  getStoredActiveOrganizationSlug,
  setStoredActiveOrganizationSlug,
} from "@/lib/workos/active-organization";
import { withAuth } from "@/lib/workos/server-auth";
import { switchableWorkspaces } from "@/lib/workos/switchable-workspaces";

const logger = createLogger("leave-workspace-action");
const signOutToDashboard = "/auth/sign-out?returnTo=%2Fdashboard";

export type FinishLeavingWorkspaceResult = { redirectTo: string };

/**
 * Runs after the person has left `leftOrganizationSlug`, and says where to go next. The
 * dialog loads that page in full: a redirect here would reach its mutation as an error.
 *
 * AuthKit renews a session for the workspace it was issued for. A session issued for the
 * workspace just left is moved to the next workspace, or ended when none is left, so it
 * is not refused, and the person signed out, a few minutes later.
 */
export async function finishLeavingWorkspaceAction(
  leftOrganizationSlug: string,
): Promise<FinishLeavingWorkspaceResult> {
  const session = await withAuth({ ensureSignedIn: true });
  if (!session.user) {
    redirect("/auth/sign-in");
  }

  const [leftOrganization] = await db
    .select({ workosOrganizationId: schema.organizations.workosOrganizationId })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, leftOrganizationSlug))
    .limit(1);
  const sessionIsForLeftWorkspace =
    Boolean(session.organizationId) &&
    session.organizationId === leftOrganization?.workosOrganizationId;

  let organizations: NonNullable<
    Awaited<ReturnType<typeof resolveApiAuthContextFromSession>>
  >["organizations"] = [];
  try {
    organizations = (await resolveApiAuthContextFromSession({ session }))?.organizations ?? [];
  } catch (error) {
    // Unknown, not none: the dashboard sorts out where the person belongs. A session
    // issued for the workspace just left would be refused at its next renewal, so it ends now.
    logger.warn("leave_workspace_memberships_unavailable", {
      workosUserId: session.user.id,
      error,
    });
    return { redirectTo: sessionIsForLeftWorkspace ? signOutToDashboard : "/dashboard" };
  }
  const remaining = switchableWorkspaces(organizations).filter(
    (organization) => organization.slug !== leftOrganizationSlug,
  );
  const storedSlug = await getStoredActiveOrganizationSlug();
  // The remembered workspace, then the one the session was issued for, then any.
  const next =
    remaining.find((organization) => organization.slug === storedSlug) ??
    remaining.find(
      (organization) => organization.workosOrganizationId === session.organizationId,
    ) ??
    remaining[0] ??
    null;

  if (!next) {
    await clearStoredActiveOrganizationSlug();
    // Signing in again starts a session with no workspace, which onboarding then fills.
    return { redirectTo: sessionIsForLeftWorkspace ? signOutToDashboard : "/dashboard" };
  }

  await setStoredActiveOrganizationSlug(next.slug);
  if (sessionIsForLeftWorkspace) {
    try {
      await refreshSession({ organizationId: next.workosOrganizationId });
    } catch (error) {
      logger.warn("leave_workspace_session_switch_failed", {
        workosUserId: session.user.id,
        error,
      });
    }
  }
  return { redirectTo: `/org/${next.slug}/dashboard` };
}
