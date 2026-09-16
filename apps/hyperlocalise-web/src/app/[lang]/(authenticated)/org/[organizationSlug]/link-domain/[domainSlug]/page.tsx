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
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { LinkDomainPageContent } from "./_components/link-domain-page-content";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "linkDomain");
}

export default function LinkDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; domainSlug: string }>;
  searchParams: Promise<{
    domain?: string;
    markets?: string;
    projectId?: string;
    createProject?: string;
  }>;
}) {
  return (
    <OrgPageSuspense>
      <LinkDomainPageLoader params={params} searchParams={searchParams} />
    </OrgPageSuspense>
  );
}

async function LinkDomainPageLoader({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; domainSlug: string }>;
  searchParams: Promise<{
    domain?: string;
    markets?: string;
    projectId?: string;
    createProject?: string;
  }>;
}) {
  const { organizationSlug, domainSlug } = await params;
  const { domain, markets, projectId, createProject } = await searchParams;
  const auth = await requireAppCapability("projects:create", { organizationSlug });
  const domainsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceDomainsFlag, auth);

  if (!domainsEnabled) {
    return <FeatureTeaserPage feature="domains" scope="workspace" />;
  }

  return (
    <LinkDomainPageContent
      organizationSlug={organizationSlug}
      domainSlug={domainSlug}
      directDomain={domain}
      directMarketIds={markets?.split(",").filter(Boolean)}
      directProjectId={projectId}
      directCreateProject={
        createProject === "true" ? true : createProject === "false" ? false : undefined
      }
    />
  );
}
