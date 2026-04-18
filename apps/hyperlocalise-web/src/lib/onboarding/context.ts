import { withAuth } from "@workos-inc/authkit-nextjs";

import { resolveApiAuthContextFromSession } from "@/api/auth/workos-session";
import { getStoredOnboardingState } from "@/lib/workos/onboarding-state";

export async function loadOnboardingContext() {
  const session = await withAuth({ ensureSignedIn: true });
  const onboardingState = await getStoredOnboardingState();
  const auth = await resolveApiAuthContextFromSession({
    session,
    organizationSlug: onboardingState?.organizationSlug,
  });

  return {
    session,
    onboardingState,
    auth,
  };
}
