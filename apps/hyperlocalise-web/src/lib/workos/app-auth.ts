import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

import type { ApiAuthContext } from "@/api/auth/workos";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { getStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";

export type AppAuthContext = ApiAuthContext & {
  sessionUser: NonNullable<Awaited<ReturnType<typeof withAuth>>["user"]>;
};

export async function requireAppAuthContext(options: { organizationSlug?: string } = {}) {
  const session = await withAuth({ ensureSignedIn: true });

  let auth: ApiAuthContext | null;
  try {
    auth = await resolveApiAuthContextFromSession({
      organizationSlug:
        options.organizationSlug ?? (await getStoredActiveOrganizationSlug()) ?? undefined,
      session,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "organization_access_denied") {
      redirect("/auth/access-denied?reason=organization-access-denied");
    }

    throw error;
  }

  if (!auth) {
    redirect("/auth/access-denied?reason=no-memberships");
  }

  return {
    ...auth,
    sessionUser: session.user,
  } satisfies AppAuthContext;
}

export async function getDefaultOrganizationDashboardPath() {
  const auth = await requireAppAuthContext();
  const organizationSlug = auth.activeOrganization.slug;

  if (!organizationSlug) {
    redirect("/auth/access-denied?reason=missing-org-slug");
  }

  return `/org/${organizationSlug}/dashboard`;
}
