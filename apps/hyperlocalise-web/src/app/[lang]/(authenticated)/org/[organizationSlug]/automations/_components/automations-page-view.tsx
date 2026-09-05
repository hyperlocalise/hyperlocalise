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
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Add01Icon, FlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import { cn } from "@/lib/primitives/cn";
import type {
  WorkspaceAutomationTemplate,
  WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { AutomationTemplateFlow, AutomationTemplateTriggerIcon } from "./automation-template-flow";
import type { GithubAutoReviewSettingsDto, GithubAutoReviewSettingsWrite } from "./automations-api";
import { automationsPageViewMessages } from "./automations-page-view.messages";
import {
  formatAutomationRelativeTimestamp,
  resolveAutomationCreatorName,
  resolveAutomationPageStats,
  resolveAutomationTools,
  resolveAutomationTriggerLabel,
  resolveSortedAutomationTemplates,
  resolveTemplateCategoryTabs,
  resolveVisibleAutomations,
} from "./automations-page-view-model";
import { GithubAutoReviewCard } from "./github-auto-review-card";

const AUTOMATION_LIST_GRID_CLASS =
  "grid min-w-[52rem] grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.55fr)_minmax(0,0.8fr)_minmax(0,0.45fr)] gap-4";

const TEMPLATE_CATEGORY_MESSAGES = {
  popular: automationsPageViewMessages.categoryPopular,
  "source-content": automationsPageViewMessages.categorySourceContent,
  marketing: automationsPageViewMessages.categoryMarketing,
  "translation-delivery": automationsPageViewMessages.categoryTranslationDelivery,
  quality: automationsPageViewMessages.categoryQuality,
  release: automationsPageViewMessages.categoryRelease,
} as const;

function AutomationListSkeleton() {
  const intl = useIntl();

  return (
    <div
      aria-busy="true"
      aria-label={intl.formatMessage(automationsPageViewMessages.loadingAutomations)}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className={`${AUTOMATION_LIST_GRID_CLASS} border-b border-border px-4 py-4 last:border-b-0`}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <Skeleton className="h-4 w-3/5 rounded-full bg-muted" />
            <Skeleton className="h-3 w-2/5 rounded-full bg-muted" />
          </div>
          <div className="flex flex-wrap gap-1">
            <Skeleton className="h-5 w-14 rounded-full bg-muted" />
            <Skeleton className="h-5 w-12 rounded-full bg-muted" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full bg-muted" />
          <Skeleton className="h-4 w-24 rounded-full bg-muted" />
          <Skeleton className="h-4 w-8 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

export type AutomationsLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  className?: string;
}) => ReactNode;

export type AutomationsActionLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  kind?: "header" | "template";
}) => ReactNode;

function defaultRenderAutomationLink({
  href,
  children,
  className,
}: Parameters<AutomationsLinkRenderer>[0]) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function defaultRenderActionLink({
  href,
  children,
  kind = "header",
}: Parameters<AutomationsActionLinkRenderer>[0]) {
  return (
    <Button
      nativeButton={false}
      render={<Link href={href} />}
      {...(kind === "template" ? { size: "sm" as const, className: "rounded-full" } : {})}
    >
      {children}
    </Button>
  );
}

function AutomationTemplateCard({
  automationsBasePath,
  renderAutomationLink,
  template,
}: {
  automationsBasePath: string;
  renderAutomationLink: AutomationsLinkRenderer;
  template: WorkspaceAutomationTemplate;
}) {
  const card = (
    <Card
      size="sm"
      className={cn(
        "flex-row items-start gap-3.5 bg-muted px-5 py-5",
        template.activatable && "transition-colors hover:bg-subtle",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-subtle ring-1 ring-border">
        <AutomationTemplateTriggerIcon template={template} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-start gap-2">
          <CardTitle className="text-sm font-semibold">{template.name}</CardTitle>
          {template.activatable ? null : (
            <Badge variant="outline" className="shrink-0">
              <FormattedMessage {...automationsPageViewMessages.comingSoon} />
            </Badge>
          )}
        </div>
        <CardDescription className="line-clamp-2 text-pretty">
          {template.description}
        </CardDescription>
        <AutomationTemplateFlow template={template} />
      </div>
    </Card>
  );

  if (!template.activatable) {
    return card;
  }

  return renderAutomationLink({
    href: `${automationsBasePath}/new?template=${template.id}`,
    className: "rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
    children: card,
  });
}

function AutomationToolsSummary({ automation }: { automation: WorkspaceAutomationRecord }) {
  const intl = useIntl();
  const tools = resolveAutomationTools(intl, automation);

  return (
    <div className="flex flex-wrap gap-1">
      {tools.map((tool) => (
        <Badge key={tool} variant="outline">
          {tool}
        </Badge>
      ))}
    </div>
  );
}

export function AutomationsPageView({
  organizationSlug,
  projectId,
  automations,
  templates,
  isLoading,
  error,
  now,
  autoReview,
  autoReviewLoading = false,
  autoReviewError,
  autoReviewSaving = false,
  onSaveAutoReview,
  renderAutomationLink = defaultRenderAutomationLink,
  renderActionLink = defaultRenderActionLink,
  visualWorkflowsEnabled = false,
}: {
  organizationSlug: string;
  projectId?: string;
  automations: WorkspaceAutomationRecord[];
  templates: WorkspaceAutomationTemplate[];
  isLoading: boolean;
  error?: unknown;
  now?: number;
  autoReview?: GithubAutoReviewSettingsDto | null;
  autoReviewLoading?: boolean;
  autoReviewError?: unknown;
  autoReviewSaving?: boolean;
  onSaveAutoReview?: (input: GithubAutoReviewSettingsWrite) => Promise<void>;
  renderAutomationLink?: AutomationsLinkRenderer;
  renderActionLink?: AutomationsActionLinkRenderer;
  visualWorkflowsEnabled?: boolean;
}) {
  const intl = useIntl();
  const [templateCategoryFilter, setTemplateCategoryFilter] =
    useState<WorkspaceAutomationTemplateCategory>("popular");
  const automationsBasePath = buildAutomationsPath(organizationSlug, { projectId });

  const visibleAutomations = useMemo(
    () => resolveVisibleAutomations(automations, projectId),
    [automations, projectId],
  );
  const stats = useMemo(() => resolveAutomationPageStats(visibleAutomations), [visibleAutomations]);
  const sortedTemplates = useMemo(() => resolveSortedAutomationTemplates(templates), [templates]);
  const templateCategoryTabs = useMemo(
    () => resolveTemplateCategoryTabs(sortedTemplates),
    [sortedTemplates],
  );
  const filteredTemplates = useMemo(
    () => sortedTemplates.filter((template) => template.category === templateCategoryFilter),
    [templateCategoryFilter, sortedTemplates],
  );

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={FlashIcon}
        label={intl.formatMessage(
          projectId
            ? automationsPageViewMessages.pageLabelProject
            : automationsPageViewMessages.pageLabel,
        )}
        title={intl.formatMessage(automationsPageViewMessages.pageTitle)}
        description={intl.formatMessage(automationsPageViewMessages.pageDescription)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {visualWorkflowsEnabled && !projectId ? (
              <Button
                nativeButton={false}
                render={<Link href={`/org/${organizationSlug}/automations/visual-workflows`} />}
                variant="outline"
              >
                <FormattedMessage
                  defaultMessage="Visual workflows"
                  id="zK2bwfb+JP"
                  description="Link from automations list to visual workflows"
                />
              </Button>
            ) : null}
            {renderActionLink({
              href: `${automationsBasePath}/new`,
              kind: "header",
              children: (
                <>
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                  <FormattedMessage {...automationsPageViewMessages.newAutomation} />
                </>
              ),
            })}
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>
              <FormattedMessage {...automationsPageViewMessages.totalAutomations} />
            </CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              <FormattedMessage {...automationsPageViewMessages.activeCount} />
            </CardDescription>
            <CardTitle className="text-3xl">{stats.active}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              <FormattedMessage {...automationsPageViewMessages.pausedCount} />
            </CardDescription>
            <CardTitle className="text-3xl">{stats.paused}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      {projectId ? null : (
        <GithubAutoReviewCard
          organizationSlug={organizationSlug}
          settings={autoReview}
          isLoading={autoReviewLoading}
          error={autoReviewError}
          isSaving={autoReviewSaving}
          onSave={onSaveAutoReview}
        />
      )}

      <section className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-xl border border-border">
          <div
            className={`${AUTOMATION_LIST_GRID_CLASS} border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground`}
          >
            <span>
              <FormattedMessage {...automationsPageViewMessages.columnAutomation} />
            </span>
            <span>
              <FormattedMessage {...automationsPageViewMessages.columnTools} />
            </span>
            <span>
              <FormattedMessage {...automationsPageViewMessages.columnStatus} />
            </span>
            <span>
              <FormattedMessage {...automationsPageViewMessages.columnCreator} />
            </span>
            <span>
              <FormattedMessage {...automationsPageViewMessages.columnCreated} />
            </span>
          </div>
          {isLoading ? (
            <AutomationListSkeleton />
          ) : error ? (
            <div className="px-4 py-10">
              <TypographyP className="text-flame-100" size="small" weight="medium">
                <FormattedMessage {...automationsPageViewMessages.loadError} />
              </TypographyP>
              <TypographyP className="mt-1" size="xsmall" tone="subtle">
                {error instanceof Error
                  ? error.message
                  : intl.formatMessage(automationsPageViewMessages.loadErrorFallback)}
              </TypographyP>
            </div>
          ) : visibleAutomations.length === 0 ? (
            <div className="px-4 py-10 text-sm text-muted-foreground">
              <FormattedMessage {...automationsPageViewMessages.emptyList} />
            </div>
          ) : (
            visibleAutomations.map((automation) => (
              <Fragment key={automation.id}>
                {renderAutomationLink({
                  href: `${automationsBasePath}/${automation.id}`,
                  className: `${AUTOMATION_LIST_GRID_CLASS} border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted`,
                  children: (
                    <>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{automation.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {resolveAutomationTriggerLabel(intl, automation.triggerConfig)}
                        </p>
                      </div>
                      <AutomationToolsSummary automation={automation} />
                      <Badge variant={automation.status === "active" ? "default" : "secondary"}>
                        {automation.status === "active" ? (
                          <FormattedMessage {...automationsPageViewMessages.statusActive} />
                        ) : (
                          <FormattedMessage {...automationsPageViewMessages.statusPaused} />
                        )}
                      </Badge>
                      <span className="truncate text-sm text-muted-foreground">
                        {resolveAutomationCreatorName(intl, automation)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatAutomationRelativeTimestamp(intl, automation.createdAt, now)}
                      </span>
                    </>
                  ),
                })}
              </Fragment>
            ))
          )}
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-4">
        <div>
          <h2 className="font-sans text-base font-medium text-balance text-foreground">
            <FormattedMessage {...automationsPageViewMessages.templatesTitle} />
          </h2>
          <TypographyP tone="subtle">
            <FormattedMessage {...automationsPageViewMessages.templatesDescription} />
          </TypographyP>
        </div>
        <Tabs
          value={templateCategoryFilter}
          onValueChange={(value) =>
            setTemplateCategoryFilter(value as WorkspaceAutomationTemplateCategory)
          }
          className="gap-5"
        >
          <TabsList>
            {templateCategoryTabs.map((category) => (
              <TabsTrigger key={category.id} value={category.id}>
                <FormattedMessage {...TEMPLATE_CATEGORY_MESSAGES[category.id]} />
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => (
              <AutomationTemplateCard
                key={template.id}
                automationsBasePath={automationsBasePath}
                renderAutomationLink={renderAutomationLink}
                template={template}
              />
            ))}
          </div>
        </Tabs>
      </section>
    </WorkspacePageShell>
  );
}
