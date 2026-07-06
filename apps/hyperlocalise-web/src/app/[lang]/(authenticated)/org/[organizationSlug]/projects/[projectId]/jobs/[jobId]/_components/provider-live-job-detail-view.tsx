"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { LinkSquare02Icon, RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ListIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildJobCatHref, canOpenJobCat } from "@/lib/projects/job-cat-routing";
import type { TmsProviderLiveJobDetail } from "@/lib/providers/jobs/tms-provider-live";

import { getProviderPayloadString } from "../../../../../jobs/_components/provider-crowdin-job-display";

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

export type ProviderLiveDescriptionFieldRenderer = JobDetailTaskDescriptionRenderer;

export type ProviderLiveFilesSectionRenderer = (props: {
  job: TmsProviderLiveJobDetail;
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) => ReactNode;

export function ProviderLiveJobDetailView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  canEditProviderJobDescription = false,
  error,
  isLoading,
  isRefreshing = false,
  job,
  jobId,
  localeReadinessLoading = false,
  localeReadinessOverride,
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
  canEditProviderJobDescription?: boolean;
  error?: unknown;
  isLoading: boolean;
  isRefreshing?: boolean;
  job?: TmsProviderLiveJobDetail;
  jobId: string;
  localeReadinessLoading?: boolean;
  localeReadinessOverride?: Record<string, unknown> | null;
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
  const providerDescription = job
    ? (getProviderPayloadString(job.externalProviderPayload, "description") ?? "")
    : "";
  const canEditProviderDescription = Boolean(
    job && canEditProviderJobDescription && job.id.startsWith("ext:"),
  );
  const catHref = job ? buildJobCatHref(organizationSlug, projectId, job) : null;
  const showViewStrings = job ? canOpenJobCat(job) && Boolean(catHref) : false;
  const layout = job
    ? jobDetailTaskLayoutFromLiveJob(job, {
        localeReadinessLoading,
        localeReadinessOverride,
      })
    : null;

  const headerActions = job ? (
    <>
      {job.externalUrl ? (
        renderExternalLink ? (
          renderExternalLink({
            href: job.externalUrl,
            label: `Open in ${job.externalProviderKind}`,
          })
        ) : (
          <Button
            nativeButton={false}
            render={
              <a href={job.externalUrl} target="_blank" rel="noreferrer noopener">
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.8} />
                Open in {job.externalProviderKind}
              </a>
            }
            size="sm"
            variant="outline"
          />
        )
      ) : null}
      {onRefresh ? (
        <Button size="sm" variant="outline" disabled={isRefreshing} onClick={onRefresh}>
          <HugeiconsIcon icon={RefreshIcon} strokeWidth={1.8} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      ) : null}
      {showViewStrings && catHref ? (
        <Button size="sm" render={<Link href={catHref} />}>
          <ListIcon />
          View strings
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
      title={layout?.title}
      metrics={layout?.metrics ?? []}
      properties={layout?.properties ?? []}
      secondaryProperties={layout?.secondaryProperties ?? []}
      headerActions={headerActions}
      isLoading={isLoading}
      error={error}
      renderBackLink={renderBackLink}
      renderError={renderError}
      description={providerDescription}
      canEditDescription={canEditProviderDescription}
      renderDescriptionField={renderDescriptionField}
      renderFilesSection={filesRenderer}
      showComments={showComments}
    />
  );
}
