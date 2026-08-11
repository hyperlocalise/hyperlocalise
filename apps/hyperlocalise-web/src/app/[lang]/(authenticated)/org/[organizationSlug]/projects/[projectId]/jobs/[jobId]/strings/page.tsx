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
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import { isReleaseCatAllFilesEnabled } from "@/lib/flags/release-flags";
import { resolveJobCatInitialQueueFilter } from "@/lib/projects/resolve-job-cat-initial-queue-filter";
import {
  catAllFilesProviderKindFromTarget,
  resolveProjectResourceTarget,
} from "@/api/routes/project/project.shared";

import { JobCatPageContent } from "./_components/job-cat-page-content";

export default async function ProjectJobStringsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string; jobId: string }>;
  searchParams: Promise<{
    sourcePath?: string;
    storedFileId?: string;
    sourcePaths?: string;
    targetLocale?: string;
    segment?: string;
    queueFilter?: string;
  }>;
}) {
  const { organizationSlug, projectId, jobId } = await params;
  const { sourcePath, storedFileId, sourcePaths, targetLocale, segment, queueFilter } =
    await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  const target = await resolveProjectResourceTarget(auth, projectId);
  const catAllFilesEnabled = await isReleaseCatAllFilesEnabled(
    catAllFilesProviderKindFromTarget(target),
  );

  const initialQueueFilter = await resolveJobCatInitialQueueFilter({
    auth,
    jobId,
    queueFilterParam: queueFilter,
  });

  return (
    <JobCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      jobId={jobId}
      sourcePath={sourcePath ?? null}
      storedFileId={storedFileId ?? null}
      sourcePaths={sourcePaths ?? null}
      targetLocale={targetLocale ?? null}
      initialSegmentKey={segment ?? null}
      initialQueueFilter={initialQueueFilter}
      catAllFilesEnabled={catAllFilesEnabled}
    />
  );
}
