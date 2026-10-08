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
import { OrgNavLink } from "@/components/app-shell/org-nav-link";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PlusIcon, LightningIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl } from "react-intl";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
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
import {
  isContentSyncAutomation,
  type WorkspaceAutomationRecord,
} from "@/lib/agents/workspace-automation-types";
import type { AiFeaturesAccessStatus } from "@/lib/billing/use-ai-features-access";

import { PageHeader, WorkspacePageShell } from "../../_components/workspace-resource-shared";
import { AutomationAssistantPrompt } from "./automation-assistant-prompt";
import {
  AutomationTemplateCard,
  defaultRenderAutomationLink,
  type AutomationsLinkRenderer,
} from "./automation-template-card";
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

export type AutomationsActionLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  kind?: "header" | "template" | "scratch";
}) => ReactNode;

export const AUTOMATIONS_ACTION_LINK_BUTTON_PROPS = {
  header: {},
  template: { size: "sm", className: "rounded-full" },
  scratch: { variant: "outline", className: "shrink-0 rounded-full" },
} as const;

/** The address of the section where a new automation is started: `…/automations#new-automation`. */
export const NEW_AUTOMATION_SECTION_ID = "new-automation";

function defaultRenderActionLink({
  href,
  children,
  kind = "header",
}: Parameters<AutomationsActionLinkRenderer>[0]) {
  return (
    <Button
      nativeButton={false}
      render={<OrgNavLink href={href} />}
      {...AUTOMATIONS_ACTION_LINK_BUTTON_PROPS[kind]}
    >
      {children}
    </Button>
  );
}

/** Brings the new-automation section into view and puts the cursor in its prompt box. */
function revealNewAutomationSection(
  section: HTMLElement | null,
  prompt: HTMLTextAreaElement | null,
) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  prompt?.focus({ preventScroll: true });
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

/**
 * What the page needs to offer the setup assistant. With it, a new automation is started from a
 * section of this page; left out, the page is the list and the templates, as it was before.
 */
export type AutomationsPageAssistant = {
  aiFeaturesStatus: AiFeaturesAccessStatus;
  /** The request was sent and the setup page is opening. */
  pending: boolean;
  onSubmitPrompt: (text: string) => void;
};

export function AutomationsPageView({
  organizationSlug,
  projectId,
  automations,
  templates,
  assistant,
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
  assistant?: AutomationsPageAssistant;
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
    () =>
      resolveVisibleAutomations(automations, projectId).filter(
        (automation) => !isContentSyncAutomation(automation),
      ),
    [automations, projectId],
  );
  const stats = useMemo(
    () => resolveAutomationPageStats(resolveVisibleAutomations(automations, projectId)),
    [automations, projectId],
  );
  const hasNewAutomationSection = assistant !== undefined;
  const assistantUsable = assistant?.aiFeaturesStatus === "allowed";
  // Without a usable assistant there is no prompt box to go to, so the button opens the editor.
  const newAutomationJumpsToSection =
    hasNewAutomationSection && assistant.aiFeaturesStatus !== "denied";
  const newAutomationSectionRef = useRef<HTMLElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const sortedTemplates = useMemo(
    () => resolveSortedAutomationTemplates(templates, { usableFirst: hasNewAutomationSection }),
    [hasNewAutomationSection, templates],
  );
  const templateCategoryTabs = useMemo(
    () => resolveTemplateCategoryTabs(sortedTemplates),
    [sortedTemplates],
  );
  const filteredTemplates = useMemo(
    () => sortedTemplates.filter((template) => template.category === templateCategoryFilter),
    [templateCategoryFilter, sortedTemplates],
  );

  // In a workspace with no automations the section takes the place of the empty list.
  const listReplacedByNewAutomationSection =
    hasNewAutomationSection && !isLoading && !error && visibleAutomations.length === 0;

  // A link to the section's address lands before the list has loaded and pushed the section down.
  useEffect(() => {
    if (assistantUsable && !isLoading && window.location.hash === `#${NEW_AUTOMATION_SECTION_ID}`) {
      revealNewAutomationSection(newAutomationSectionRef.current, promptRef.current);
    }
  }, [assistantUsable, isLoading]);

  const templateTabs = (
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
  );

  return (
    <WorkspacePageShell>
      <PageHeader
        icon={LightningIcon}
        label={intl.formatMessage(
          projectId
            ? automationsPageViewMessages.pageLabelProject
            : automationsPageViewMessages.pageLabel,
        )}
        title={intl.formatMessage(automationsPageViewMessages.pageTitle)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {visualWorkflowsEnabled && !projectId ? (
              <Button
                nativeButton={false}
                render={
                  <OrgNavLink href={`/org/${organizationSlug}/automations/visual-workflows`} />
                }
                variant="outline"
              >
                <FormattedMessage
                  defaultMessage="Visual workflows"
                  id="zK2bwfb+JP"
                  description="Link from automations list to visual workflows"
                />
              </Button>
            ) : null}
            {newAutomationJumpsToSection ? (
              <Button
                onClick={() =>
                  revealNewAutomationSection(newAutomationSectionRef.current, promptRef.current)
                }
              >
                <PlusIcon />
                <FormattedMessage {...automationsPageViewMessages.newAutomation} />
              </Button>
            ) : (
              renderActionLink({
                href: `${automationsBasePath}/new`,
                kind: "header",
                children: (
                  <>
                    <PlusIcon />
                    <FormattedMessage {...automationsPageViewMessages.newAutomation} />
                  </>
                ),
              })
            )}
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

      {listReplacedByNewAutomationSection ? null : (
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
                            {resolveAutomationTriggerLabel(
                              intl,
                              automation.triggerConfig,
                              automation,
                            )}
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
      )}

      {assistant ? (
        <section
          ref={newAutomationSectionRef}
          id={NEW_AUTOMATION_SECTION_ID}
          aria-labelledby={`${NEW_AUTOMATION_SECTION_ID}-title`}
          className="mt-6 flex scroll-mt-4 flex-col gap-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <h2
                id={`${NEW_AUTOMATION_SECTION_ID}-title`}
                className="font-sans text-base font-medium text-balance text-foreground"
              >
                <FormattedMessage {...automationsPageViewMessages.newAutomationSectionTitle} />
              </h2>
              {assistant.aiFeaturesStatus === "denied" ? null : (
                <TypographyP tone="subtle">
                  <FormattedMessage
                    {...automationsPageViewMessages.newAutomationSectionDescription}
                  />
                </TypographyP>
              )}
            </div>
            {renderActionLink({
              href: `${automationsBasePath}/new`,
              kind: "scratch",
              children: <FormattedMessage {...automationsPageViewMessages.startFromScratch} />,
            })}
          </div>
          <AutomationAssistantPrompt
            aiFeaturesStatus={assistant.aiFeaturesStatus}
            inputRef={promptRef}
            onSubmitPrompt={assistant.onSubmitPrompt}
            organizationSlug={organizationSlug}
            pending={assistant.pending}
          />
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span aria-hidden className="h-px flex-1 bg-border" />
            <FormattedMessage {...automationsPageViewMessages.orPickTemplate} />
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          {templateTabs}
        </section>
      ) : (
        <section className="mt-6 flex flex-col gap-4">
          <div>
            <h2 className="font-sans text-base font-medium text-balance text-foreground">
              <FormattedMessage {...automationsPageViewMessages.templatesTitle} />
            </h2>
            <TypographyP tone="subtle">
              <FormattedMessage {...automationsPageViewMessages.templatesDescription} />
            </TypographyP>
          </div>
          {templateTabs}
        </section>
      )}
    </WorkspacePageShell>
  );
}
