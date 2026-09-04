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
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { IssueSheetPageContent } from "./_components/issue-sheet-page-content";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";

export default function IssueSheetPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <IssueSheetPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function IssueSheetPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;
  const auth = await requireAppAuthContext({ organizationSlug });
  const canEditIssues = hasCapability(auth.membership.role, "write_back:translation");

  return (
    <IssueSheetPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditIssues={canEditIssues}
    />
  );
}
