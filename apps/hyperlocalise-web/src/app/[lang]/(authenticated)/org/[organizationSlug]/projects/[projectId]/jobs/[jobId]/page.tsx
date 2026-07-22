/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { hasCapability } from "@/api/auth/policy";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { requireAppAuthContext } from "@/lib/workos/app-auth";

import { JobDetailPageContent } from "./_components/job-detail-page-content";

export default async function ProjectJobDetailPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
}) {
  const { organizationSlug, projectId: rawProjectId, jobId } = await params;
  const projectId = normalizeProjectId(rawProjectId);
  const auth = await requireAppAuthContext({ organizationSlug });
  const canEditProviderJobDescription = hasCapability(auth.membership.role, "jobs:write");

  return (
    <JobDetailPageContent
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      canEditProviderJobDescription={canEditProviderJobDescription}
    />
  );
}
