"use client";

import { useState, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyH4 } from "@/components/ui/typography";

import {
  defaultRenderBackLink,
  defaultRenderError,
  type JobDetailBackLinkRenderer,
  type JobDetailErrorRenderer,
} from "./job-detail-shared";
import { buildJobsListHref } from "./job-detail-types";
import {
  JobDetailView,
  type JobDetailViewMetric,
  type JobDetailViewProperty,
} from "./job-detail-view";
import { TmsLiveJobCommentsSection } from "./tms/tms-live-job-comments-section";

export type JobDetailTaskDescriptionRenderer = (props: {
  description: string;
  editable: boolean;
}) => ReactNode;

export type JobDetailTaskFilesRenderer = (props: {
  jobId: string;
  organizationSlug: string;
  projectId: string;
}) => ReactNode;

export type JobDetailTaskCommentsRenderer = (props: {
  jobId: string;
  organizationSlug: string;
}) => ReactNode;

type JobDetailTaskTab = "overview" | "files" | "comments";

export function JobDetailTaskView({
  buildJobsListHref: buildJobsListHrefProp = buildJobsListHref,
  canEditDescription = false,
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
  renderCommentsSection,
  secondaryProperties = [],
  showComments = false,
  title,
}: {
  buildJobsListHref?: typeof buildJobsListHref;
  canEditDescription?: boolean;
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
  renderCommentsSection?: JobDetailTaskCommentsRenderer;
  secondaryProperties?: JobDetailViewProperty[];
  showComments?: boolean;
  title?: string;
}) {
  const [activeTab, setActiveTab] = useState<JobDetailTaskTab>("overview");

  const showDescriptionSection =
    description.trim().length > 0 || (canEditDescription && renderDescriptionField);
  const hasFilesTab = Boolean(renderFilesSection);
  const hasCommentsTab = showComments;
  const useTabs = hasFilesTab || hasCommentsTab;

  const descriptionSection =
    showDescriptionSection && renderDescriptionField ? (
      <section>
        <TypographyH4>Description</TypographyH4>
        <div className="mt-4">
          {renderDescriptionField({
            description,
            editable: canEditDescription,
          })}
        </div>
      </section>
    ) : null;

  const filesSection =
    hasFilesTab && activeTab === "files"
      ? renderFilesSection?.({ jobId, organizationSlug, projectId })
      : null;

  const commentsSection =
    hasCommentsTab && activeTab === "comments"
      ? (renderCommentsSection?.({ jobId, organizationSlug }) ?? (
          <TmsLiveJobCommentsSection organizationSlug={organizationSlug} encodedJobId={jobId} />
        ))
      : null;

  const mainContent = useTabs ? (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as JobDetailTaskTab)}
      className="gap-4"
    >
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        {hasFilesTab ? <TabsTrigger value="files">Files</TabsTrigger> : null}
        {hasCommentsTab ? <TabsTrigger value="comments">Comments</TabsTrigger> : null}
      </TabsList>

      <TabsContent value="overview" className="space-y-8">
        {descriptionSection}
        {renderExtraMain?.()}
      </TabsContent>

      {hasFilesTab ? (
        <TabsContent value="files" className="space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            filesSection
          )}
        </TabsContent>
      ) : null}

      {hasCommentsTab ? (
        <TabsContent value="comments" className="space-y-4">
          {commentsSection}
        </TabsContent>
      ) : null}
    </Tabs>
  ) : (
    <>
      {descriptionSection}
      {renderExtraMain?.()}
    </>
  );

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
      renderMain={() => mainContent}
    />
  );
}
