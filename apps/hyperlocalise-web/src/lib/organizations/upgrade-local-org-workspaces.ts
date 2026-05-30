import { withAuth } from "@workos-inc/authkit-nextjs";

import { reconcileWorkosMembershipsForUser } from "@/api/auth/workos-membership-reconcile";
import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { db } from "@/lib/database";
import { migrateLocalOrgWorkspacesForUser } from "@/lib/organizations/migrate-local-org-to-workos";

export type LocalOrgWorkspaceMigrationSummary = {
  migrated: number;
  failed: number;
  skipped: number;
};

export type ExecuteLegacyWorkspaceUpgradeInput = {
  session: NonNullable<Awaited<ReturnType<typeof withAuth>>>;
};

export type ExecuteLegacyWorkspaceUpgradeResult =
  | {
      status: "complete";
      redirectTo: string;
      migration: LocalOrgWorkspaceMigrationSummary;
    }
  | {
      status: "onboarding";
      redirectTo: "/auth/onboarding";
      migration: LocalOrgWorkspaceMigrationSummary;
    }
  | {
      status: "failed";
      error: "workspace_upgrade_failed" | "workspace_upgrade_pending";
      message: string;
      migration: LocalOrgWorkspaceMigrationSummary;
    };

function getDashboardPath(slug: string | null | undefined) {
  if (!slug) {
    return "/auth/access-denied?reason=missing-org-slug";
  }

  return `/org/${slug}/dashboard`;
}

export async function executeLegacyWorkspaceUpgrade(
  input: ExecuteLegacyWorkspaceUpgradeInput,
): Promise<ExecuteLegacyWorkspaceUpgradeResult> {
  const sessionUser = input.session.user;

  if (!sessionUser) {
    throw new Error("missing_session_user");
  }

  const migration = await migrateLocalOrgWorkspacesForUser(db, sessionUser.id);

  if (migration.failed > 0 && migration.migrated === 0) {
    return {
      status: "failed",
      error: "workspace_upgrade_failed",
      message:
        "We could not connect your workspace to secure sign-in. Try again in a moment or contact support if this continues.",
      migration,
    };
  }

  await reconcileWorkosMembershipsForUser(db, {
    workosUserId: sessionUser.id,
    email: sessionUser.email,
    firstName: sessionUser.firstName ?? undefined,
    lastName: sessionUser.lastName ?? undefined,
    avatarUrl: sessionUser.profilePictureUrl ?? undefined,
    force: true,
  });

  const auth = await resolveApiAuthContextFromSession({ session: input.session });

  if (!auth?.activeOrganization.slug) {
    if (migration.migrated > 0) {
      return {
        status: "failed",
        error: "workspace_upgrade_pending",
        message:
          "Your workspace was updated, but we could not open it yet. Refresh this page or choose another organization.",
        migration,
      };
    }

    return {
      status: "onboarding",
      redirectTo: "/auth/onboarding",
      migration,
    };
  }

  return {
    status: "complete",
    redirectTo: getDashboardPath(auth.activeOrganization.slug),
    migration,
  };
}
