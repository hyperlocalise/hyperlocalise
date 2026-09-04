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
import { ProjectOverviewPageContent } from "./_components/project-overview-page-content";
import { OrgPageSuspense } from "../../_components/org-page-suspense";

export default function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectOverviewPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function ProjectOverviewPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return <ProjectOverviewPageContent organizationSlug={organizationSlug} projectId={projectId} />;
}
