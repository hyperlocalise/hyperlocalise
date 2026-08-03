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
import Link from "next/link";
import { type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LinkSquare02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client-instance";
import { buildJobCatHref, canOpenJobCat } from "@/lib/projects/job-cat-routing";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/jobs/tms-provider-live";
import { parseProviderJobId } from "@/lib/providers/jobs/tms-provider-resource-id";

import { getProviderPayloadString } from "../../../../../jobs/_components/provider-crowdin-job-display";

import { CrowdinJobAssigneesField } from "./job-detail-assignee-field";
import { JobDetailEditableTitle } from "./job-detail-editable-title";
import {
  defaultRenderBackLink,
  defaultRenderError,
  type JobDetailBackLinkRenderer,
  type JobDetailErrorRenderer,
} from "./job-detail-shared";
import {
  JobDetailTaskView,
  type JobDetailTaskDescriptionRenderer,
  type JobDetailTaskFilesRenderer,
} from "./job-detail-task-view";
import { buildJobsListHref } from "./job-detail-types";
import { jobDetailTaskLayoutFromLiveJob } from "./job-detail-layout-helpers";
import { providerLiveJobDetailViewMessages as messages } from "./provider-live-job-detail-view.messages";

function readAssigneeExternalUserIds(payload: Record<string, unknown> | null | undefined) {
  const value = payload?.assigneeExternalUserIds;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export type ProviderLiveDescriptionFieldRenderer = JobDetailTaskDescriptionRenderer;

export type ProviderLiveFilesSectionRenderer = (props: {
  job: TmsProviderLiveJobDetail;
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) => ReactNode;

export function ProviderLiveJobDetailView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  canEditJobFields = false,
  error,
  isLoading,
  isRefreshing = false,
  job,
  jobId,
  localeReadinessLoading = false,
  localeReadinessOverride,
  onDelete,
  isDeleting = false,
  onRefresh,
  organizationSlug,
  projectId,
  renderBackLink = defaultRenderBackLink,
  renderDescriptionField,
  renderError = defaultRenderError,
  renderExternalLink,
  renderFilesSection,
  showComments = false,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  canEditJobFields?: boolean;
  error?: unknown;
  isLoading: boolean;
  isRefreshing?: boolean;
  isDeleting?: boolean;
  job?: TmsProviderLiveJobDetail;
  jobId: string;
  localeReadinessLoading?: boolean;
  localeReadinessOverride?: Record<string, unknown> | null;
  onDelete?: () => void;
  onRefresh?: () => void;
  organizationSlug: string;
  projectId: string;
  renderBackLink?: JobDetailBackLinkRenderer;
  renderDescriptionField?: ProviderLiveDescriptionFieldRenderer;
  renderError?: JobDetailErrorRenderer;
  renderExternalLink?: (props: { href: string; label: string }) => ReactNode;
  renderFilesSection?: ProviderLiveFilesSectionRenderer;
  showComments?: boolean;
}) {
  const intl = useIntl();
  const queryClient = useQueryClient();
  const jobQueryKey = ["tms-provider-job", organizationSlug, jobId] as const;
  const parsedJobId = parseProviderJobId(jobId);
  const providerDescription = job
    ? (getProviderPayloadString(job.externalProviderPayload, "description") ?? "")
    : "";
  const canEditProviderFields = Boolean(
    job &&
    canEditJobFields &&
    job.id.startsWith("ext:") &&
    (job.externalProviderKind === "crowdin" || job.externalProviderKind === "smartling"),
  );
  const canEditAssignees = Boolean(
    canEditProviderFields && job?.externalProviderKind === "crowdin" && parsedJobId,
  );
  const catHref = job ? buildJobCatHref(organizationSlug, projectId, job) : null;
  const showViewStrings = job ? canOpenJobCat(job) && Boolean(catHref) : false;
  const layout = job
    ? jobDetailTaskLayoutFromLiveJob(job, intl, {
        localeReadinessLoading,
        localeReadinessOverride,
      })
    : null;

  const saveTitle = useMutation({
    mutationFn: async (nextTitle: string) => {
      const response = await apiClient.api.orgs[":organizationSlug"]["tms-provider"].jobs[
        ":encodedJobId"
      ].$patch({
        param: { organizationSlug, encodedJobId: jobId },
        json: { title: nextTitle },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        throw new Error(body?.message ?? body?.error ?? `Save failed (${response.status})`);
      }
      const body = (await response.json()) as { job: TmsProviderLiveJobDetail };
      return body.job;
    },
    onSuccess: async (updatedJob) => {
      queryClient.setQueryData(jobQueryKey, updatedJob);
      await queryClient.invalidateQueries({ queryKey: ["jobs", organizationSlug] });
    },
    onError: (saveError) => {
      toast.error(saveError instanceof Error ? saveError.message : "Couldn't save title");
    },
  });

  const properties = (layout?.properties ?? []).map((property) => {
    if (property.id !== "assignees" || !canEditAssignees || !job || !parsedJobId) {
      return property;
    }
    return {
      ...property,
      value: (
        <CrowdinJobAssigneesField
          organizationSlug={organizationSlug}
          encodedJobId={jobId}
          externalProjectId={parsedJobId.externalProjectId}
          selectedExternalUserIds={readAssigneeExternalUserIds(job.externalProviderPayload)}
          fallbackLabels={job.externalAssignedUsers ?? []}
          queryKey={jobQueryKey}
          disabled={isRefreshing || isDeleting}
        />
      ),
    };
  });

  const headerActions = job ? (
    <>
      {job.externalUrl ? (
        renderExternalLink ? (
          renderExternalLink({
            href: job.externalUrl,
            label: intl.formatMessage(messages.openInProvider, {
              providerKind: job.externalProviderKind,
            }),
          })
        ) : (
          <Button
            nativeButton={false}
            render={
              <a href={job.externalUrl} target="_blank" rel="noreferrer noopener">
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} />
                <FormattedMessage
                  {...messages.openInProvider}
                  values={{ providerKind: job.externalProviderKind }}
                />
              </a>
            }
            size="sm"
            variant="outline"
          />
        )
      ) : null}
      {onRefresh ? (
        <Button
          size="sm"
          variant="outline"
          disabled={isRefreshing || isDeleting}
          onClick={onRefresh}
        >
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          {isRefreshing ? (
            <FormattedMessage {...messages.refreshing} />
          ) : (
            <FormattedMessage {...messages.refresh} />
          )}
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={isRefreshing || isDeleting}
          onClick={onDelete}
        >
          {isDeleting ? (
            <FormattedMessage {...messages.deleting} />
          ) : (
            <FormattedMessage {...messages.deleteTask} />
          )}
        </Button>
      ) : null}
      {showViewStrings && catHref ? (
        <Button size="sm" render={<Link href={catHref} />}>
          <ListIcon />
          <FormattedMessage {...messages.viewStrings} />
        </Button>
      ) : null}
    </>
  ) : null;

  const filesRenderer: JobDetailTaskFilesRenderer | undefined = renderFilesSection
    ? ({ jobId: encodedJobId, organizationSlug: orgSlug, projectId: projId }) =>
        renderFilesSection({
          job: job!,
          jobId: encodedJobId,
          organizationSlug: orgSlug,
          projectId: projId,
        })
    : undefined;

  return (
    <JobDetailTaskView
      buildJobsListHref={buildJobsListHrefProp}
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      title={
        <JobDetailEditableTitle
          title={layout?.title ?? jobId}
          editable={canEditProviderFields}
          disabled={isRefreshing || isDeleting || saveTitle.isPending}
          onSave={async (nextTitle) => {
            await saveTitle.mutateAsync(nextTitle);
          }}
        />
      }
      metrics={layout?.metrics ?? []}
      properties={properties}
      secondaryProperties={layout?.secondaryProperties ?? []}
      headerActions={headerActions}
      isLoading={isLoading}
      error={error}
      renderBackLink={renderBackLink}
      renderError={renderError}
      description={providerDescription}
      canEditDescription={canEditProviderFields}
      renderDescriptionField={renderDescriptionField}
      renderFilesSection={filesRenderer}
      showComments={showComments}
    />
  );
}
