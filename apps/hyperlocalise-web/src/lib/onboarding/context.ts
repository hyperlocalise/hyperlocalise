import { redirect } from "next/navigation";
import { withAuth } from "@workos-inc/authkit-nextjs";

import {
  OrganizationSlugUnresolvableError,
  resolveApiAuthContextFromSession,
  StaleOrganizationSlugError,
} from "@/api/auth/workos-session";
import { db } from "@/lib/database";
import { listLocalOrgWorkspacesForUser } from "@/lib/organizations/migrate-local-org-to-workos";
import { setStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";
import {
  clearStoredOnboardingState,
  getStoredOnboardingState,
  setStoredOnboardingState,
} from "@/lib/workos/onboarding-state";

export async function loadOnboardingContext() {
  const session = await withAuth({ ensureSignedIn: true });
  let onboardingState = await getStoredOnboardingState();
  let auth;

  try {
    auth = await resolveApiAuthContextFromSession({
      session,
      organizationSlug: onboardingState?.organizationSlug,
    });
  } catch (error) {
    if (error instanceof StaleOrganizationSlugError) {
      const updatedOnboardingState = {
        organizationSlug: error.currentSlug,
        providerSetupStatus: onboardingState?.providerSetupStatus ?? "pending",
      };
      await setStoredOnboardingState(updatedOnboardingState);
      onboardingState = updatedOnboardingState;

      try {
        auth = await resolveApiAuthContextFromSession({
          session,
          organizationSlug: error.currentSlug,
        });

        if (auth?.activeOrganization.slug) {
          await setStoredActiveOrganizationSlug(auth.activeOrganization.slug);
        }
      } catch (retryError) {
        if (
          retryError instanceof Error &&
          (retryError.message === "organization_access_denied" ||
            retryError.message === "archived_organization_access")
        ) {
          await clearStoredOnboardingState();
          onboardingState = null;
          auth = null;
        } else {
          throw retryError;
        }
      }
    } else if (error instanceof OrganizationSlugUnresolvableError) {
      await clearStoredOnboardingState();
      onboardingState = null;
      auth = await resolveApiAuthContextFromSession({ session });
    } else if (
      error instanceof Error &&
      (error.message === "organization_access_denied" ||
        error.message === "archived_organization_access")
    ) {
      await clearStoredOnboardingState();
      onboardingState = null;
      auth = null;
    } else {
      throw error;
    }
  }

  if (!auth && session.user) {
    const pendingLocalOrgWorkspaces = await listLocalOrgWorkspacesForUser(db, session.user.id);
    if (pendingLocalOrgWorkspaces.length > 0) {
      redirect("/auth/upgrade-workspace");
    }
  }

  return {
    session,
    onboardingState,
    auth,
  };
}
