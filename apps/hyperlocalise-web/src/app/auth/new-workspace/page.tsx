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
import { OnboardingWizard } from "@/app/auth/onboarding/_components/onboarding-wizard";
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { getStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { getAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

export async function generateMetadata() {
  return getAuthenticatedPageMetadata(await getAppLocale(), "newWorkspace", {
    includeBrandSuffix: true,
  });
}

export default async function NewWorkspacePage() {
  // Someone with no workspace yet is sent on to onboarding (or their pending invitation).
  // The remembered workspace is only a hint for Cancel: it may be one the person has left.
  const [auth, storedSlug] = await Promise.all([
    requireAppAuthContext({ ignoreStoredActiveOrganization: true }),
    getStoredActiveOrganizationSlug(),
  ]);
  const cancelSlug =
    auth.organizations.find((organization) => organization.slug && organization.slug === storedSlug)
      ?.slug ??
    auth.activeOrganization.slug ??
    auth.organizations.find((organization) => organization.slug)?.slug;

  return (
    <OnboardingWizard
      cancelHref={cancelSlug ? `/org/${cancelSlug}/dashboard` : "/auth/select-organization"}
    />
  );
}
