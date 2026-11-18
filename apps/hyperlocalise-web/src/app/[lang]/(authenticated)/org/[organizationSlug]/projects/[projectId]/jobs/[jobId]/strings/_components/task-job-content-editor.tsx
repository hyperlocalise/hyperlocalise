"use client";

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
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl } from "react-intl";

import { useAppShellSidebar } from "@/components/app-shell/store/use-app-shell-sidebar";
import { ContentEditorPageRoot } from "@/components/content-editor/page/content-editor-page-root";
import { createContentEditorLoadingWorkspaceState } from "@/components/content-editor/project-file/project-file-content-editor-mapper";
import { ProjectFileContentEditorWorkspace } from "@/components/content-editor/project-file/project-file-content-editor-workspace";
import {
  attemptCatPageNavigation,
  type ContentEditorPageNavigationGuardRef,
} from "@/components/content-editor/workspace/content-editor-page-navigation-guard";
import type {
  ContentEditorQueueFilter,
  ContentEditorQueueSort,
} from "@/components/content-editor/queue/content-editor-queue-filter";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { goSvcErrorMessage } from "@/lib/go-svc/go-svc-error";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";

import { ProjectPageShell } from "../../../../_components/project-page-shell";
import type { JobDetailRecord } from "../../_components/job-detail-types";
import { nativeJobToProjectFileRecord } from "../../_components/tms/job-source-file-mappers";
import { jobCatPageContentMessages } from "./job-content-editor-page-content.messages";
import {
  resolveJobContentEditorSelectableTargetLocales,
  selectJobContentEditorTargetLocale,
} from "./job-content-editor-target-locale";

function readSourceLocale(job: JobDetailRecord): string | null {
  const payload = job.inputPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const sourceLocale = (payload as Record<string, unknown>).sourceLocale;
  return typeof sourceLocale === "string" && sourceLocale.trim() ? sourceLocale.trim() : null;
}

/**
 * The editor for someone who is here through a task they own and not through the project's
 * team: a vendor, or a member given a task outside their teams. Everything comes from the task
 * itself (its file, its languages, its source language), because the project's own pages and
 * settings are closed to them. The address can name no other file or language.
 */
export function TaskJobContentEditor({
  organizationSlug,
  projectId,
  jobId,
  targetLocale,
  initialSegmentKey = null,
  initialQueueFilter = "all",
  initialQueueSort = "file_order",
  initialSearch = "",
  adaptiveWorkspaceEnabled = false,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  targetLocale: string | null;
  initialSegmentKey?: string | null;
  initialQueueFilter?: ContentEditorQueueFilter;
  initialQueueSort?: ContentEditorQueueSort;
  initialSearch?: string;
  adaptiveWorkspaceEnabled?: boolean;
}) {
  const intl = useIntl();
  const router = useRouter();
  const { client: goSvcClient } = useGoSvcClient();
  const pageNavigationGuardRef = useRef<ContentEditorPageNavigationGuardRef["current"]>(null);
  const taskHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  useAppShellSidebar({ forceCollapsed: true });

  const jobQuery = useQuery({
    queryKey: ["task-job-content-editor", organizationSlug, projectId, jobId],
    queryFn: async () => {
      try {
        const body = await goSvcClient.job.get<JobDetailRecord>(organizationSlug, jobId);
        return body.job.projectId === projectId ? body.job : null;
      } catch (error) {
        throw new Error(
          goSvcErrorMessage(
            error,
            intl.formatMessage(jobCatPageContentMessages.unableToLoadTaskFiles),
          ),
          { cause: error },
        );
      }
    },
  });

  if (jobQuery.isLoading) {
    return (
      <ProjectPageShell>
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
          <Spinner />
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.loadingWorkspace} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const job = jobQuery.data ?? null;
  const file = job ? nativeJobToProjectFileRecord(job) : null;
  const sourceLocale = job ? readSourceLocale(job) : null;
  const targetLocales = job ? resolveJobContentEditorSelectableTargetLocales(job) : [];
  const activeTargetLocale = selectJobContentEditorTargetLocale({
    requestedTargetLocale: targetLocale,
    providerTargetLocales: targetLocales,
  });

  if (jobQuery.isError || !job || !file || !sourceLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP className="text-flame-100" size="small">
            {jobQuery.error instanceof Error ? (
              jobQuery.error.message
            ) : (
              <FormattedMessage {...jobCatPageContentMessages.noSourceFileLinked} />
            )}
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  if (!activeTargetLocale) {
    return (
      <ProjectPageShell>
        <div className="rounded-lg border border-border bg-card p-5">
          <TypographyP size="small" tone="subtle">
            <FormattedMessage {...jobCatPageContentMessages.noTargetLocaleForTaskFile} />
          </TypographyP>
        </div>
      </ProjectPageShell>
    );
  }

  const handleLocaleChange = (nextLocale: string) => {
    if (!nextLocale || nextLocale === activeTargetLocale) {
      return;
    }
    attemptCatPageNavigation(pageNavigationGuardRef, () => {
      router.push(`${taskHref}/strings?targetLocale=${encodeURIComponent(nextLocale)}`);
    });
  };

  return (
    <ContentEditorPageRoot
      initialState={createContentEditorLoadingWorkspaceState({
        sourcePath: file.sourcePath,
        sourceLocale,
        targetLocale: activeTargetLocale,
      })}
      initialQueueFilter={initialQueueFilter}
      initialQueueSort={initialQueueSort}
      initialSearch={initialSearch}
      chrome={{
        files: [file],
        selectedSourcePath: file.sourcePath,
        allFiles: false,
        canUseAllFiles: false,
        targetLocale: activeTargetLocale,
        targetLocales,
        repositoryFullNames: [],
        selectedRepositoryFullName: null,
        // The file's activity log is closed to a task owner, so the header offers none.
        activitySourcePath: "",
        organizationSlug,
        projectId,
        showFileSidebar: false,
      }}
      backHref={taskHref}
      actions={{
        onSelectFile: () => undefined,
        onLocaleChange: handleLocaleChange,
        onRepositoryChange: () => undefined,
      }}
    >
      <ProjectFileContentEditorWorkspace
        organizationSlug={organizationSlug}
        projectId={projectId}
        projectSource="native"
        sourceLocale={sourceLocale}
        sourcePath={file.sourcePath}
        targetLocale={activeTargetLocale}
        highlightLocale={activeTargetLocale}
        canLookupFreshContext={false}
        initialSegmentKey={initialSegmentKey}
        initialQueueFilter={initialQueueFilter}
        initialQueueSort={initialQueueSort}
        initialSearch={initialSearch}
        layout="fullscreen"
        className="min-h-0 flex-1"
        pageNavigationGuardRef={pageNavigationGuardRef}
        adaptiveWorkspaceEnabled={adaptiveWorkspaceEnabled}
        taskScoped
      />
    </ContentEditorPageRoot>
  );
}
