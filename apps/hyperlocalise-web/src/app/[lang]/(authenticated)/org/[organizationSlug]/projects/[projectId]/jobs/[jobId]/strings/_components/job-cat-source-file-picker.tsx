"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TypographyP } from "@/components/ui/typography";
import { apiClient } from "@/lib/api-client-instance";
import { parseProviderJobId } from "@/lib/providers/tms-provider-resource-id";

import { ProjectPageShell } from "../../../../_components/project-page-shell";
import type { JobDetailRecord } from "../../_components/job-detail-types";
import {
  buildNativeJobFileRecord,
  isNativeFileTranslationJob,
} from "../../_components/native-job-detail-helpers";
import { TmsLiveJobFilesSection } from "../../_components/tms/tms-live-job-files-section";
import { JobSourceFilesPanel } from "../../_components/tms/job-source-files-panel";

function jobDetailQueryKey(organizationSlug: string, projectId: string, jobId: string) {
  return ["job", organizationSlug, projectId, jobId] as const;
}

function NativeJobCatSourceFilePicker({
  organizationSlug,
  projectId,
  jobId,
  targetLocale,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  targetLocale: string | null;
}) {
  const jobQuery = useQuery({
    queryKey: jobDetailQueryKey(organizationSlug, projectId, jobId),
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"].jobs[":jobId"].$get({
        param: { organizationSlug, jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load task (${response.status})`);
      }

      const body = (await response.json()) as { job: JobDetailRecord };
      if (body.job.projectId !== projectId) {
        throw new Error("Task does not belong to this project");
      }

      return body.job;
    },
  });

  if (jobQuery.isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-border bg-card p-5">
        <Spinner />
        <TypographyP className="text-sm text-muted-foreground">Loading task files…</TypographyP>
      </div>
    );
  }

  if (jobQuery.isError) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <TypographyP className="text-sm text-flame-100">
          {jobQuery.error instanceof Error ? jobQuery.error.message : "Unable to load task files."}
        </TypographyP>
      </div>
    );
  }

  const job = jobQuery.data;
  if (!job || !isNativeFileTranslationJob(job)) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <TypographyP className="text-sm text-muted-foreground">
          No source file is linked to this task. Open the task details to choose a file, then open
          View strings.
        </TypographyP>
      </div>
    );
  }

  const file = buildNativeJobFileRecord(job);
  if (!file) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <TypographyP className="text-sm text-muted-foreground">
          No source file is linked to this task.
        </TypographyP>
      </div>
    );
  }

  return (
    <JobSourceFilesPanel
      organizationSlug={organizationSlug}
      projectId={projectId}
      encodedJobId={jobId}
      files={[file]}
      highlightLocale={targetLocale}
      emptyMessage="No source file linked to this task."
    />
  );
}

export function JobCatSourceFilePicker({
  organizationSlug,
  projectId,
  jobId,
  targetLocale,
}: {
  organizationSlug: string;
  projectId: string;
  jobId: string;
  targetLocale: string | null;
}) {
  const taskHref = `/org/${organizationSlug}/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}`;
  const isProviderJob = Boolean(parseProviderJobId(jobId));

  return (
    <ProjectPageShell>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" render={<Link href={taskHref} />}>
            <ArrowLeftIcon />
            Task
          </Button>
          <TypographyP className="text-sm text-muted-foreground">
            Choose a source file to open in the CAT workspace.
          </TypographyP>
        </div>

        {isProviderJob ? (
          <TmsLiveJobFilesSection
            organizationSlug={organizationSlug}
            projectId={projectId}
            encodedJobId={jobId}
            highlightLocale={targetLocale}
          />
        ) : (
          <NativeJobCatSourceFilePicker
            organizationSlug={organizationSlug}
            projectId={projectId}
            jobId={jobId}
            targetLocale={targetLocale}
          />
        )}
      </div>
    </ProjectPageShell>
  );
}
