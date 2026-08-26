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
import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { getWorkspaceFeatureFlagEnabled, workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import { requireAppCapability } from "@/lib/workos/app-auth";

import { LinkDomainPageContent } from "./_components/link-domain-page-content";

export default async function LinkDomainPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; domainSlug: string }>;
}) {
  const { organizationSlug, domainSlug } = await params;
  const auth = await requireAppCapability("projects:create", { organizationSlug });
  const domainsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceDomainsFlag, auth);

  if (!domainsEnabled) {
    return <FeatureTeaserPage feature="domains" scope="workspace" />;
  }

  return <LinkDomainPageContent organizationSlug={organizationSlug} domainSlug={domainSlug} />;
}
