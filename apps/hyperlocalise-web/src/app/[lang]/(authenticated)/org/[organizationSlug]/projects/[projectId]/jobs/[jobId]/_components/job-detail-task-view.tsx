"use client";

import { type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { TypographyH4 } from "@/components/ui/typography";
import type { TmsProviderLiveJobComment } from "@/lib/providers/tms-provider-live";

import {
  defaultRenderBackLink,
  defaultRenderError,
  type JobDetailBackLinkRenderer,
  type JobDetailErrorRenderer,
} from "./job-detail-shared";
import { buildJobsListHref, formatJobDetailDate } from "./job-detail-types";
import {
  JobDetailView,
  type JobDetailViewMetric,
  type JobDetailViewProperty,
} from "./job-detail-view";

export type JobDetailTaskDescriptionRenderer = (props: {
  description: string;
  editable: boolean;
}) => ReactNode;

export type JobDetailTaskFilesRenderer = (props: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) => ReactNode;

function formatTimeSpent(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return null;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function TaskCommentsSection({
  comments,
  isError,
  isLoading,
}: {
  comments: TmsProviderLiveJobComment[];
  isError: boolean;
  isLoading: boolean;
}) {
  return (
    <section>
      <TypographyH4>Comments</TypographyH4>

      {isLoading ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {isError ? (
        <p className="mt-4 text-sm text-flame-100">Unable to load task comments.</p>
      ) : null}

      {!isLoading && !isError && comments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No comments yet.</p>
      ) : null}

      {!isLoading && !isError && comments.length > 0 ? (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
          {comments.map((comment) => {
            const timeSpent = formatTimeSpent(comment.timeSpentSeconds);

            return (
              <li key={comment.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">User {comment.userId}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatJobDetailDate(comment.createdAt)}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {comment.text}
                </p>
                {timeSpent ? (
                  <p className="mt-2 text-xs text-muted-foreground">Time spent: {timeSpent}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function JobDetailTaskView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  canEditDescription = false,
  comments = [],
  commentsError,
  commentsLoading = false,
  description = "",
  error,
  headerActions,
  isLoading,
  jobId,
  metrics = [],
  organizationSlug,
  projectId,
  properties,
  renderBackLink = defaultRenderBackLink,
  renderDescriptionField,
  renderError = defaultRenderError,
  renderExtraMain,
  renderFilesSection,
  secondaryProperties = [],
  showComments = false,
  title,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  canEditDescription?: boolean;
  comments?: TmsProviderLiveJobComment[];
  commentsError?: unknown;
  commentsLoading?: boolean;
  description?: string;
  error?: unknown;
  headerActions?: ReactNode;
  isLoading: boolean;
  jobId: string;
  metrics?: JobDetailViewMetric[];
  organizationSlug: string;
  projectId: string;
  properties: JobDetailViewProperty[];
  renderBackLink?: JobDetailBackLinkRenderer;
  renderDescriptionField?: JobDetailTaskDescriptionRenderer;
  renderError?: JobDetailErrorRenderer;
  renderExtraMain?: () => ReactNode;
  renderFilesSection?: JobDetailTaskFilesRenderer;
  secondaryProperties?: JobDetailViewProperty[];
  showComments?: boolean;
  title?: string;
}) {
  const showDescriptionSection =
    description.trim().length > 0 || (canEditDescription && renderDescriptionField);

  return (
    <JobDetailView
      buildJobsListHref={buildJobsListHrefProp}
      jobId={jobId}
      organizationSlug={organizationSlug}
      projectId={projectId}
      title={title}
      metrics={metrics}
      properties={properties}
      secondaryProperties={secondaryProperties}
      headerActions={headerActions}
      isLoading={isLoading}
      error={error}
      renderBackLink={renderBackLink}
      renderError={renderError}
      renderMain={() => (
        <>
          {showDescriptionSection && renderDescriptionField ? (
            <section>
              <TypographyH4>Description</TypographyH4>
              <div className="mt-4">
                {renderDescriptionField({
                  description,
                  editable: canEditDescription,
                })}
              </div>
            </section>
          ) : null}

          {renderFilesSection ? renderFilesSection({ jobId, organizationSlug, projectId }) : null}

          {renderExtraMain?.()}

          {showComments ? (
            <TaskCommentsSection
              comments={comments}
              isError={Boolean(commentsError)}
              isLoading={commentsLoading}
            />
          ) : null}
        </>
      )}
    />
  );
}
