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
import { Fragment, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  ChatTextIcon,
  ClockIcon,
  FlowArrowIcon,
  GithubLogoIcon,
  HandTapIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparkleIcon,
  UploadSimpleIcon,
  WebhooksLogoIcon,
  type Icon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type MessageDescriptor } from "react-intl";

import { buildAutomationsPath } from "@/components/app-shell/navigation-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TypographyP } from "@/components/ui/typography";
import {
  isContentSyncAutomation,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationTriggerConfig,
} from "@/lib/agents/workspace-automation-types";
import type { AiFeaturesAccessStatus } from "@/lib/billing/use-ai-features-access";
import { cn } from "@/lib/primitives/cn";
import type { VisualWorkflowRecord } from "@/lib/visual-workflows/visual-workflow-types";

import {
  PageHeader,
  toneClass,
  WorkspacePageShell,
} from "../../_components/workspace-resource-shared";
import { AutomationAssistantPrompt } from "./automation-assistant-prompt";
import { AutomationIconTile } from "./automation-icon-tile";
import {
  defaultRenderAutomationLink,
  type AutomationsLinkRenderer,
} from "./automation-template-card";
import type { GithubAutoReviewSettingsDto, GithubAutoReviewSettingsWrite } from "./automations-api";
import { automationsPageViewMessages } from "./automations-page-view.messages";
import {
  filterAutomationListItems,
  formatAutomationRelativeTimestamp,
  resolveAgentAutomationSummary,
  resolveAutomationListCounts,
  resolveAutomationListItems,
  resolveVisualWorkflowSummary,
  resolveVisualWorkflowTriggerKind,
  type AutomationListFilters,
  type AutomationListItem,
  type AutomationListStatus,
  type AutomationListType,
  type VisualWorkflowTriggerKind,
} from "./automations-page-view-model";
import { GithubAutoReviewRow } from "./github-auto-review-card";

const AUTOMATION_LIST_GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_6rem_5.5rem_8rem]";

const EMPTY_FILTERS: AutomationListFilters = { status: "all", type: "all", query: "" };

const STATUS_FILTER_MESSAGES: Record<AutomationListFilters["status"], MessageDescriptor> = {
  all: automationsPageViewMessages.filterAll,
  active: automationsPageViewMessages.statusActive,
  paused: automationsPageViewMessages.statusPaused,
  draft: automationsPageViewMessages.statusDraft,
};

const STATUS_MESSAGES: Record<AutomationListStatus, MessageDescriptor> = {
  active: automationsPageViewMessages.statusActive,
  paused: automationsPageViewMessages.statusPaused,
  draft: automationsPageViewMessages.statusDraft,
};

const TYPE_FILTER_MESSAGES: Record<AutomationListFilters["type"], MessageDescriptor> = {
  all: automationsPageViewMessages.filterAllTypes,
  agent: automationsPageViewMessages.typeAgent,
  workflow: automationsPageViewMessages.typeWorkflow,
};

/** The same icons the trigger menu in the editor uses. */
const TRIGGER_MODE_ICONS: Record<WorkspaceAutomationTriggerConfig["mode"], Icon> = {
  manual: HandTapIcon,
  scheduled: ClockIcon,
  github: GithubLogoIcon,
  contentful: WebhooksLogoIcon,
  source_upload: UploadSimpleIcon,
  web_chat: ChatTextIcon,
};

const WORKFLOW_TRIGGER_ICONS: Record<VisualWorkflowTriggerKind, Icon> = {
  "trigger.manual": HandTapIcon,
  "trigger.scheduled": ClockIcon,
  "trigger.github": GithubLogoIcon,
  "trigger.source_upload": UploadSimpleIcon,
  "trigger.webhook": WebhooksLogoIcon,
  "trigger.job_changed": ArrowsClockwiseIcon,
};

export const AUTOMATION_TYPE_ICONS: Record<AutomationListType, Icon> = {
  agent: SparkleIcon,
  workflow: FlowArrowIcon,
};

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
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-7 shrink-0 rounded-md bg-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/5 rounded-full bg-muted" />
              <Skeleton className="h-3 w-2/5 rounded-full bg-muted" />
            </div>
          </div>
          <Skeleton className="hidden h-5 w-16 rounded-full bg-muted sm:block" />
          <Skeleton className="h-5 w-14 rounded-full bg-muted" />
          <Skeleton className="hidden h-4 w-12 rounded-full bg-muted sm:block" />
        </div>
      ))}
    </div>
  );
}

export type AutomationsActionLinkRenderer = (props: {
  href: string;
  children: ReactNode;
  kind?: "header" | "secondary";
}) => ReactNode;

export const AUTOMATIONS_ACTION_LINK_BUTTON_PROPS = {
  header: {},
  secondary: { variant: "outline" },
} as const;

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

function AutomationRowTriggerIcon({ item }: { item: AutomationListItem }) {
  let TriggerIcon: Icon;
  if (item.type === "workflow") {
    const triggerKind = resolveVisualWorkflowTriggerKind(item.workflow);
    TriggerIcon = triggerKind ? WORKFLOW_TRIGGER_ICONS[triggerKind] : LightningIcon;
  } else if (isContentSyncAutomation(item.automation)) {
    TriggerIcon = ArrowsClockwiseIcon;
  } else {
    TriggerIcon = TRIGGER_MODE_ICONS[item.automation.triggerConfig.mode];
  }

  return (
    <AutomationIconTile tone="trigger">
      <TriggerIcon className="size-4" />
    </AutomationIconTile>
  );
}

function AutomationTypeLabel({ type }: { type: AutomationListType }) {
  const TypeIcon = AUTOMATION_TYPE_ICONS[type];

  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <TypeIcon className="size-3.5 shrink-0" />
      <FormattedMessage
        {...(type === "agent"
          ? automationsPageViewMessages.typeAgent
          : automationsPageViewMessages.typeWorkflow)}
      />
    </span>
  );
}

function AutomationStatusBadge({ status }: { status: AutomationListStatus }) {
  return (
    <Badge
      variant={status === "active" ? "outline" : "secondary"}
      className={status === "active" ? toneClass("safe") : undefined}
    >
      <FormattedMessage {...STATUS_MESSAGES[status]} />
    </Badge>
  );
}

function AgentLastRun({
  automation,
  now,
}: {
  automation: WorkspaceAutomationRecord;
  now?: number;
}) {
  const intl = useIntl();

  if (automation.lastRunStatus === "queued" || automation.lastRunStatus === "running") {
    return <FormattedMessage {...automationsPageViewMessages.lastRunRunning} />;
  }
  if (!automation.lastRunAt) {
    return <FormattedMessage {...automationsPageViewMessages.lastRunNever} />;
  }

  const time = formatAutomationRelativeTimestamp(intl, automation.lastRunAt, now);
  if (automation.lastRunStatus === "failed") {
    return (
      <span className="font-medium text-destructive">
        <FormattedMessage {...automationsPageViewMessages.lastRunFailed} values={{ time }} />
      </span>
    );
  }

  return time;
}

function AutomationLastRun({ item, now }: { item: AutomationListItem; now?: number }) {
  const intl = useIntl();

  if (item.type === "agent") {
    return <AgentLastRun automation={item.automation} now={now} />;
  }

  // The workflow list does not carry runs yet; they are on the workflow's canvas.
  return (
    <span aria-label={intl.formatMessage(automationsPageViewMessages.lastRunUnavailable)}>—</span>
  );
}

function resolveAutomationItemHref(
  item: AutomationListItem,
  organizationSlug: string,
  automationsBasePath: string,
) {
  return item.type === "workflow"
    ? `${buildAutomationsPath(organizationSlug)}/visual-workflows/${item.id}`
    : `${automationsBasePath}/${item.id}`;
}

/** When, Do, Using: the three parts every automation has, shown to a workspace with none yet. */
function AutomationConcept() {
  const parts = [
    {
      title: automationsPageViewMessages.conceptWhen,
      example: automationsPageViewMessages.conceptWhenExample,
    },
    {
      title: automationsPageViewMessages.conceptDo,
      example: automationsPageViewMessages.conceptDoExample,
    },
    {
      title: automationsPageViewMessages.conceptUsing,
      example: automationsPageViewMessages.conceptUsingExample,
    },
  ];

  return (
    <ol className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
      {parts.map((part, index) => (
        <Fragment key={part.title.id}>
          {index > 0 ? (
            <ArrowRightIcon
              aria-hidden
              className="mx-auto hidden size-4 text-muted-foreground sm:block"
            />
          ) : null}
          <li className="flex h-full flex-col gap-1 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <span className="text-sm font-medium text-foreground">
              <FormattedMessage {...part.title} />
            </span>
            <span className="text-xs text-pretty text-muted-foreground">
              <FormattedMessage {...part.example} />
            </span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/**
 * What the page needs to offer the setup assistant. With it, a workspace with no automations can
 * describe its first one right on this page.
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
  visualWorkflows = [],
  workflowsAvailable = false,
  initialTypeFilter = "all",
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
}: {
  organizationSlug: string;
  projectId?: string;
  automations: WorkspaceAutomationRecord[];
  visualWorkflows?: VisualWorkflowRecord[];
  /** Whether this person can see workflows, so the list offers to filter by type. */
  workflowsAvailable?: boolean;
  initialTypeFilter?: AutomationListFilters["type"];
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
}) {
  const intl = useIntl();
  const [filters, setFilters] = useState<AutomationListFilters>({
    ...EMPTY_FILTERS,
    type: initialTypeFilter,
  });
  const automationsBasePath = buildAutomationsPath(organizationSlug, { projectId });
  const createHref = `${automationsBasePath}/create`;
  const showTypeFilter = workflowsAvailable && !projectId;

  const items = useMemo(
    () => resolveAutomationListItems(automations, visualWorkflows, projectId),
    [automations, projectId, visualWorkflows],
  );
  const counts = useMemo(() => resolveAutomationListCounts(items), [items]);
  const visibleItems = useMemo(() => filterAutomationListItems(items, filters), [filters, items]);
  const statusFilters = (["all", "active", "paused", "draft"] as const).filter(
    (status) => status !== "draft" || counts.draft > 0,
  );
  const isEmpty = !isLoading && !error && items.length === 0;
  const filtersApplied =
    filters.status !== EMPTY_FILTERS.status ||
    filters.type !== EMPTY_FILTERS.type ||
    filters.query !== EMPTY_FILTERS.query;

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
        actions={renderActionLink({
          href: createHref,
          kind: "header",
          children: (
            <>
              <PlusIcon />
              <FormattedMessage {...automationsPageViewMessages.newAutomation} />
            </>
          ),
        })}
      >
        {isEmpty ? null : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <InputGroup className="sm:max-w-xs">
              <InputGroupAddon>
                <MagnifyingGlassIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, query: event.target.value }))
                }
                placeholder={intl.formatMessage(automationsPageViewMessages.searchPlaceholder)}
                aria-label={intl.formatMessage(automationsPageViewMessages.searchPlaceholder)}
              />
            </InputGroup>
            {showTypeFilter ? (
              <Select
                value={filters.type}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    type: value as AutomationListFilters["type"],
                  }))
                }
              >
                <SelectTrigger
                  className="sm:w-36"
                  aria-label={intl.formatMessage(automationsPageViewMessages.filterTypeLabel)}
                >
                  <SelectValue>
                    {intl.formatMessage(TYPE_FILTER_MESSAGES[filters.type])}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["all", "agent", "workflow"] as const).map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                      label={intl.formatMessage(TYPE_FILTER_MESSAGES[type])}
                    >
                      <FormattedMessage {...TYPE_FILTER_MESSAGES[type]} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        )}
      </PageHeader>

      {projectId ? null : (
        <GithubAutoReviewRow
          organizationSlug={organizationSlug}
          settings={autoReview}
          isLoading={autoReviewLoading}
          error={autoReviewError}
          isSaving={autoReviewSaving}
          onSave={onSaveAutoReview}
        />
      )}

      {isEmpty ? (
        <section
          aria-labelledby="automations-empty-title"
          className="flex flex-col gap-6 rounded-xl border border-border px-5 py-6 sm:px-8 sm:py-8"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="automations-empty-title"
              className="font-sans text-lg font-medium text-balance text-foreground"
            >
              <FormattedMessage {...automationsPageViewMessages.emptyTitle} />
            </h2>
            <TypographyP tone="subtle">
              <FormattedMessage {...automationsPageViewMessages.emptyDescription} />
            </TypographyP>
          </div>
          <AutomationConcept />
          {assistant ? (
            <AutomationAssistantPrompt
              aiFeaturesStatus={assistant.aiFeaturesStatus}
              onSubmitPrompt={assistant.onSubmitPrompt}
              organizationSlug={organizationSlug}
              pending={assistant.pending}
            />
          ) : null}
          <div>
            {renderActionLink({
              href: createHref,
              kind: "secondary",
              children: <FormattedMessage {...automationsPageViewMessages.browseWaysToStart} />,
            })}
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {isLoading || error ? null : (
            <Tabs
              value={filters.status}
              onValueChange={(value) =>
                setFilters((current) => ({
                  ...current,
                  status: value as AutomationListFilters["status"],
                }))
              }
            >
              <TabsList
                aria-label={intl.formatMessage(automationsPageViewMessages.filterStatusLabel)}
              >
                {statusFilters.map((status) => (
                  <TabsTrigger key={status} value={status}>
                    <FormattedMessage
                      {...automationsPageViewMessages.filterCount}
                      values={{
                        label: intl.formatMessage(STATUS_FILTER_MESSAGES[status]),
                        count: (
                          <span className="text-muted-foreground tabular-nums">
                            {counts[status]}
                          </span>
                        ),
                      }}
                    />
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <div className="rounded-xl border border-border">
            <div
              className={`${AUTOMATION_LIST_GRID_CLASS} hidden border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground sm:grid`}
            >
              <span>
                <FormattedMessage {...automationsPageViewMessages.columnAutomation} />
              </span>
              <span>
                <FormattedMessage {...automationsPageViewMessages.columnType} />
              </span>
              <span>
                <FormattedMessage {...automationsPageViewMessages.columnStatus} />
              </span>
              <span>
                <FormattedMessage {...automationsPageViewMessages.columnLastRun} />
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
            ) : visibleItems.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-4 py-10">
                <TypographyP size="small" tone="subtle">
                  <FormattedMessage {...automationsPageViewMessages.noMatches} />
                </TypographyP>
                {filtersApplied ? (
                  <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                    <FormattedMessage {...automationsPageViewMessages.clearFilters} />
                  </Button>
                ) : null}
              </div>
            ) : (
              visibleItems.map((item) => (
                <Fragment key={`${item.type}:${item.id}`}>
                  {renderAutomationLink({
                    href: resolveAutomationItemHref(item, organizationSlug, automationsBasePath),
                    className: cn(
                      AUTOMATION_LIST_GRID_CLASS,
                      "border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-muted",
                    ),
                    children: (
                      <>
                        <div className="flex min-w-0 items-center gap-3">
                          <AutomationRowTriggerIcon item={item} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{item.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.type === "agent"
                                ? resolveAgentAutomationSummary(intl, item.automation)
                                : resolveVisualWorkflowSummary(intl, item.workflow)}
                            </p>
                          </div>
                        </div>
                        <span className="hidden sm:block">
                          <AutomationTypeLabel type={item.type} />
                        </span>
                        <span>
                          <AutomationStatusBadge status={item.status} />
                        </span>
                        <span className="hidden text-sm text-muted-foreground sm:block">
                          <AutomationLastRun item={item} now={now} />
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
    </WorkspacePageShell>
  );
}
