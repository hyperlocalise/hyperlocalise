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
import { isReleaseContentEditorAllFilesEnabled } from "@/lib/flags/release-flags";
import {
  parseCatWorkspaceQueueSortParam,
  parseCatWorkspaceSearchParam,
} from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import { resolveJobContentEditorInitialQueueFilter } from "@/lib/projects/resolve-job-content-editor-initial-queue-filter";
import {
  contentEditorAllFilesProviderKindFromTarget,
  resolveProjectResourceTarget,
} from "@/api/routes/project/project.shared";

import { JobContentEditorPageContent } from "./_components/job-content-editor-page-content";

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
    queueSort?: string;
    search?: string;
  }>;
}) {
  const { organizationSlug, projectId, jobId } = await params;
  const {
    sourcePath,
    storedFileId,
    sourcePaths,
    targetLocale,
    segment,
    queueFilter,
    queueSort,
    search,
  } = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  const target = await resolveProjectResourceTarget(auth, projectId);
  const contentEditorAllFilesEnabled = await isReleaseContentEditorAllFilesEnabled(
    contentEditorAllFilesProviderKindFromTarget(target),
  );

  const initialQueueFilter = await resolveJobContentEditorInitialQueueFilter({
    auth,
    jobId,
    queueFilterParam: queueFilter,
  });

  return (
    <JobContentEditorPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      jobId={jobId}
      sourcePath={sourcePath ?? null}
      storedFileId={storedFileId ?? null}
      sourcePaths={sourcePaths ?? null}
      targetLocale={targetLocale ?? null}
      initialSegmentKey={segment ?? null}
      initialQueueFilter={initialQueueFilter}
      initialQueueSort={parseCatWorkspaceQueueSortParam(queueSort) ?? "file_order"}
      initialSearch={parseCatWorkspaceSearchParam(search)}
      contentEditorAllFilesEnabled={contentEditorAllFilesEnabled}
    />
  );
}
