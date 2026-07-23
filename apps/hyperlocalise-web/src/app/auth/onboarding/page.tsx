/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
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
