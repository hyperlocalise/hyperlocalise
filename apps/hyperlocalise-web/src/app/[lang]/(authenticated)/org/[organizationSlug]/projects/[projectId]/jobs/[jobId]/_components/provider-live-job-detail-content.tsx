"use client";

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
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { FormattedMessage, useIntl } from "react-intl";
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
import { providerLiveJobDetailContentMessages as messages } from "./provider-live-job-detail-content.messages";
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
  const intl = useIntl();
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
        throw new Error(
          intl.formatMessage(messages.failedToLoadProviderJob, { status: response.status }),
        );
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
        throw new Error(
          intl.formatMessage(messages.failedToDeleteJob, { status: response.status }),
        );
      }
    },
    onSuccess: async () => {
      setDeleteDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
      toast.success(intl.formatMessage(messages.crowdinTaskDeleted));
      router.push(buildJobsListHref(organizationSlug, projectId));
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : intl.formatMessage(messages.failedToDeleteJobFallback),
      );
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
            <AlertDialogTitle>
              <FormattedMessage {...messages.deleteCrowdinTaskTitle} />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <FormattedMessage {...messages.deleteCrowdinTaskDescription} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteJob.isPending}>
              <FormattedMessage {...messages.keepTask} />
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteJob.isPending}
              onClick={() => deleteJob.mutate()}
            >
              {deleteJob.isPending ? (
                <FormattedMessage {...messages.deleting} />
              ) : (
                <FormattedMessage {...messages.deleteTask} />
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
