"use server";

import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { reconcileWorkosMembershipsForUser } from "@/api/auth/workos-membership-reconcile";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db } from "@/lib/database";
import { migrateLocalOrgWorkspacesForUser } from "@/lib/organizations/migrate-local-org-to-workos";
import { setStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";

export type UpgradeWorkspacesActionState = {
  error?: string;
};

function getDashboardPath(slug: string | null | undefined) {
  if (!slug) {
    return "/auth/access-denied?reason=missing-org-slug";
  }

  return `/org/${slug}/dashboard`;
}

export async function upgradeWorkspacesAction(
  _previousState: UpgradeWorkspacesActionState,
): Promise<UpgradeWorkspacesActionState> {
  const session = await withAuth({ ensureSignedIn: true });

  if (!session.user) {
    redirect("/auth/sign-in?returnTo=/auth/upgrade-workspace");
  }

  const migration = await migrateLocalOrgWorkspacesForUser(db, session.user.id);

  if (migration.failed > 0 && migration.migrated === 0) {
    return {
      error:
        "We could not connect your workspace to secure sign-in. Try again in a moment or contact support if this continues.",
    };
  }

  await reconcileWorkosMembershipsForUser(db, {
    workosUserId: session.user.id,
    email: session.user.email,
    firstName: session.user.firstName ?? undefined,
    lastName: session.user.lastName ?? undefined,
    avatarUrl: session.user.profilePictureUrl ?? undefined,
    force: true,
  });

  const auth = await resolveApiAuthContextFromSession({ session });

  if (!auth?.activeOrganization.slug) {
    if (migration.migrated > 0) {
      return {
        error:
          "Your workspace was updated, but we could not open it yet. Refresh this page or choose another organization.",
      };
    }

    redirect("/auth/onboarding");
  }

  await setStoredActiveOrganizationSlug(auth.activeOrganization.slug);
  redirect(getDashboardPath(auth.activeOrganization.slug));
}
