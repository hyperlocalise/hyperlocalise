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
import { hasCapability } from "@/api/auth/policy";
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { getWorkspaceFeatureFlagEnabled, workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import { requireAppCapability } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { DomainsPageContent } from "../../domains/_components/domains-page-content";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "settingsLinkedDomains");
}

export default function DomainsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ claimDomainSlug?: string }>;
}) {
  return (
    <OrgPageSuspense>
      <DomainsSettingsPageLoader params={params} searchParams={searchParams} />
    </OrgPageSuspense>
  );
}

async function DomainsSettingsPageLoader({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ claimDomainSlug?: string }>;
}) {
  const { organizationSlug } = await params;
  const { claimDomainSlug } = await searchParams;
  const auth = await requireAppCapability("projects:read", { organizationSlug });
  const domainsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceDomainsFlag, auth);

  if (!domainsEnabled) {
    return <FeatureTeaserPage feature="domains" scope="workspace" />;
  }

  return (
    <DomainsPageContent
      organizationSlug={organizationSlug}
      allowLinkDomains={hasCapability(auth.membership.role, "projects:create")}
      initialDomainSlug={claimDomainSlug}
    />
  );
}
