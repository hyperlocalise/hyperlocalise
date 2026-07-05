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

export type AppAuthContext = ApiAuthContext & {
  sessionUser: NonNullable<Awaited<ReturnType<typeof withAuth>>["user"]>;
};

type RequireAppAuthContextOptions = {
  organizationSlug?: string;
  ignoreStoredActiveOrganization?: boolean;
  staleOrganizationRedirectSearch?: string;
};

export async function requireAppAuthContext(options: RequireAppAuthContextOptions = {}) {
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
      return redirectForMissingOrganizationAccess({
        email: sessionUser.email,
        workosUserId: sessionUser.id,
      });
    }

    if (error instanceof Error && error.message === "workos_membership_lookup_failed") {
      redirect("/auth/access-denied?reason=workos-membership-lookup-failed");
    }

    throw error;
  }

  if (!auth) {
    return redirectForMissingOrganizationAccess({
      email: sessionUser.email,
      workosUserId: sessionUser.id,
    });
  }

  return {
    ...auth,
    sessionUser,
  } satisfies AppAuthContext;
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
