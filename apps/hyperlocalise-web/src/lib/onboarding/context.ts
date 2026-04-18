import { withAuth } from "@workos-inc/authkit-nextjs";

import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import {
  clearStoredOnboardingState,
  getStoredOnboardingState,
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
    if (error instanceof Error && error.message === "organization_access_denied") {
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
