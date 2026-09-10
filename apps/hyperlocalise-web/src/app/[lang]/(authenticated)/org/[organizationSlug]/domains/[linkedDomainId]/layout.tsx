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
import type { ReactNode } from "react";

import { FeatureTeaserPage } from "@/components/feature-teaser/feature-teaser-page";
import { getWorkspaceFeatureFlagEnabled, workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import { requireAppCapability } from "@/lib/workos/app-auth";

import { OrgPageSuspense } from "../../_components/org-page-suspense";

export default function DomainDetailLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string; linkedDomainId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <DomainDetailLayoutLoader params={params}>{children}</DomainDetailLayoutLoader>
    </OrgPageSuspense>
  );
}

async function DomainDetailLayoutLoader({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationSlug: string; linkedDomainId: string }>;
}) {
  const { organizationSlug } = await params;
  const auth = await requireAppCapability("projects:read", { organizationSlug });
  const domainsEnabled = await getWorkspaceFeatureFlagEnabled(workspaceDomainsFlag, auth);

  if (!domainsEnabled) {
    return <FeatureTeaserPage feature="domains" scope="workspace" />;
  }

  return children;
}
