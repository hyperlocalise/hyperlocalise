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
import { JobsPageContent } from "../../../jobs/_components/jobs-page-content";
import { OrgPageSuspense } from "../../../_components/org-page-suspense";

export default function ProjectJobsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  return (
    <OrgPageSuspense>
      <ProjectJobsPageLoader params={params} />
    </OrgPageSuspense>
  );
}

async function ProjectJobsPageLoader({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
}) {
  const { organizationSlug, projectId } = await params;

  return <JobsPageContent organizationSlug={organizationSlug} projectId={projectId} />;
}
