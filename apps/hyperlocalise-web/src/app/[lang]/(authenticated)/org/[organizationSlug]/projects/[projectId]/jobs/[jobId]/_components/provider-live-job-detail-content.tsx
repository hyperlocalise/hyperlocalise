"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAppShellBreadcrumbAppend } from "@/components/app-shell/store/use-app-shell-breadcrumb";
import { apiClient } from "@/lib/api-client-instance";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/jobs/tms-provider-live";
import { parseProviderJobId } from "@/lib/providers/jobs/tms-provider-resource-id";
import { resolveDefaultJobCatQueueFilter } from "@/lib/projects/job-cat-routing";

import { ProviderJobDescriptionField } from "../../../../../jobs/_components/provider-job-description-field";
import { useProviderJobLocaleReadiness } from "../../../../../_hooks/use-provider-job-locale-readiness";
import { ProviderLiveJobDetailView } from "./provider-live-job-detail-view";
import { TmsLiveJobFilesSection } from "./tms/tms-live-job-files-section";
import { buildJobsListHref } from "./job-detail-types";

export function ProviderLiveJobDetailContent({
  jobId,
  organizationSlug,
  projectId,
  canEditProviderJobDescription,
}: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
  canEditProviderJobDescription: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const jobQueryKey = ["tms-provider-job", organizationSlug, jobId] as const;
  const parsedJobId = parseProviderJobId(jobId);
  const showComments =
    parsedJobId?.providerKind === "crowdin" || parsedJobId?.providerKind === "lokalise";
  const canDeleteJob = parsedJobId?.providerKind === "crowdin";

  const jobQuery = useQuery({
    queryKey: jobQueryKey,
    queryFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].$get({
        param: { organizationSlug, encodedJobId: jobId },
      });

      if (!response.ok) {
        throw new Error(`Failed to load provider job (${response.status})`);
      }

      const body = (await response.json()) as { job: TmsProviderLiveJobDetail };
      return body.job;
    },
  });

  const deleteJob = useMutation({
    mutationFn: async () => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].$delete({
        param: { organizationSlug, encodedJobId: jobId },
      });
      if (response.status !== 204 && !response.ok) {
        throw new Error(`Failed to delete job (${response.status})`);
      }
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success("Crowdin task deleted");
      router.push(buildJobsListHref(organizationSlug, projectId));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to delete job");
    },
  });

  const localeReadinessQuery = useProviderJobLocaleReadiness({
    organizationSlug,
    externalProjectId: parsedJobId?.externalProjectId,
    providerKind: jobQuery.data?.externalProviderKind,
    providerPayload: jobQuery.data?.externalProviderPayload,
    enabled: Boolean(jobQuery.data),
  });
  useAppShellBreadcrumbAppend({
    id: "job-detail",
    label: jobQuery.data?.externalTitle,
  });

  return (
    <>
      <ProviderLiveJobDetailView
        jobId={jobId}
        organizationSlug={organizationSlug}
        projectId={projectId}
        canEditProviderJobDescription={canEditProviderJobDescription}
        job={jobQuery.data}
        isLoading={jobQuery.isLoading}
        error={jobQuery.isError ? jobQuery.error : undefined}
        localeReadinessLoading={localeReadinessQuery.isLoading}
        localeReadinessOverride={localeReadinessQuery.data ?? null}
        isRefreshing={jobQuery.isFetching}
        onRefresh={() => {
          void queryClient.invalidateQueries({ queryKey: jobQueryKey });
        }}
        onDelete={canDeleteJob ? () => setDeleteDialogOpen(true) : undefined}
        isDeleting={deleteJob.isPending}
        showComments={showComments}
        renderDescriptionField={({ description, editable }) => (
          <ProviderJobDescriptionField
            organizationSlug={organizationSlug}
            encodedJobId={jobId}
            description={description}
            editable={editable}
            queryKey={jobQueryKey}
          />
        )}
        renderFilesSection={({
          job,
          jobId: encodedJobId,
          organizationSlug: orgSlug,
          projectId: projId,
        }) => (
          <TmsLiveJobFilesSection
            organizationSlug={orgSlug}
            projectId={projId}
            encodedJobId={encodedJobId}
            highlightLocale={
              typeof job.externalProviderPayload.languageId === "string"
                ? job.externalProviderPayload.languageId
                : (job.externalTargetLocales?.[0] ?? null)
            }
            queueFilter={resolveDefaultJobCatQueueFilter(job)}
          />
        )}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleteJob.isPending) {
            setDeleteDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Crowdin task?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the task in Crowdin. This cannot be undone from
              Hyperlocalise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteJob.isPending}>Keep task</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteJob.isPending}
              onClick={() => deleteJob.mutate()}
            >
              {deleteJob.isPending ? "Deleting..." : "Delete task"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
