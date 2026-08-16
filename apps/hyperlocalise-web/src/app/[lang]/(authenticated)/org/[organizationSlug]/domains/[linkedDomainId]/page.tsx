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
import { requireWorkspaceFeatureFlag, workspaceDomainsFlag } from "@/lib/flags/workspace-flags";
import { requireAppCapability } from "@/lib/workos/app-auth";

import { DomainDetailPageContent } from "./_components/domain-detail-page-content";

export default async function DomainDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; linkedDomainId: string }>;
}) {
  const { organizationSlug, linkedDomainId } = await params;
  const auth = await requireAppCapability("projects:read", { organizationSlug });
  await requireWorkspaceFeatureFlag(workspaceDomainsFlag, auth);

  return (
    <DomainDetailPageContent organizationSlug={organizationSlug} linkedDomainId={linkedDomainId} />
  );
}
