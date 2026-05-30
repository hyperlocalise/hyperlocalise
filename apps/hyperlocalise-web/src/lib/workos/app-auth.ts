import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

import type { OrganizationCapability } from "@/api/auth/policy";
import { hasCapability } from "@/api/auth/policy";
import type { ApiAuthContext } from "@/api/auth/workos";
import {
  OrganizationSlugUnresolvableError,
  resolveApiAuthContextFromSession,
  StaleOrganizationSlugError,
} from "@/api/auth/workos-session";
import { db } from "@/lib/database";
import { listLocalOrgWorkspacesForUser } from "@/lib/organizations/migrate-local-org-to-workos";
import {
  getStoredActiveOrganizationSlug,
  setStoredActiveOrganizationSlug,
} from "@/lib/workos/active-organization";

export type AppAuthContext = ApiAuthContext & {
  sessionUser: NonNullable<Awaited<ReturnType<typeof withAuth>>["user"]>;
};

export async function requireAppAuthContext(
  options: { organizationSlug?: string; ignoreStoredActiveOrganization?: boolean } = {},
) {
  const session = await withAuth({ ensureSignedIn: true });

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
      await setStoredActiveOrganizationSlug(error.currentSlug);
      redirect(`/org/${error.currentSlug}/dashboard`);
    }

    if (error instanceof OrganizationSlugUnresolvableError) {
      redirect("/auth/select-organization");
    }

    if (error instanceof Error && error.message === "archived_organization_access") {
      redirect("/auth/access-denied?reason=workspace-archived");
    }

    if (error instanceof Error && error.message === "organization_access_denied") {
      // Temporary: legacy local workspaces can exist while WorkOS membership is still empty.
      let pendingLocalOrgWorkspaces: Awaited<ReturnType<typeof listLocalOrgWorkspacesForUser>> = [];

      try {
        pendingLocalOrgWorkspaces = await listLocalOrgWorkspacesForUser(db, session.user.id);
      } catch {
        // Fall through to access denied if the legacy workspace lookup fails.
      }

      if (pendingLocalOrgWorkspaces.length > 0) {
        redirect("/auth/upgrade-workspace");
      }

      redirect("/auth/access-denied?reason=organization-access-denied");
    }

    if (error instanceof Error && error.message === "workos_membership_lookup_failed") {
      redirect("/auth/access-denied?reason=workos-membership-lookup-failed");
    }

    throw error;
  }

  if (!auth) {
    const pendingLocalOrgWorkspaces = await listLocalOrgWorkspacesForUser(db, session.user.id);
    if (pendingLocalOrgWorkspaces.length > 0) {
      redirect("/auth/upgrade-workspace");
    }

    redirect("/auth/onboarding");
  }

  return {
    ...auth,
    sessionUser: session.user,
  } satisfies AppAuthContext;
}

export async function requireAppCapability(
  capability: OrganizationCapability,
  options: { organizationSlug?: string; ignoreStoredActiveOrganization?: boolean } = {},
) {
  const auth = await requireAppAuthContext(options);

  if (!hasCapability(auth.membership.role, capability)) {
    redirect("/auth/access-denied?reason=insufficient-permissions");
  }

  return auth;
}

export async function getDefaultOrganizationDashboardPath() {
  const auth = await requireAppAuthContext();
  const organizationSlug = auth.activeOrganization.slug;

  if (!organizationSlug) {
    redirect("/auth/access-denied?reason=missing-org-slug");
  }

  return `/org/${organizationSlug}/dashboard`;
}
