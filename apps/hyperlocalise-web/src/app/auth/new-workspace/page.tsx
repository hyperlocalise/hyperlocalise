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
import { getAppLocale } from "@/lib/app-i18n/server-locale";
import { getStoredActiveOrganizationSlug } from "@/lib/workos/active-organization";
import { getAppAuthContextAllowingNoWorkspace } from "@/lib/workos/app-auth";
import { listPendingInvitations } from "@/lib/workos/pending-invitations";
import { getAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

export async function generateMetadata() {
  return getAuthenticatedPageMetadata(await getAppLocale(), "newWorkspace", {
    includeBrandSuffix: true,
  });
}

export default async function NewWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // Someone with no workspace yet may get here from the picker, where their invitations are.
  // The remembered workspace is only a hint for Cancel: it may be one the person has left.
  const [{ auth, sessionUser }, storedSlug, { from }] = await Promise.all([
    getAppAuthContextAllowingNoWorkspace({ ignoreStoredActiveOrganization: true }),
    getStoredActiveOrganizationSlug(),
    searchParams,
  ]);
  // With no workspace and nothing to go back to, this is a first workspace: onboarding.
  if (
    !auth &&
    !(sessionUser.emailVerified && (await listPendingInvitations(sessionUser.id)).length > 0)
  ) {
    redirect("/auth/onboarding");
  }
  const organizations = auth?.organizations ?? [];
  const memberSlug = (slug: string | null | undefined) =>
    organizations.find((organization) => organization.slug && organization.slug === slug)?.slug;
  // The switcher names the workspace the person is in; the remembered one is a fallback.
  const cancelSlug =
    memberSlug(from) ??
    memberSlug(storedSlug) ??
    auth?.activeOrganization.slug ??
    organizations.find((organization) => organization.slug)?.slug;

  return (
    <OnboardingWizard
      cancelHref={cancelSlug ? `/org/${cancelSlug}/dashboard` : "/auth/select-organization"}
    />
  );
}
