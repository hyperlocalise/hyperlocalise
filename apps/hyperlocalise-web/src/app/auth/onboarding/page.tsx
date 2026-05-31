import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/app/auth/onboarding/_components/onboarding-wizard";
import { loadOnboardingContext } from "@/lib/onboarding/context";
import { clearStoredOnboardingState } from "@/lib/workos/onboarding-state";

function getDashboardPath(slug: string | null | undefined) {
  if (!slug) {
    return "/auth/access-denied?reason=missing-org-slug";
  }

  return `/org/${slug}/dashboard`;
}

export default async function OnboardingPage() {
  const { onboardingState, auth } = await loadOnboardingContext();

  if (auth?.activeOrganization.slug) {
    if (onboardingState) {
      await clearStoredOnboardingState();
    }

    redirect(getDashboardPath(auth.activeOrganization.slug));
  }

  if (onboardingState?.organizationSlug) {
    await clearStoredOnboardingState();
    redirect("/auth/onboarding");
  }

  return <OnboardingWizard />;
}
