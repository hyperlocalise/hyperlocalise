import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { getStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";

export async function requireAppAuthContext(options: { organizationSlug?: string } = {}) {
  await withAuth({ ensureSignedIn: true });

  const auth = await resolveApiAuthContextFromSession({
    organizationSlug:
      options.organizationSlug ?? (await getStoredActiveOrganizationSlug()) ?? undefined,
  });

  if (!auth) {
    redirect("/auth/access-denied?reason=no-memberships");
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
