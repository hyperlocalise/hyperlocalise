import { withAuth } from "@workos-inc/authkit-nextjs";

import {
  resolveApiAuthContextFromSession,
  StaleOrganizationSlugError,
} from "@/api/auth/workos-session";
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

  return {
    session,
    onboardingState,
    auth,
  };
}
