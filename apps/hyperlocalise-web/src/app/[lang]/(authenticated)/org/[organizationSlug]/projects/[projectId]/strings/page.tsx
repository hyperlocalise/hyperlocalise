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
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";
import { parseProjectFileContentEditorSearchParams } from "@/lib/projects/project-file-content-editor-routing";
import {
  parseCatWorkspaceQueueFilterParam,
  parseCatWorkspaceQueueSortParam,
  parseCatWorkspaceSearchParam,
} from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import {
  contentEditorAllFilesProviderKindFromTarget,
  resolveProjectResourceTarget,
} from "@/api/routes/project/project.shared";

import { ProjectFileContentEditorPageContent } from "../files/_components/project-file-content-editor-page-content";

export default async function ProjectStringsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; projectId: string }>;
  searchParams: Promise<{
    sourcePath?: string;
    locale?: string;
    segment?: string;
    externalResourceId?: string;
    resourceType?: string;
    branch?: string;
    sourcePaths?: string;
    queueFilter?: string;
    queueSort?: string;
    search?: string;
  }>;
}) {
  const { organizationSlug, projectId } = await params;
  const rawSearchParams = await searchParams;
  const auth = await requireAppAuthContext({ organizationSlug });
  const target = await resolveProjectResourceTarget(auth, projectId);
  const contentEditorAllFilesEnabled = await isReleaseContentEditorAllFilesEnabled(
    contentEditorAllFilesProviderKindFromTarget(target),
  );
  const defaultSourcePath = contentEditorAllFilesEnabled
    ? CONTENT_EDITOR_ALL_FILES_SOURCE_PATH
    : rawSearchParams.sourcePath?.trim()
      ? rawSearchParams.sourcePath
      : null;
  const parsedSearchParams = parseProjectFileContentEditorSearchParams({
    ...rawSearchParams,
    sourcePath: rawSearchParams.sourcePath?.trim()
      ? rawSearchParams.sourcePath
      : (defaultSourcePath ?? undefined),
  });

  return (
    <ProjectFileContentEditorPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={parsedSearchParams.sourcePath}
      allFiles={
        contentEditorAllFilesEnabled
          ? parsedSearchParams.allFiles || !parsedSearchParams.sourcePath
          : false
      }
      contentEditorAllFilesEnabled={contentEditorAllFilesEnabled}
      highlightLocale={parsedSearchParams.highlightLocale}
      initialSegmentKey={parsedSearchParams.initialSegmentKey}
      initialQueueFilter={parseCatWorkspaceQueueFilterParam(rawSearchParams.queueFilter) ?? "all"}
      initialQueueSort={parseCatWorkspaceQueueSortParam(rawSearchParams.queueSort) ?? "file_order"}
      initialSearch={parseCatWorkspaceSearchParam(rawSearchParams.search)}
      externalResourceId={parsedSearchParams.externalResourceId}
      resourceType={parsedSearchParams.resourceType}
      branch={parsedSearchParams.branch}
      sourcePaths={parsedSearchParams.sourcePaths}
    />
  );
}
