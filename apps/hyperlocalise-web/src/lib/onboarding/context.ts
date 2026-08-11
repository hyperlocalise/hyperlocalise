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
import { withAuth } from "@/lib/workos/server-auth";

import {
  OrganizationSlugUnresolvableError,
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

  return {
    session,
    onboardingState,
    auth,
  };
}
