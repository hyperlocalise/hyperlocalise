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
import { withAuth } from "@/lib/workos/server-auth";

import type { OrganizationCapability } from "@/api/auth/policy";
import { hasCapability } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import {
  OrganizationSlugUnresolvableError,
  resolveApiAuthContextFromSession,
  StaleOrganizationSlugError,
} from "@/api/auth/workos-session";
import {
  getStoredActiveOrganizationSlug,
  setStoredActiveOrganizationSlug,
} from "@/lib/workos/active-organization";
import { redirectForMissingOrganizationAccess } from "@/lib/workos/missing-organization-access";
import { hasPendingInvitationToOrganization } from "@/lib/workos/pending-invitations";

export type AppAuthContext = ApiAuthContext & {
  sessionUser: NonNullable<Awaited<ReturnType<typeof withAuth>>["user"]>;
};

type RequireAppAuthContextOptions = {
  organizationSlug?: string;
  ignoreStoredActiveOrganization?: boolean;
  staleOrganizationRedirectSearch?: string;
};

export async function requireAppAuthContext(
  options: RequireAppAuthContextOptions = {},
): Promise<AppAuthContext> {
  const result = await resolveAppAuthContext(options, false);
  if (!result.auth) {
    return redirectForMissingOrganizationAccess({
      email: result.sessionUser.email,
      workosUserId: result.sessionUser.id,
      emailVerified: result.sessionUser.emailVerified,
    });
  }
  return result.auth;
}

/**
 * For the pages that let someone with no workspace in, the picker (to accept an
 * invitation) and Create workspace: `auth` is null instead of a redirect, which would send
 * them straight back to these pages.
 */
export async function getAppAuthContextAllowingNoWorkspace(
  options: Omit<RequireAppAuthContextOptions, "organizationSlug"> = {},
) {
  return resolveAppAuthContext(options, true);
}

async function resolveAppAuthContext(
  options: RequireAppAuthContextOptions,
  allowNoWorkspace: boolean,
): Promise<{ sessionUser: AppAuthContext["sessionUser"]; auth: AppAuthContext | null }> {
  const session = await withAuth({ ensureSignedIn: true });

  if (!session.user) {
    redirect("/auth/sign-in");
  }

  const sessionUser = session.user;

  let auth: ApiAuthContext | null;
  try {
    const shouldReadStoredOrganizationSlug =
      !options.organizationSlug && !options.ignoreStoredActiveOrganization;
    const storedOrganizationSlug = shouldReadStoredOrganizationSlug
      ? ((await getStoredActiveOrganizationSlug()) ?? undefined)
      : undefined;

    auth = await resolveApiAuthContextFromSession({
      organizationSlug: options.organizationSlug ?? storedOrganizationSlug,
      session,
    });
  } catch (error) {
    if (error instanceof StaleOrganizationSlugError) {
      // A workspace the person is invited to but has not joined yet: offer the invitation
      // instead of sending them to another workspace.
      if (
        options.organizationSlug &&
        sessionUser.emailVerified &&
        (await hasPendingInvitationToOrganization(sessionUser.id, options.organizationSlug))
      ) {
        redirect("/auth/select-organization");
      }

      await setStoredActiveOrganizationSlug(error.currentSlug);
      redirect(
        `/org/${error.currentSlug}/dashboard${options.staleOrganizationRedirectSearch ?? ""}`,
      );
    }

    if (error instanceof OrganizationSlugUnresolvableError) {
      redirect("/auth/select-organization");
    }

    if (error instanceof Error && error.message === "archived_organization_access") {
      redirect("/auth/access-denied?reason=workspace-archived");
    }

    if (error instanceof Error && error.message === "organization_access_denied") {
      if (allowNoWorkspace) {
        return { sessionUser, auth: null };
      }
      return redirectForMissingOrganizationAccess({
        email: sessionUser.email,
        workosUserId: sessionUser.id,
        emailVerified: sessionUser.emailVerified,
      });
    }

    if (error instanceof Error && error.message === "workos_membership_lookup_failed") {
      redirect("/auth/access-denied?reason=workos-membership-lookup-failed");
    }

    throw error;
  }

  if (!auth) {
    return { sessionUser, auth: null };
  }

  return {
    sessionUser,
    auth: {
      ...auth,
      sessionUser,
    } satisfies AppAuthContext,
  };
}

export async function requireAppCapability(
  capability: OrganizationCapability,
  options: RequireAppAuthContextOptions = {},
) {
  const auth = await requireAppAuthContext(options);

  if (!hasCapability(auth.membership.role, capability)) {
    redirect("/auth/access-denied?reason=insufficient-permissions");
  }

  return auth;
}

export async function getDefaultOrganizationDashboardPath(
  options: RequireAppAuthContextOptions = {},
) {
  const auth = await requireAppAuthContext(options);
  const organizationSlug = auth.activeOrganization.slug;

  if (!organizationSlug) {
    redirect("/auth/access-denied?reason=missing-org-slug");
  }

  return `/org/${organizationSlug}/dashboard`;
}
