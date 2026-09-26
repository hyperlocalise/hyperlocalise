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
import { autumnFeatureIds } from "@/lib/billing/autumn-ids";
import { requireAutumnWorkspaceBooleanFeature } from "@/lib/flags/workspace-flags";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { IssueDetailPageContent } from "../../projects/[projectId]/issue-sheet/[issueId]/_components/issue-detail-page-content";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "queryDetail");
}

export default function OrganizationIssueDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; issueId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <OrganizationIssueDetailPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function OrganizationIssueDetailPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; issueId: string }>;
}) {
  const { organizationSlug, issueId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  await requireAutumnWorkspaceBooleanFeature(autumnFeatureIds.queriesBoard, auth);

  return (
    <IssueDetailPageContent
      organizationSlug={organizationSlug}
      issueId={issueId}
      detailScope="organization"
    />
  );
}
