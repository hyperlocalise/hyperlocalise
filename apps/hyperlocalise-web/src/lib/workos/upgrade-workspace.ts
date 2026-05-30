import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db } from "@/lib/database";
import {
  listLocalOrgWorkspacesForUser,
  type LocalOrgWorkspaceSummary,
} from "@/lib/organizations/migrate-local-org-to-workos";

function getDashboardPath(slug: string | null | undefined) {
  if (!slug) {
    return "/auth/access-denied?reason=missing-org-slug";
  }

  return `/org/${slug}/dashboard`;
}

export type UpgradeWorkspaceContext = {
  sessionUser: NonNullable<Awaited<ReturnType<typeof withAuth>>["user"]>;
  workspaces: LocalOrgWorkspaceSummary[];
};

export async function loadUpgradeWorkspaceContext(): Promise<UpgradeWorkspaceContext> {
  const session = await withAuth({ ensureSignedIn: true });

  if (!session.user) {
    redirect("/auth/sign-in?returnTo=/auth/upgrade-workspace");
  }

  const workspaces = await listLocalOrgWorkspacesForUser(db, session.user.id);

  if (workspaces.length === 0) {
    const auth = await resolveApiAuthContextFromSession({ session });
    if (auth?.activeOrganization.slug) {
      redirect(getDashboardPath(auth.activeOrganization.slug));
    }

    redirect("/auth/onboarding");
  }

  return {
    sessionUser: session.user,
    workspaces,
  };
}

export function hasPendingLocalOrgWorkspaceUpgrade(workspaces: LocalOrgWorkspaceSummary[]) {
  return workspaces.length > 0;
}
