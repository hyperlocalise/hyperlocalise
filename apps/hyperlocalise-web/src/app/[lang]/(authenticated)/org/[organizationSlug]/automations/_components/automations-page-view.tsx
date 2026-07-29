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
import { Add01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import type {
  WorkspaceAutomationTemplate,
  WorkspaceAutomationTemplateCategory,
} from "@/lib/agents/workspace-automation-templates";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automations";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { AutomationTemplateFlow } from "./automation-template-flow";
import { automationsPageViewMessages } from "./automations-page-view.messages";
import {
  formatAutomationRelativeTimestamp,
  resolveAutomationPageStats,
  resolveAutomationTools,
  resolveAutomationTriggerLabel,
  resolveSortedAutomationTemplates,
  resolveTemplateCategoryTabs,
  resolveVisibleAutomations,
} from "./automations-page-view-model";

const TEMPLATE_FILTER_TABS_CLASS =
  "h-auto flex-none rounded-full border-transparent px-3 py-1.5 text-muted-foreground shadow-none after:hidden hover:text-foreground data-active:bg-accent data-active:text-foreground dark:data-active:border-transparent dark:data-active:bg-accent";

const AUTOMATION_LIST_GRID_CLASS =
  "grid grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.5fr)] gap-4";

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
  automations,
  templates,
  isLoading,
  error,
  now,
  renderAutomationLink = defaultRenderAutomationLink,
  renderActionLink = defaultRenderActionLink,
}: {
  organizationSlug: string;
  automations: WorkspaceAutomationRecord[];
  templates: WorkspaceAutomationTemplate[];
  isLoading: boolean;
  error?: unknown;
  now?: number;
  renderAutomationLink?: AutomationsLinkRenderer;
  renderActionLink?: AutomationsActionLinkRenderer;
}) {
  const intl = useIntl();
  const [templateCategoryFilter, setTemplateCategoryFilter] =
    useState<WorkspaceAutomationTemplateCategory>("popular");

  const visibleAutomations = useMemo(() => resolveVisibleAutomations(automations), [automations]);
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
        icon={SparklesIcon}
        label={intl.formatMessage(automationsPageViewMessages.pageLabel)}
        title={intl.formatMessage(automationsPageViewMessages.pageTitle)}
        description={intl.formatMessage(automationsPageViewMessages.pageDescription)}
        actions={renderActionLink({
          href: `/org/${organizationSlug}/automations/new`,
          kind: "header",
          children: (
            <>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              <FormattedMessage {...automationsPageViewMessages.newAutomation} />
            </>
          ),
        })}
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

      <section className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-xl border border-border">
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
              <FormattedMessage {...automationsPageViewMessages.columnCreated} />
            </span>
          </div>
          {isLoading ? (
            <AutomationListSkeleton />
          ) : error ? (
            <div className="px-4 py-10">
              <TypographyP className="text-sm font-medium text-flame-100">
                <FormattedMessage {...automationsPageViewMessages.loadError} />
              </TypographyP>
              <TypographyP className="mt-1 text-xs text-muted-foreground">
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
                  href: `/org/${organizationSlug}/automations/${automation.id}`,
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
          <TypographyP className="text-muted-foreground">
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
          <TabsList
            variant="line"
            className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0"
          >
            {templateCategoryTabs.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className={TEMPLATE_FILTER_TABS_CLASS}
              >
                <FormattedMessage {...TEMPLATE_CATEGORY_MESSAGES[category.id]} />
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTemplates.map((template) => (
              <Card key={template.id} size="sm" className="gap-4 px-5 py-5">
                <AutomationTemplateFlow template={template} />
                <div className="space-y-1.5">
                  <h3 className="text-sm font-medium text-foreground">{template.name}</h3>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {template.description}
                  </p>
                </div>
                <div className="mt-auto flex items-center gap-2">
                  {template.activatable ? (
                    renderActionLink({
                      href: `/org/${organizationSlug}/automations/new?template=${template.id}`,
                      kind: "template",
                      children: <FormattedMessage {...automationsPageViewMessages.addTemplate} />,
                    })
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-full" disabled>
                      <FormattedMessage {...automationsPageViewMessages.comingSoon} />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </Tabs>
      </section>
    </WorkspacePageShell>
  );
}
