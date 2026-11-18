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
import { useState, type ReactNode } from "react";
import { PlusIcon } from "@phosphor-icons/react";
import { FormattedMessage } from "react-intl";

import { Button } from "@/components/ui/button";

import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyH4 } from "@/components/ui/typography";

import {
  defaultRenderError,
  type JobDetailBackLinkRenderer,
  type JobDetailErrorRenderer,
} from "./job-detail-shared";
import { jobDetailTaskViewMessages as messages } from "./job-detail-task-view.messages";
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
  /** Open straight into the editor, after "Add description" was chosen. */
  startEditing?: boolean;
  /** Called when editing is cancelled, so an empty description can collapse again. */
  onCancel?: () => void;
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

type JobDetailTaskTab = "overview" | "files" | "comments" | "report";

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
  renderBackLink,
  renderDescriptionField,
  renderError = defaultRenderError,
  renderExtraMain,
  renderFilesSection,
  renderCommentsSection,
  renderReportSection,
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
  /** The task's own report, on a Report tab rendered only while it is open. */
  renderReportSection?: () => ReactNode;
  secondaryProperties?: JobDetailViewProperty[];
  showComments?: boolean;
  title?: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<JobDetailTaskTab>("overview");
  const [addingDescription, setAddingDescription] = useState(false);

  const hasDescription = description.trim().length > 0;
  const canAddDescription =
    !hasDescription && canEditDescription && Boolean(renderDescriptionField);
  const showDescriptionSection = hasDescription || (canAddDescription && addingDescription);
  const hasFilesTab = Boolean(renderFilesSection);
  const hasCommentsTab = showComments;
  const hasReportTab = Boolean(renderReportSection);
  const useTabs = hasFilesTab || hasCommentsTab || hasReportTab;

  const descriptionSection =
    showDescriptionSection && renderDescriptionField ? (
      <section>
        <TypographyH4>
          <FormattedMessage {...messages.descriptionHeading} />
        </TypographyH4>
        <div className="mt-4">
          {renderDescriptionField({
            description,
            editable: canEditDescription,
            startEditing: !hasDescription,
            onCancel: () => setAddingDescription(false),
          })}
        </div>
      </section>
    ) : canAddDescription ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ms-2 w-fit text-muted-foreground"
        onClick={() => setAddingDescription(true)}
      >
        <PlusIcon data-icon="inline-start" />
        <FormattedMessage {...messages.addDescription} />
      </Button>
    ) : null;

  const filesSection =
    hasFilesTab && activeTab === "files" && !isLoading
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
        <TabsTrigger value="overview" className="flex-none px-3">
          <FormattedMessage {...messages.overviewTab} />
        </TabsTrigger>
        {hasFilesTab ? (
          <TabsTrigger value="files" className="flex-none px-3">
            <FormattedMessage {...messages.filesTab} />
          </TabsTrigger>
        ) : null}
        {hasCommentsTab ? (
          <TabsTrigger value="comments" className="flex-none px-3">
            <FormattedMessage {...messages.commentsTab} />
          </TabsTrigger>
        ) : null}
        {hasReportTab ? (
          <TabsTrigger value="report" className="flex-none px-3">
            <FormattedMessage {...messages.reportTab} />
          </TabsTrigger>
        ) : null}
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

      {hasReportTab ? (
        <TabsContent value="report" className="space-y-4">
          {activeTab === "report" && !isLoading ? renderReportSection?.() : null}
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
