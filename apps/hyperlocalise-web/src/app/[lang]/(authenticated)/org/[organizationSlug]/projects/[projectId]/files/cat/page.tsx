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
import {
  parseCatWorkspaceQueueFilterParam,
  parseCatWorkspaceSearchParam,
} from "@/lib/projects/cat/cat-workspace-query-params";
import { parseProjectFileCatSearchParams } from "@/lib/projects/project-file-cat-routing";
import {
  catAllFilesProviderKindFromTarget,
  resolveProjectResourceTarget,
} from "@/api/routes/project/project.shared";

import { ProjectFileCatPageContent } from "../_components/project-file-cat-page-content";

export default async function ProjectFileCatPage({
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
    search?: string;
  }>;
}) {
  const { organizationSlug, projectId } = await params;
  const rawSearchParams = await searchParams;
  const parsedSearchParams = parseProjectFileCatSearchParams(rawSearchParams);
  const auth = await requireAppAuthContext({ organizationSlug });
  const target = await resolveProjectResourceTarget(auth, projectId);
  const catAllFilesEnabled = await isReleaseCatAllFilesEnabled(
    catAllFilesProviderKindFromTarget(target),
  );

  return (
    <ProjectFileCatPageContent
      organizationSlug={organizationSlug}
      projectId={projectId}
      sourcePath={parsedSearchParams.sourcePath}
      allFiles={catAllFilesEnabled ? parsedSearchParams.allFiles : false}
      catAllFilesEnabled={catAllFilesEnabled}
      highlightLocale={parsedSearchParams.highlightLocale}
      initialSegmentKey={parsedSearchParams.initialSegmentKey}
      initialQueueFilter={parseCatWorkspaceQueueFilterParam(rawSearchParams.queueFilter) ?? "all"}
      initialSearch={parseCatWorkspaceSearchParam(rawSearchParams.search)}
      externalResourceId={parsedSearchParams.externalResourceId}
      resourceType={parsedSearchParams.resourceType}
      branch={parsedSearchParams.branch}
      sourcePaths={parsedSearchParams.sourcePaths}
    />
  );
}
