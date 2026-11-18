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
import { redirect } from "next/navigation";

import { hasCapability, isWorkspaceOperatorRole } from "@/api/auth/policy";
import { canAccessProject } from "@/api/auth/team-access";
import { isVendorRole, vendorHomePath } from "@/api/auth/vendor-access";
import { normalizeProjectId } from "@/lib/projects/identity/project-id";
import { findOwnedFileTask } from "@/lib/projects/jobs/task-access";
import { requireAppAuthContext } from "@/lib/workos/app-auth";
import {
  isReleaseCatAdaptiveWorkspaceEnabled,
  isReleaseContentEditorAllFilesEnabled,
} from "@/lib/flags/release-flags";
import {
  parseCatWorkspaceQueueAdvancedParam,
  parseCatWorkspaceQueueFilterQualifierParam,
  parseCatWorkspaceQueueSortParam,
  parseCatWorkspaceSearchParam,
} from "@/lib/projects/content-editor/content-editor-workspace-query-params";
import { parseJobContentEditorQueueFilterParam } from "@/lib/projects/job-content-editor-routing";
import { resolveJobContentEditorInitialQueueFilter } from "@/lib/projects/resolve-job-content-editor-initial-queue-filter";
import {
  contentEditorAllFilesProviderKindFromTarget,
  resolveProjectResourceTarget,
} from "@/api/routes/project/project.shared";
import { generateAuthenticatedPageMetadata } from "@/lib/seo/authenticated-page-metadata";

import { JobContentEditorPageContent } from "./_components/job-content-editor-page-content";
import { TaskJobContentEditor } from "./_components/task-job-content-editor";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return generateAuthenticatedPageMetadata(params, "projectJobStrings");
}

export default function ProjectJobStringsPage({
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
    queueFilterQualifier?: string;
    queueAdvanced?: string;
  }>;
}) {
  return <ProjectJobStringsPageLoader params={params} searchParams={searchParams} />;
}

async function ProjectJobStringsPageLoader({
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
    queueFilterQualifier?: string;
    queueAdvanced?: string;
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
    queueFilterQualifier,
    queueAdvanced,
  } = await searchParams;
  // Open to vendors (`vendor-access.ts`), who reach the editor only through an open task.
  const auth = await requireAppAuthContext({ organizationSlug, allowVendor: true });
  const isVendor = isVendorRole(auth.membership.role);
  // Through the project's team, as before; otherwise through an open task the person owns,
  // which shows that task's file and languages and nothing else of the project.
  const throughTeam = !isVendor && Boolean(await canAccessProject(auth, projectId));
  if (!throughTeam) {
    const task = await findOwnedFileTask({
      organizationId: auth.organization.localOrganizationId,
      userId: auth.user.localUserId,
      jobId,
    });
    if (task && task.projectId === normalizeProjectId(projectId)) {
      return (
        <TaskJobContentEditor
          organizationSlug={organizationSlug}
          projectId={task.projectId}
          jobId={jobId}
          targetLocale={targetLocale ?? null}
          initialSegmentKey={segment ?? null}
          initialQueueFilter={parseJobContentEditorQueueFilterParam(queueFilter) ?? "all"}
          initialQueueSort={parseCatWorkspaceQueueSortParam(queueSort) ?? "file_order"}
          initialSearch={parseCatWorkspaceSearchParam(search)}
          adaptiveWorkspaceEnabled={await isReleaseCatAdaptiveWorkspaceEnabled(auth)}
        />
      );
    }
    if (isVendor) {
      redirect(vendorHomePath(organizationSlug));
    }
  }
  const target = await resolveProjectResourceTarget(auth, projectId);
  const [contentEditorAllFilesEnabled, adaptiveWorkspaceEnabled] = await Promise.all([
    isReleaseContentEditorAllFilesEnabled(contentEditorAllFilesProviderKindFromTarget(target)),
    isReleaseCatAdaptiveWorkspaceEnabled(auth),
  ]);

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
      initialQueueFilterQualifier={parseCatWorkspaceQueueFilterQualifierParam(queueFilterQualifier)}
      initialQueueAdvanced={parseCatWorkspaceQueueAdvancedParam(queueAdvanced)}
      contentEditorAllFilesEnabled={contentEditorAllFilesEnabled}
      adaptiveWorkspaceEnabled={adaptiveWorkspaceEnabled}
      canWriteDictionaries={hasCapability(auth.membership.role, "dictionaries:write")}
      canManageAutomations={isWorkspaceOperatorRole(auth.membership.role)}
    />
  );
}
