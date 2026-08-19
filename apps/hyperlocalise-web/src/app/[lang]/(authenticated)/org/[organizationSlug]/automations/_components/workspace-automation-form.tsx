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
import { useMemo, useState, type ReactNode } from "react";
import {
  Add01Icon,
  ArrowDown01Icon,
  BrainCircuitIcon,
  Clock01Icon,
  Comment01Icon,
  Delete02Icon,
  FolderLibraryIcon,
  GitBranchIcon,
  Globe02Icon,
  Mail01Icon,
  SearchIcon,
  SlackIcon,
  Task01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import type { SimpleIcon } from "simple-icons";
import {
  siGithub,
  siGoogle,
  siGoogleads,
  siGoogleanalytics,
  siLinear,
  siMeta,
  siSemrush,
  siCrowdin,
} from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { KnowledgeMemoryEditor } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-memory-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ComingSoonBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuHint,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createApiClient } from "@/lib/api-client";
import {
  AUTOMATION_WEEKDAY_OPTIONS,
  addBranchPattern,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model";
import { AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model.messages";
import { useActiveTmsProvider } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-active-tms-provider";
import { useTmsLiveProjects } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/_hooks/use-tms-live-projects";
import {
  collectCrowdinProjects,
  isCrowdinAutomationConnected,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-crowdin";
import { SlackChannelSelect } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/slack-channel-select";
import { workspaceAutomationFormMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.messages";
import { getLocaleLabel } from "@/lib/i18n/locales";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import type { WorkspaceAutomationGithubTriggerEvent } from "@/lib/agents/workspace-automations";
import {
  applyWorkspaceAutomationProjectSelection,
  selectableAutomationRepositories,
  workspaceAutomationFormCanActivate,
} from "@/lib/agents/workspace-automation-view-model";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";
import { cn } from "@/lib/primitives/cn";
import type { ApiProject } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/_components/project-list";

const api = createApiClient();

type ProjectOption = {
  id: string;
  name: string;
  source?: string;
  externalProviderKind?: string | null;
  sourceLocale: string | null;
  targetLocales: string[];
};
type GithubRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
  defaultBranch: string | null;
};
type McpServerConnectionOption = {
  id: string;
  displayName: string;
  serverUrl: string;
  enabled: boolean;
};
type SemrushConnectionOption = {
  id: string;
  displayName: string;
  enabled: boolean;
  validationStatus: string;
};
type AhrefsConnectionOption = {
  id: string;
  displayName: string;
  enabled: boolean;
  validationStatus: string;
};
type ContentfulConnectionOption = {
  id: string;
  displayName: string;
  contentTypeIds: string[];
  enabled: boolean;
};

type AutomationEditorTab = "settings" | "history";

type ComingSoonAutomationTool = {
  id: string;
  name: string;
  icon?: SimpleIcon;
};

const COMING_SOON_GOOGLE_MENU_LABEL = "Google";
const COMING_SOON_LINEAR_MENU_LABEL = "Linear";
const METADATA_SEPARATOR = "|";
const EMPTY_CELL = "—";

const COMING_SOON_SERP_TOOLS: readonly ComingSoonAutomationTool[] = [
  { id: "meta-ads-library", name: "Meta Ads Library", icon: siMeta },
  { id: "similarweb", name: "Similarweb" },
] as const;

const COMING_SOON_GOOGLE_TOOLS: readonly ComingSoonAutomationTool[] = [
  { id: "google-serp-api", name: "SERP API" },
  { id: "google-ads-transparency", name: "Ads Transparency Center", icon: siGoogleads },
  { id: "google-search-console", name: "Search Console" },
  { id: "ga4", name: "GA4", icon: siGoogleanalytics },
  { id: "google-trends", name: "Trends" },
] as const;

function AutomationToolMenuIcon({ icon }: { icon?: SimpleIcon }) {
  if (icon) {
    return <SimpleBrandIcon icon={icon} colored={false} className="size-4" />;
  }

  return <HugeiconsIcon icon={SearchIcon} className="size-4" />;
}

function toCrowdinProjectOption(project: ApiProject): ProjectOption {
  return {
    id: project.id,
    name: project.name,
    source: project.source,
    externalProviderKind: project.externalProviderKind,
    sourceLocale: project.sourceLocale ?? null,
    targetLocales: project.targetLocales ?? [],
  };
}

function defaultCrowdinProjectId(
  form: WorkspaceAutomationFormState,
  crowdinProjects: ProjectOption[],
) {
  if (crowdinProjects.some((project) => project.id === form.projectId)) {
    return form.projectId;
  }
  if (crowdinProjects.some((project) => project.id === form.crowdinProjectId)) {
    return form.crowdinProjectId;
  }
  return crowdinProjects[0]?.id ?? "";
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

function toggleGithubEvent(
  events: WorkspaceAutomationGithubTriggerEvent[],
  event: WorkspaceAutomationGithubTriggerEvent,
  enabled: boolean,
): WorkspaceAutomationGithubTriggerEvent[] {
  if (enabled) {
    return events.includes(event) ? events : [...events, event];
  }

  return events.filter((value) => value !== event);
}

function GithubEventSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <Switch
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
      <span>{label}</span>
    </label>
  );
}

function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-2 text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function EditorPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-muted", className)}>
      {children}
    </div>
  );
}

function EditorRow({
  icon,
  title,
  description,
  children,
  action,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-12 flex-col gap-3 border-b border-border px-3 py-3 last:border-b-0 md:flex-row md:items-center",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-muted-foreground md:mt-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-foreground">
            {title}
          </div>
          {description ? (
            <div className="mt-1 text-xs text-pretty text-muted-foreground">{description}</div>
          ) : null}
        </div>
      </div>
      {children ? <div className="min-w-0 md:max-w-xl md:flex-1">{children}</div> : null}
      {action ? <div className="flex shrink-0 items-center justify-end gap-2">{action}</div> : null}
    </div>
  );
}

function DeleteToolButton({
  disabled,
  label,
  onClick,
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-8 rounded-lg text-muted-foreground hover:text-foreground"
    >
      <HugeiconsIcon icon={Delete02Icon} className="size-4" />
    </Button>
  );
}

function formatHour(hourUtc: number) {
  return `${String(hourUtc).padStart(2, "0")}:00`;
}

function triggerSummary(
  intl: IntlShape,
  form: WorkspaceAutomationFormState,
  repositories: GithubRepositoryOption[] = [],
  projects: ProjectOption[] = [],
) {
  if (form.triggerMode === "scheduled") {
    if (form.scheduledCadence === "hourly") {
      return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerHourly, {
        timezone: form.scheduledTimezone,
      });
    }

    if (form.scheduledCadence === "weekly") {
      const weekdayMessage =
        AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[
          form.scheduledDayOfWeek as keyof typeof AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE
        ];
      const weekday = weekdayMessage
        ? intl.formatMessage(weekdayMessage)
        : intl.formatMessage(AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[1]);
      return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerWeekly, {
        weekday,
        time: formatHour(form.scheduledHourUtc),
        timezone: form.scheduledTimezone,
      });
    }

    return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerDaily, {
      time: formatHour(form.scheduledHourUtc),
      timezone: form.scheduledTimezone,
    });
  }

  if (form.triggerMode === "github") {
    const repository = repositories.find(
      (entry) => entry.id === form.githubInstallationRepositoryId,
    );
    const repositoryLabel =
      repository?.fullName ??
      intl.formatMessage(workspaceAutomationFormMessages.repositoryRequired);
    const branchLabel =
      form.pushBranches.join(", ") ||
      intl.formatMessage(workspaceAutomationFormMessages.branchesRequired);
    const listensToPush = form.githubEvents.includes("push");
    const listensToPullRequest = form.githubEvents.includes("pull_request");
    const summaryMessage =
      listensToPush && listensToPullRequest
        ? workspaceAutomationFormMessages.githubPushAndPullRequestSummary
        : listensToPullRequest
          ? workspaceAutomationFormMessages.githubPullRequestSummary
          : workspaceAutomationFormMessages.githubPushSummary;
    return intl.formatMessage(summaryMessage, {
      repository: repositoryLabel,
      branches: branchLabel,
    });
  }

  if (form.triggerMode === "contentful") {
    return intl.formatMessage(workspaceAutomationFormMessages.contentfulWebhook);
  }

  if (form.triggerMode === "source_upload") {
    const project = projects.find((entry) => entry.id === form.projectId);
    return project?.name
      ? intl.formatMessage(workspaceAutomationFormMessages.sourceUploadSummary, {
          project: project.name,
        })
      : intl.formatMessage(workspaceAutomationFormMessages.sourceUploadProjectRequired);
  }

  return "";
}

function toolCount(form: WorkspaceAutomationFormState) {
  return (
    Number(form.githubEnabled) +
    Number(form.slackEnabled) +
    Number(form.emailEnabled) +
    Number(form.githubCommentEnabled) +
    Number(form.contentfulEnabled) +
    Number(form.crowdinEnabled) +
    Number(form.createNativeTmsJobEnabled) +
    Number(form.assignTranslateWithAgentEnabled) +
    Number(form.listIssuesEnabled) +
    Number(form.createIssueEnabled) +
    Number(form.knowledgeEnabled) +
    Number(form.mcpEnabled) +
    Number(form.semrushEnabled) +
    Number(form.ahrefsEnabled) +
    Number(form.webSearchEnabled)
  );
}

function formatRepositoryOptionLabel(intl: IntlShape, repository: GithubRepositoryOption) {
  if (repository.enabled) {
    return repository.fullName;
  }

  return intl.formatMessage(workspaceAutomationFormMessages.repositoryDisabledSuffix, {
    name: repository.fullName,
  });
}

function selectedRepositoryLabel(
  intl: IntlShape,
  repositoryId: string,
  repositories: GithubRepositoryOption[],
  placeholder?: string,
) {
  if (!repositoryId) {
    return placeholder ?? intl.formatMessage(workspaceAutomationFormMessages.selectRepository);
  }

  return (
    repositories.find((repository) => repository.id === repositoryId)?.fullName ??
    intl.formatMessage(workspaceAutomationFormMessages.unknownRepository)
  );
}

function resolveDefaultGithubRepositoryId(
  form: WorkspaceAutomationFormState,
  repositories: GithubRepositoryOption[],
) {
  if (
    form.githubInstallationRepositoryId &&
    repositories.some((repository) => repository.id === form.githubInstallationRepositoryId)
  ) {
    return form.githubInstallationRepositoryId;
  }

  return repositories.find((repository) => repository.enabled && !repository.archived)?.id ?? "";
}

function GithubRepositorySelect({
  disabled,
  error,
  form,
  onChange,
  repositories,
}: {
  disabled?: boolean;
  error?: string;
  form: WorkspaceAutomationFormState;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
}) {
  const intl = useIntl();

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.repositoryLabel} />
      </Label>
      <Select
        value={form.githubInstallationRepositoryId || undefined}
        onValueChange={(value) => {
          if (!value) {
            return;
          }
          onChange({
            ...form,
            githubInstallationRepositoryId: value,
            repositoryTargetKind: "github",
          });
        }}
        disabled={disabled || repositories.length === 0}
      >
        <SelectTrigger className="h-8 w-full rounded-lg">
          <span className="truncate">
            {repositories.length === 0
              ? intl.formatMessage(workspaceAutomationFormMessages.connectGithubForRepository)
              : selectedRepositoryLabel(intl, form.githubInstallationRepositoryId, repositories)}
          </span>
        </SelectTrigger>
        <SelectContent>
          {repositories.map((repository) => (
            <SelectItem key={repository.id} value={repository.id}>
              {formatRepositoryOptionLabel(intl, repository)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

function selectedContentfulConnectionLabel(
  intl: IntlShape,
  connectionId: string,
  connections: ContentfulConnectionOption[],
) {
  if (!connectionId) {
    return intl.formatMessage(workspaceAutomationFormMessages.selectConnection);
  }

  return (
    connections.find((connection) => connection.id === connectionId)?.displayName ?? connectionId
  );
}

function HeaderProjectSelector({
  disabled,
  form,
  isError,
  isLoading,
  onChange,
  projects,
}: {
  disabled?: boolean;
  form: WorkspaceAutomationFormState;
  isError: boolean;
  isLoading: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  projects: ProjectOption[];
}) {
  const intl = useIntl();
  const usesTranslationProject =
    form.triggerMode === "source_upload" ||
    ((form.createNativeTmsJobEnabled || form.assignTranslateWithAgentEnabled) &&
      (form.triggerMode !== "github" || !form.githubEnabled));
  const selectableProjects = usesTranslationProject
    ? projects.filter((project) => project.source !== "external_tms")
    : projects;
  const activeProjectId = form.projectId;
  const selectedProject = selectableProjects.find((project) => project.id === activeProjectId);
  const triggerLabel =
    selectedProject?.name ??
    (activeProjectId
      ? intl.formatMessage(workspaceAutomationFormMessages.unknownProject)
      : intl.formatMessage(workspaceAutomationFormMessages.selectProject));

  function handleProjectSelect(projectId: string) {
    const project = projects.find((entry) => entry.id === projectId);
    onChange(
      applyWorkspaceAutomationProjectSelection(
        form,
        projectId,
        project
          ? {
              sourceLocale: project.sourceLocale,
              targetLocales: project.targetLocales,
            }
          : undefined,
      ),
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || isLoading}
        render={
          <Button
            type="button"
            variant="ghost"
            className="h-auto gap-1 px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-50"
          />
        }
      >
        <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
        {isLoading ? <Skeleton className="h-3.5 w-20 rounded-full bg-muted" /> : triggerLabel}
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.8} className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...workspaceAutomationFormMessages.projectsMenu} />
          </DropdownMenuLabel>
          {isError ? (
            <DropdownMenuItem disabled>
              <FormattedMessage {...workspaceAutomationFormMessages.unableToLoadProjects} />
            </DropdownMenuItem>
          ) : null}
          {!isLoading && selectableProjects.length === 0 ? (
            <DropdownMenuItem disabled>
              <FormattedMessage {...workspaceAutomationFormMessages.noProjectsFound} />
            </DropdownMenuItem>
          ) : null}
          {selectableProjects.map((project) => (
            <DropdownMenuItem key={project.id} onClick={() => handleProjectSelect(project.id)}>
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
              {project.name}
              {activeProjectId === project.id ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.selectedShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatBranchPatternLabel(intl: IntlShape, branches: string[]) {
  if (branches.length === 0) {
    return intl.formatMessage(workspaceAutomationFormMessages.branchesPlaceholder);
  }

  if (branches.length === 1) {
    return branches[0]!;
  }

  if (branches.length === 2) {
    return branches.join(", ");
  }

  return `${branches[0]!} +${branches.length - 1}`;
}

function BranchPatternSelector({
  branches,
  disabled,
  error,
  onChange,
}: {
  branches: string[];
  disabled?: boolean;
  error?: string;
  onChange: (branches: string[]) => void;
}) {
  const intl = useIntl();
  const [branchInput, setBranchInput] = useState("");
  const [inputError, setInputError] = useState<string | undefined>();

  function handleAdd() {
    const result = addBranchPattern(intl, branches, branchInput);
    if (result.error) {
      setInputError(result.error);
      return;
    }

    onChange(result.branches);
    setBranchInput("");
    setInputError(undefined);
  }

  return (
    <div className="min-w-0 md:min-w-36 md:max-w-xs md:flex-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant="outline"
              className="h-8 w-full justify-between gap-2 rounded-lg border border-input bg-input/30 px-3 text-sm font-normal text-foreground hover:bg-input/50 disabled:opacity-50"
            />
          }
        >
          <span className="truncate">{formatBranchPatternLabel(intl, branches)}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={1.8}
            className="size-3.5 shrink-0 opacity-60"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...workspaceAutomationFormMessages.branchPatternsMenu} />
            </DropdownMenuLabel>
            {branches.length === 0 ? (
              <DropdownMenuItem disabled>
                <FormattedMessage {...workspaceAutomationFormMessages.noBranchesAdded} />
              </DropdownMenuItem>
            ) : (
              branches.map((branch) => (
                <DropdownMenuItem
                  key={branch}
                  onClick={() => onChange(branches.filter((value) => value !== branch))}
                >
                  <span className="min-w-0 flex-1 truncate">{branch}</span>
                  <DropdownMenuHint>
                    <FormattedMessage {...workspaceAutomationFormMessages.removeShortcut} />
                  </DropdownMenuHint>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <div
            className="flex gap-2 p-2"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <Input
              aria-label={intl.formatMessage(
                workspaceAutomationFormMessages.branchPatternAriaLabel,
              )}
              value={branchInput}
              disabled={disabled}
              placeholder="main"
              className="h-8 min-w-0 flex-1 rounded-lg"
              onChange={(event) => {
                setBranchInput(event.target.value);
                setInputError(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleAdd();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-8 shrink-0"
              onClick={handleAdd}
            >
              <FormattedMessage {...workspaceAutomationFormMessages.addBranch} />
            </Button>
          </div>
          {inputError ? <p className="px-2 pb-2 text-xs text-destructive">{inputError}</p> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <FieldError message={error} />
    </div>
  );
}

function AddTriggerMenu({
  contentfulConnected,
  disabled,
  form,
  githubConnected,
  onChange,
  repositories,
}: {
  contentfulConnected: boolean;
  disabled?: boolean;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
}) {
  return (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="w-full"
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              className="flex h-10 w-full shrink justify-start rounded-none px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
            />
          }
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
          <FormattedMessage {...workspaceAutomationFormMessages.addTrigger} />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start" sideOffset={2}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...workspaceAutomationFormMessages.supportedTriggers} />
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={form.triggerMode === "manual"}
              onClick={() => onChange({ ...form, triggerMode: "manual" })}
            >
              <HugeiconsIcon icon={Clock01Icon} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.manualRun} />
              {form.triggerMode === "manual" ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "scheduled"}
              onClick={() => onChange({ ...form, triggerMode: "scheduled" })}
            >
              <HugeiconsIcon icon={Clock01Icon} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.scheduled} />
              {form.triggerMode === "scheduled" ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "github" || !githubConnected}
              onClick={() => {
                const defaultRepositoryId =
                  form.githubInstallationRepositoryId ||
                  repositories.find((repository) => repository.enabled)?.id ||
                  repositories[0]?.id ||
                  "";

                onChange({
                  ...form,
                  triggerMode: "github",
                  githubEnabled: true,
                  githubEvents:
                    form.githubEvents.length > 0 ? form.githubEvents : ["push"],
                  repositoryTargetKind: "github",
                  githubInstallationRepositoryId: defaultRepositoryId,
                  validationEnabled:
                    form.githubMode === "agent"
                      ? form.validationEnabled
                      : form.pushSourceEnabled || form.pullTranslationsEnabled
                        ? form.validationEnabled
                        : true,
                });
              }}
            >
              <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.githubPush} />
              {form.triggerMode === "github" ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !githubConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "contentful" || !contentfulConnected}
              onClick={() =>
                onChange({
                  ...form,
                  triggerMode: "contentful",
                  contentfulEnabled: true,
                })
              }
            >
              <HugeiconsIcon icon={SearchIcon} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.contentfulWebhook} />
              {form.triggerMode === "contentful" ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !contentfulConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "source_upload"}
              onClick={() =>
                onChange({
                  ...form,
                  triggerMode: "source_upload",
                  createNativeTmsJobEnabled: true,
                  createNativeTmsJobUseProjectTargetLocales: true,
                  assignTranslateWithAgentEnabled: true,
                })
              }
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.sourceUpload} />
              {form.triggerMode === "source_upload" ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function TriggerSettings({
  contentfulConnected,
  disabled,
  errors,
  form,
  githubConnected,
  onChange,
  repositories,
}: {
  contentfulConnected: boolean;
  disabled?: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
}) {
  const intl = useIntl();

  return (
    <EditorSection title={intl.formatMessage(workspaceAutomationFormMessages.triggersSection)}>
      <EditorPanel>
        {form.triggerMode === "scheduled" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Clock01Icon} className="size-4" />}
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.every} />
                </span>
                <Select
                  value={form.scheduledCadence}
                  onValueChange={(value) =>
                    onChange({
                      ...form,
                      scheduledCadence: value as typeof form.scheduledCadence,
                    })
                  }
                  disabled={disabled}
                >
                  <SelectTrigger size="sm" className="h-8 min-w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">
                      <FormattedMessage {...workspaceAutomationFormMessages.cadenceHour} />
                    </SelectItem>
                    <SelectItem value="daily">
                      <FormattedMessage {...workspaceAutomationFormMessages.cadenceDay} />
                    </SelectItem>
                    <SelectItem value="weekly">
                      <FormattedMessage {...workspaceAutomationFormMessages.cadenceWeek} />
                    </SelectItem>
                  </SelectContent>
                </Select>
                {form.scheduledCadence === "weekly" ? (
                  <Select
                    value={String(form.scheduledDayOfWeek)}
                    onValueChange={(value) =>
                      onChange({
                        ...form,
                        scheduledDayOfWeek: Number(value),
                      })
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger size="sm" className="h-8 min-w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTOMATION_WEEKDAY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {intl.formatMessage(AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[option.value])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                {form.scheduledCadence !== "hourly" ? (
                  <>
                    <span>
                      <FormattedMessage {...workspaceAutomationFormMessages.at} />
                    </span>
                    <Select
                      value={String(form.scheduledHourUtc)}
                      onValueChange={(value) =>
                        onChange({
                          ...form,
                          scheduledHourUtc: Number(value),
                        })
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger size="sm" className="h-8 min-w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {Array.from({ length: 24 }, (_, hour) => (
                          <SelectItem key={hour} value={String(hour)}>
                            {formatHour(hour)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : null}
                <Input
                  aria-label={intl.formatMessage(
                    workspaceAutomationFormMessages.scheduleTimezoneAriaLabel,
                  )}
                  value={form.scheduledTimezone}
                  disabled={disabled}
                  className="h-8 w-32 rounded-lg px-2 text-sm"
                  onChange={(event) =>
                    onChange({
                      ...form,
                      scheduledTimezone: event.target.value,
                    })
                  }
                />
              </>
            }
          />
        ) : null}

        {form.triggerMode === "github" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.githubPush} />}
            className="md:items-center"
          >
            <div className="flex w-full min-w-0 flex-col gap-1.5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
                <Select
                  value={form.githubInstallationRepositoryId || undefined}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    onChange({
                      ...form,
                      triggerMode: "github",
                      githubEnabled: true,
                      repositoryTargetKind: "github",
                      githubInstallationRepositoryId: value,
                    });
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 w-full rounded-lg md:min-w-44 md:max-w-xs">
                    <span className="truncate">
                      {selectedRepositoryLabel(
                        intl,
                        form.githubInstallationRepositoryId,
                        repositories,
                        intl.formatMessage(workspaceAutomationFormMessages.repositoryLabel),
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((repository) => (
                      <SelectItem key={repository.id} value={repository.id}>
                        {formatRepositoryOptionLabel(intl, repository)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <BranchPatternSelector
                  branches={form.pushBranches}
                  disabled={disabled}
                  error={errors.pushBranches}
                  onChange={(pushBranches) => onChange({ ...form, pushBranches })}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <GithubEventSwitch
                  checked={form.githubEvents.includes("push")}
                  disabled={disabled}
                  label={<FormattedMessage {...workspaceAutomationFormMessages.githubEventPush} />}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...form,
                      githubEvents: toggleGithubEvent(form.githubEvents, "push", checked),
                    })
                  }
                />
                <GithubEventSwitch
                  checked={form.githubEvents.includes("pull_request")}
                  disabled={disabled}
                  label={
                    <FormattedMessage {...workspaceAutomationFormMessages.githubEventPullRequest} />
                  }
                  onCheckedChange={(checked) =>
                    onChange({
                      ...form,
                      githubEvents: toggleGithubEvent(form.githubEvents, "pull_request", checked),
                    })
                  }
                />
              </div>
              <FieldError message={errors.githubRepository} />
              <FieldError message={errors.githubEvents} />
            </div>
          </EditorRow>
        ) : null}

        {form.triggerMode === "manual" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Clock01Icon} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.manualOnlyTitle} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.manualOnlyDescription} />
            }
          />
        ) : null}

        {form.triggerMode === "contentful" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={SearchIcon} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.contentfulWebhook} />}
            description={
              contentfulConnected ? (
                <FormattedMessage
                  {...workspaceAutomationFormMessages.contentfulWebhookConnectedDescription}
                />
              ) : (
                <FormattedMessage
                  {...workspaceAutomationFormMessages.contentfulWebhookDisconnectedDescription}
                />
              )
            }
          />
        ) : null}

        {form.triggerMode === "source_upload" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.sourceUpload} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.sourceUploadDescription} />
            }
          />
        ) : null}

        <AddTriggerMenu
          contentfulConnected={contentfulConnected}
          disabled={disabled}
          form={form}
          githubConnected={githubConnected}
          onChange={onChange}
          repositories={repositories}
        />
      </EditorPanel>
      <FieldError message={errors.trigger} />
    </EditorSection>
  );
}

function AddToolMenu({
  contentfulConnected,
  crowdinConnected,
  disabled,
  emailConnected,
  form,
  githubConnected,
  knowledgeAvailable,
  mcpConnected,
  onChange,
  repositories,
  ahrefsConnected,
  semrushConnected,
  slackConnected,
  crowdinProjects,
}: {
  contentfulConnected: boolean;
  crowdinConnected: boolean;
  disabled?: boolean;
  emailConnected: boolean;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  knowledgeAvailable: boolean;
  mcpConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
  ahrefsConnected: boolean;
  semrushConnected: boolean;
  slackConnected: boolean;
  crowdinProjects: ProjectOption[];
}) {
  return (
    <div className="w-full">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="w-full"
          render={
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              className="flex h-10 w-full shrink justify-start rounded-none px-3 text-muted-foreground hover:bg-muted hover:text-foreground"
            />
          }
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={1.8} className="size-4" />
          <FormattedMessage {...workspaceAutomationFormMessages.addTool} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-(--available-height) w-80 overflow-y-auto"
          align="start"
          sideOffset={2}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...workspaceAutomationFormMessages.builtInTools} />
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={form.knowledgeEnabled || !knowledgeAvailable}
              onClick={() => onChange({ ...form, knowledgeEnabled: true })}
            >
              <HugeiconsIcon icon={BrainCircuitIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.memories} />
              {form.knowledgeEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !knowledgeAvailable ? (
                <DropdownMenuHint>
                  <FormattedMessage
                    {...workspaceAutomationFormMessages.enableKnowledgeFirstShortcut}
                  />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...workspaceAutomationFormMessages.supportedTools} />
            </DropdownMenuLabel>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <AutomationToolMenuIcon icon={siGithub} />
                <span className="min-w-0 flex-1">
                  <FormattedMessage {...workspaceAutomationFormMessages.githubToolsMenu} />
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuItem
                  disabled={form.githubEnabled || !githubConnected}
                  onClick={() => {
                    const defaultRepositoryId = resolveDefaultGithubRepositoryId(
                      form,
                      repositories,
                    );

                    onChange({
                      ...form,
                      githubEnabled: true,
                      githubMode: "agent",
                      repositoryTargetKind: "github",
                      githubInstallationRepositoryId: defaultRepositoryId,
                      pushSourceEnabled: false,
                      pullTranslationsEnabled: false,
                      validationEnabled: false,
                    });
                  }}
                >
                  <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.useGithubRepo} />
                  {form.githubEnabled && form.githubMode === "agent" ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : !githubConnected ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={form.githubEnabled || !githubConnected}
                  onClick={() => {
                    const defaultRepositoryId = resolveDefaultGithubRepositoryId(
                      form,
                      repositories,
                    );

                    onChange({
                      ...form,
                      githubEnabled: true,
                      githubMode: "sync",
                      repositoryTargetKind: "github",
                      githubInstallationRepositoryId: defaultRepositoryId,
                      validationEnabled:
                        form.pushSourceEnabled || form.pullTranslationsEnabled
                          ? form.validationEnabled
                          : true,
                    });
                  }}
                >
                  <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.githubSyncWorkflows} />
                  {form.githubEnabled && form.githubMode === "sync" ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : !githubConnected ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={form.githubCommentEnabled || !githubConnected}
                  onClick={() => {
                    const defaultRepositoryId = resolveDefaultGithubRepositoryId(
                      form,
                      repositories,
                    );

                    onChange({
                      ...form,
                      githubCommentEnabled: true,
                      repositoryTargetKind: "github",
                      githubInstallationRepositoryId: defaultRepositoryId,
                    });
                  }}
                >
                  <HugeiconsIcon icon={Comment01Icon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.commentOnPullRequest} />
                  {form.githubCommentEnabled ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : !githubConnected ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              disabled={form.slackEnabled || !slackConnected}
              onClick={() => onChange({ ...form, slackEnabled: true })}
            >
              <HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.sendToSlack} />
              {form.slackEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !slackConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.emailEnabled || !emailConnected}
              onClick={() => onChange({ ...form, emailEnabled: true })}
            >
              <HugeiconsIcon icon={Mail01Icon} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.sendEmail} />
              {form.emailEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !emailConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.enableFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.contentfulEnabled || !contentfulConnected}
              onClick={() =>
                onChange({
                  ...form,
                  contentfulEnabled: true,
                  triggerMode: form.triggerMode === "manual" ? "contentful" : form.triggerMode,
                  contentfulRunQa: true,
                  contentfulWriteDrafts: true,
                })
              }
            >
              <HugeiconsIcon icon={SearchIcon} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.contentfulTranslate} />
              {form.contentfulEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !contentfulConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.crowdinEnabled || !crowdinConnected}
              onClick={() =>
                onChange({
                  ...form,
                  crowdinEnabled: true,
                  crowdinProjectId: defaultCrowdinProjectId(form, crowdinProjects),
                })
              }
            >
              <AutomationToolMenuIcon icon={siCrowdin} />
              <FormattedMessage {...workspaceAutomationFormMessages.crowdin} />
              {form.crowdinEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !crowdinConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />
                <span className="min-w-0 flex-1">
                  <FormattedMessage {...workspaceAutomationFormMessages.jobsToolsMenu} />
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuItem
                  disabled={form.createNativeTmsJobEnabled}
                  onClick={() =>
                    onChange({
                      ...form,
                      createNativeTmsJobEnabled: true,
                      createNativeTmsJobUseProjectTargetLocales: true,
                      triggerMode:
                        form.triggerMode === "manual" ? "source_upload" : form.triggerMode,
                    })
                  }
                >
                  <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.createJob} />
                  {form.createNativeTmsJobEnabled ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={form.assignTranslateWithAgentEnabled}
                  onClick={() =>
                    onChange({
                      ...form,
                      createNativeTmsJobEnabled: true,
                      createNativeTmsJobUseProjectTargetLocales: form.createNativeTmsJobEnabled
                        ? form.createNativeTmsJobUseProjectTargetLocales
                        : true,
                      assignTranslateWithAgentEnabled: true,
                      triggerMode:
                        form.triggerMode === "manual" ? "source_upload" : form.triggerMode,
                    })
                  }
                >
                  <HugeiconsIcon icon={BrainCircuitIcon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.translateWithAgent} />
                  {form.assignTranslateWithAgentEnabled ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={Task01Icon} strokeWidth={1.8} className="size-4" />
                <span className="min-w-0 flex-1">
                  <FormattedMessage {...workspaceAutomationFormMessages.issuesToolsMenu} />
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuItem
                  disabled={form.listIssuesEnabled}
                  onClick={() => onChange({ ...form, listIssuesEnabled: true })}
                >
                  <HugeiconsIcon icon={Task01Icon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.listIssues} />
                  {form.listIssuesEnabled ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={form.createIssueEnabled}
                  onClick={() => onChange({ ...form, createIssueEnabled: true })}
                >
                  <HugeiconsIcon icon={Task01Icon} strokeWidth={1.8} className="size-4" />
                  <FormattedMessage {...workspaceAutomationFormMessages.createIssue} />
                  {form.createIssueEnabled ? (
                    <DropdownMenuHint>
                      <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                    </DropdownMenuHint>
                  ) : null}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              disabled={form.mcpEnabled || !mcpConnected}
              onClick={() => onChange({ ...form, mcpEnabled: true })}
            >
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.mcpServer} />
              {form.mcpEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !mcpConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.semrushEnabled || !semrushConnected}
              onClick={() => onChange({ ...form, semrushEnabled: true })}
            >
              <AutomationToolMenuIcon icon={siSemrush} />
              <FormattedMessage {...workspaceAutomationFormMessages.semrush} />
              {form.semrushEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !semrushConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.ahrefsEnabled || !ahrefsConnected}
              onClick={() => onChange({ ...form, ahrefsEnabled: true })}
            >
              <AutomationToolMenuIcon />
              <FormattedMessage {...workspaceAutomationFormMessages.ahrefs} />
              {form.ahrefsEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !ahrefsConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.webSearchEnabled}
              onClick={() => onChange({ ...form, webSearchEnabled: true })}
            >
              <HugeiconsIcon icon={Globe02Icon} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.webSearch} />
              {form.webSearchEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...workspaceAutomationFormMessages.comingSoon} />
            </DropdownMenuLabel>
            {COMING_SOON_SERP_TOOLS.map((tool) => (
              <DropdownMenuItem key={tool.id} disabled>
                <AutomationToolMenuIcon icon={tool.icon} />
                {tool.name}
                <ComingSoonBadge />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <AutomationToolMenuIcon icon={siGoogle} />
                <span className="min-w-0 flex-1">{COMING_SOON_GOOGLE_MENU_LABEL}</span>
                <ComingSoonBadge className="ms-0" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                {COMING_SOON_GOOGLE_TOOLS.map((tool) => (
                  <DropdownMenuItem key={tool.id} disabled>
                    <AutomationToolMenuIcon icon={tool.icon ?? siGoogle} />
                    {tool.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem disabled>
              <AutomationToolMenuIcon icon={siLinear} />
              {COMING_SOON_LINEAR_MENU_LABEL}
              <ComingSoonBadge />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatLocalePill(locale: string) {
  return `${getLocaleLabel(locale)} (${locale})`;
}

function ContentfulTargetLocalesPicker({
  availableLocales,
  disabled,
  emptyMessage,
  error,
  labelledBy,
  selectedLocales,
  onChange,
}: {
  availableLocales: string[];
  disabled?: boolean;
  emptyMessage: string;
  error?: string;
  labelledBy: string;
  selectedLocales: string[];
  onChange: (locales: string[]) => void;
}) {
  const selected = useMemo(
    () => new Set(selectedLocales.map((locale) => locale.toLowerCase())),
    [selectedLocales],
  );

  function toggleLocale(locale: string) {
    const key = locale.toLowerCase();
    if (selected.has(key)) {
      onChange(selectedLocales.filter((entry) => entry.toLowerCase() !== key));
      return;
    }
    onChange([...selectedLocales, locale].toSorted());
  }

  if (availableLocales.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={labelledBy}>
        {availableLocales.map((locale) => {
          const isSelected = selected.has(locale.toLowerCase());
          return (
            <Button
              key={locale}
              type="button"
              size="sm"
              variant={isSelected ? "default" : "outline"}
              disabled={disabled}
              onClick={() => toggleLocale(locale)}
              className="h-8 px-2.5 text-xs"
            >
              {formatLocalePill(locale)}
            </Button>
          );
        })}
      </div>
      <FieldError message={error} />
    </>
  );
}

function ToolsSettings({
  canUpdateKnowledgeMemory,
  contentfulConnections,
  crowdinConnected,
  crowdinLiveProjects,
  disabled,
  emailConnected,
  errors,
  form,
  githubConnected,
  knowledgeAvailable,
  mcpServerConnections,
  onChange,
  organizationSlug,
  projects,
  repositories,
  ahrefsConnections,
  semrushConnections,
  slackConnected,
}: {
  canUpdateKnowledgeMemory: boolean;
  contentfulConnections: ContentfulConnectionOption[];
  crowdinConnected: boolean;
  crowdinLiveProjects: ProjectOption[];
  disabled?: boolean;
  emailConnected: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  knowledgeAvailable: boolean;
  mcpServerConnections: McpServerConnectionOption[];
  onChange: (next: WorkspaceAutomationFormState) => void;
  organizationSlug: string;
  projects: ProjectOption[];
  repositories: GithubRepositoryOption[];
  ahrefsConnections: AhrefsConnectionOption[];
  semrushConnections: SemrushConnectionOption[];
  slackConnected: boolean;
}) {
  const contentfulConnected = contentfulConnections.length > 0;
  const mcpConnected = mcpServerConnections.some((connection) => connection.enabled);
  const enabledMcpServerConnections = mcpServerConnections.filter(
    (connection) => connection.enabled,
  );
  const enabledSemrushConnections = semrushConnections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );
  const semrushConnected = enabledSemrushConnections.length > 0;
  const enabledAhrefsConnections = ahrefsConnections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );
  const ahrefsConnected = enabledAhrefsConnections.length > 0;
  const crowdinProjects = collectCrowdinProjects(projects, crowdinLiveProjects);
  const contentfulTargetLocalesFieldId = "contentful-target-locales";
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const contentfulAvailableTargetLocales = selectedProject?.targetLocales ?? [];
  const showContentfulEntryId = form.triggerMode === "scheduled";
  const createNativeTmsJobAvailableTargetLocales = selectedProject?.targetLocales ?? [];
  const createNativeTmsJobTargetLocalesFieldId = "create-native-tms-job-target-locales";
  const intl = useIntl();
  const [memoriesOpen, setMemoriesOpen] = useState(false);

  return (
    <EditorSection title={intl.formatMessage(workspaceAutomationFormMessages.toolsSection)}>
      <EditorPanel>
        {form.knowledgeEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={BrainCircuitIcon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.memories} />}
            description={
              knowledgeAvailable
                ? intl.formatMessage(workspaceAutomationFormMessages.memoriesDescription)
                : intl.formatMessage(workspaceAutomationFormMessages.memoriesUnavailableDescription)
            }
            action={
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={disabled || !knowledgeAvailable}
                  className="h-8 rounded-full px-3"
                  onClick={() => setMemoriesOpen(true)}
                >
                  <FormattedMessage {...workspaceAutomationFormMessages.manageMemories} />
                </Button>
                <DeleteToolButton
                  disabled={disabled}
                  label={intl.formatMessage(workspaceAutomationFormMessages.removeMemoriesTool)}
                  onClick={() =>
                    onChange({ ...form, knowledgeEnabled: false, knowledgeAllowUpdates: false })
                  }
                />
              </>
            }
          >
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <span className="text-xs text-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.allowMemoryUpdates} />
              </span>
              <Switch
                size="sm"
                checked={form.knowledgeAllowUpdates}
                disabled={disabled || !knowledgeAvailable}
                onCheckedChange={(checked) => onChange({ ...form, knowledgeAllowUpdates: checked })}
              />
            </label>
            {form.knowledgeAllowUpdates ? (
              <p className="mt-2 text-xs text-pretty text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.allowMemoryUpdatesWarning} />
              </p>
            ) : null}
          </EditorRow>
        ) : null}

        {form.githubEnabled && form.githubMode === "agent" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.useGithubRepo} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.useGithubRepoDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeGithubRepoTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    githubEnabled: false,
                    repositoryTargetKind: form.githubCommentEnabled ? "github" : "none",
                    githubInstallationRepositoryId: form.githubCommentEnabled
                      ? form.githubInstallationRepositoryId
                      : "",
                  })
                }
              />
            }
          >
            <GithubRepositorySelect
              disabled={disabled}
              error={errors.githubRepository}
              form={form}
              onChange={onChange}
              repositories={repositories}
            />
          </EditorRow>
        ) : null}

        {form.githubEnabled && form.githubMode === "sync" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.githubSyncWorkflows} />}
            description={
              <FormattedMessage
                {...workspaceAutomationFormMessages.githubSyncWorkflowsDescription}
              />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(
                  workspaceAutomationFormMessages.removeGithubSyncWorkflows,
                )}
                onClick={() =>
                  onChange({
                    ...form,
                    githubEnabled: false,
                    repositoryTargetKind: form.githubCommentEnabled ? "github" : "none",
                    githubInstallationRepositoryId: form.githubCommentEnabled
                      ? form.githubInstallationRepositoryId
                      : "",
                    pushSourceEnabled: false,
                    pullTranslationsEnabled: false,
                    validationEnabled: false,
                  })
                }
              />
            }
          >
            <div className="grid gap-3">
              <GithubRepositorySelect
                disabled={disabled}
                error={errors.githubRepository}
                form={form}
                onChange={onChange}
                repositories={repositories}
              />
              <div className="grid gap-2 md:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.pushSource} />
                  </span>
                  <Switch
                    size="sm"
                    checked={form.pushSourceEnabled}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...form, pushSourceEnabled: checked })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.pullTranslations} />
                  </span>
                  <Switch
                    size="sm"
                    checked={form.pullTranslationsEnabled}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...form,
                        pullTranslationsEnabled: checked,
                      })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.validation} />
                  </span>
                  <Switch
                    size="sm"
                    checked={form.validationEnabled}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...form, validationEnabled: checked })}
                  />
                </label>
              </div>
            </div>
          </EditorRow>
        ) : null}

        {form.githubCommentEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Comment01Icon} strokeWidth={1.8} className="size-4" />}
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.commentOnPullRequest} />
                </span>
                {!githubConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description={
              githubConnected
                ? intl.formatMessage(
                    workspaceAutomationFormMessages.githubCommentConnectedDescription,
                  )
                : intl.formatMessage(
                    workspaceAutomationFormMessages.githubCommentDisconnectedDescription,
                    {
                      link: (chunks) => (
                        <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                          {chunks}
                        </Link>
                      ),
                    },
                  )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(
                  workspaceAutomationFormMessages.removeGithubCommentNotifications,
                )}
                onClick={() => onChange({ ...form, githubCommentEnabled: false })}
              />
            }
          >
            {!form.githubEnabled ? (
              <GithubRepositorySelect
                disabled={disabled}
                error={errors.githubRepository}
                form={form}
                onChange={onChange}
                repositories={repositories}
              />
            ) : null}
          </EditorRow>
        ) : null}

        {form.slackEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-4" />}
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.sendToSlack} />
                </span>
                {!slackConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description={
              slackConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.slackConnectedDescription)
                : intl.formatMessage(workspaceAutomationFormMessages.slackDisconnectedDescription, {
                    link: (chunks) => (
                      <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                        {chunks}
                      </Link>
                    ),
                  })
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeSlackNotifications)}
                onClick={() => onChange({ ...form, slackEnabled: false, slackChannelId: "" })}
              />
            }
          >
            <SlackChannelSelect
              disabled={disabled}
              error={errors.slackChannelId}
              organizationSlug={organizationSlug}
              slackConnected={slackConnected}
              value={form.slackChannelId}
              onChange={(slackChannelId) => onChange({ ...form, slackChannelId })}
            />
          </EditorRow>
        ) : null}

        {form.emailEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Mail01Icon} className="size-4" />}
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.sendEmail} />
                </span>
                {!emailConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.enableFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description={
              emailConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.emailConnectedDescription)
                : intl.formatMessage(workspaceAutomationFormMessages.emailDisconnectedDescription, {
                    link: (chunks) => (
                      <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                        {chunks}
                      </Link>
                    ),
                  })
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeEmailNotifications)}
                onClick={() => onChange({ ...form, emailEnabled: false, emailRecipients: [] })}
              />
            }
          >
            <div className="grid gap-1.5">
              <Label htmlFor="email-recipients" className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.recipientsLabel} />
              </Label>
              <Textarea
                id="email-recipients"
                value={form.emailRecipients.join("\n")}
                disabled={disabled || !emailConnected}
                className="min-h-20 rounded-lg text-sm"
                placeholder={"ops@company.com\ndev@company.com"}
                onChange={(event) =>
                  onChange({
                    ...form,
                    emailRecipients: event.target.value
                      .split(/\n|,/)
                      .map((value) => value.trim())
                      .filter(Boolean),
                  })
                }
              />
              <FieldError message={errors.emailRecipients} />
            </div>
          </EditorRow>
        ) : null}

        {form.contentfulEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={SearchIcon} className="size-4" />}
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.contentfulTranslate} />
                </span>
                {!contentfulConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description={
              contentfulConnected
                ? intl.formatMessage(
                    workspaceAutomationFormMessages.contentfulTranslateConnectedDescription,
                  )
                : intl.formatMessage(
                    workspaceAutomationFormMessages.contentfulTranslateDisconnectedDescription,
                    {
                      link: (chunks) => (
                        <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                          {chunks}
                        </Link>
                      ),
                    },
                  )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(
                  workspaceAutomationFormMessages.removeContentfulTranslate,
                )}
                onClick={() => onChange({ ...form, contentfulEnabled: false })}
              />
            }
          >
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  <FormattedMessage {...workspaceAutomationFormMessages.connectionLabel} />
                </Label>
                <Select
                  value={form.contentfulConnectionId || undefined}
                  disabled={disabled || !contentfulConnected}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    const connection = contentfulConnections.find((entry) => entry.id === value);
                    onChange({
                      ...form,
                      contentfulConnectionId: value,
                      contentfulContentTypeIds:
                        connection?.contentTypeIds ?? form.contentfulContentTypeIds,
                    });
                  }}
                >
                  <SelectTrigger className="h-8 w-full rounded-lg">
                    <span className="truncate">
                      {selectedContentfulConnectionLabel(
                        intl,
                        form.contentfulConnectionId,
                        contentfulConnections,
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {contentfulConnections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.enabled
                          ? connection.displayName
                          : intl.formatMessage(
                              workspaceAutomationFormMessages.connectionDisabledSuffix,
                              { name: connection.displayName },
                            )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.contentfulConnectionId} />
              </div>
              {showContentfulEntryId ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="contentful-entry-id" className="text-xs text-muted-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.entryIdLabel} />
                  </Label>
                  <Input
                    id="contentful-entry-id"
                    value={form.contentfulEntryId}
                    disabled={disabled}
                    className="h-8 rounded-lg text-sm"
                    placeholder={intl.formatMessage(
                      workspaceAutomationFormMessages.contentfulEntryIdPlaceholder,
                    )}
                    onChange={(event) =>
                      onChange({ ...form, contentfulEntryId: event.target.value })
                    }
                  />
                  <FieldError message={errors.contentfulEntryId} />
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label
                  id={contentfulTargetLocalesFieldId}
                  className="text-xs text-muted-foreground"
                >
                  <FormattedMessage {...workspaceAutomationFormMessages.targetLocalesLabel} />
                </Label>
                <ContentfulTargetLocalesPicker
                  availableLocales={contentfulAvailableTargetLocales}
                  disabled={disabled}
                  emptyMessage={intl.formatMessage(
                    workspaceAutomationFormMessages.contentfulTargetLocalesEmpty,
                  )}
                  error={errors.contentfulTargetLocales}
                  labelledBy={contentfulTargetLocalesFieldId}
                  selectedLocales={form.contentfulTargetLocales}
                  onChange={(contentfulTargetLocales) =>
                    onChange({ ...form, contentfulTargetLocales })
                  }
                />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.runQa} />
                  </span>
                  <Switch
                    size="sm"
                    checked={form.contentfulRunQa}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...form, contentfulRunQa: checked })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.writeDrafts} />
                  </span>
                  <Switch
                    size="sm"
                    checked={form.contentfulWriteDrafts}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onChange({ ...form, contentfulWriteDrafts: checked })
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.overwriteTargets} />
                  </span>
                  <Switch
                    size="sm"
                    checked={form.contentfulOverwriteDraftLocales}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      onChange({ ...form, contentfulOverwriteDraftLocales: checked })
                    }
                  />
                </label>
              </div>
            </div>
          </EditorRow>
        ) : null}

        {form.crowdinEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siCrowdin} />}
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.crowdin} />
                </span>
                {!crowdinConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description={
              crowdinConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.crowdinDescription)
                : intl.formatMessage(
                    workspaceAutomationFormMessages.crowdinDisconnectedDescription,
                    {
                      link: (chunks) => (
                        <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                          {chunks}
                        </Link>
                      ),
                    },
                  )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeCrowdinTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    crowdinEnabled: false,
                    crowdinProjectId: "",
                  })
                }
              />
            }
          >
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.selectProject} />
              </Label>
              <Select
                value={form.crowdinProjectId || undefined}
                disabled={disabled || !crowdinConnected}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChange({ ...form, crowdinProjectId: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage(workspaceAutomationFormMessages.selectProject)}
                  >
                    {crowdinProjects.find((project) => project.id === form.crowdinProjectId)
                      ?.name ?? intl.formatMessage(workspaceAutomationFormMessages.selectProject)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {crowdinProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.crowdinProjectId} />
            </div>
          </EditorRow>
        ) : null}

        {form.createNativeTmsJobEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.createJob} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.createJobDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeCreateJob)}
                onClick={() =>
                  onChange({
                    ...form,
                    createNativeTmsJobEnabled: false,
                    createNativeTmsJobTargetLocales: [],
                    assignTranslateWithAgentEnabled: false,
                    triggerMode:
                      form.triggerMode === "source_upload" && !form.contentfulEnabled
                        ? "manual"
                        : form.triggerMode,
                  })
                }
              />
            }
          >
            <div className="grid gap-3">
              <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <span className="text-xs text-foreground">
                  <FormattedMessage {...workspaceAutomationFormMessages.useProjectTargetLocales} />
                </span>
                <Switch
                  size="sm"
                  checked={form.createNativeTmsJobUseProjectTargetLocales}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...form,
                      createNativeTmsJobUseProjectTargetLocales: checked,
                      createNativeTmsJobTargetLocales: checked
                        ? []
                        : form.createNativeTmsJobTargetLocales,
                    })
                  }
                />
              </label>
              {!form.createNativeTmsJobUseProjectTargetLocales ? (
                <div className="grid gap-1.5">
                  <Label
                    id={createNativeTmsJobTargetLocalesFieldId}
                    className="text-xs text-muted-foreground"
                  >
                    <FormattedMessage {...workspaceAutomationFormMessages.targetLocalesLabel} />
                  </Label>
                  <ContentfulTargetLocalesPicker
                    availableLocales={createNativeTmsJobAvailableTargetLocales}
                    disabled={disabled}
                    emptyMessage={intl.formatMessage(
                      workspaceAutomationFormMessages.chooseProjectForTargetLocales,
                    )}
                    error={errors.createNativeTmsJobTargetLocales}
                    labelledBy={createNativeTmsJobTargetLocalesFieldId}
                    selectedLocales={form.createNativeTmsJobTargetLocales}
                    onChange={(createNativeTmsJobTargetLocales) =>
                      onChange({ ...form, createNativeTmsJobTargetLocales })
                    }
                  />
                </div>
              ) : null}
            </div>
          </EditorRow>
        ) : null}

        {form.assignTranslateWithAgentEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={BrainCircuitIcon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.translateWithAgent} />}
            description={
              <FormattedMessage
                {...workspaceAutomationFormMessages.translateWithAgentDescription}
              />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeTranslateWithAgent)}
                onClick={() =>
                  onChange({
                    ...form,
                    assignTranslateWithAgentEnabled: false,
                  })
                }
              />
            }
          />
        ) : null}

        {form.listIssuesEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Task01Icon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.listIssues} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.listIssuesDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeListIssues)}
                onClick={() => onChange({ ...form, listIssuesEnabled: false })}
              />
            }
          />
        ) : null}

        {form.createIssueEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Task01Icon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.createIssue} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.createIssueDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeCreateIssue)}
                onClick={() => onChange({ ...form, createIssueEnabled: false })}
              />
            }
          />
        ) : null}

        {form.mcpEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.mcpServer} />}
            description={
              mcpConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.mcpServerDescription)
                : intl.formatMessage(
                    workspaceAutomationFormMessages.mcpServerDisconnectedDescription,
                  )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeMcpServerTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    mcpEnabled: false,
                    mcpConnectionId: "",
                  })
                }
              />
            }
          >
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.selectConnection} />
              </Label>
              <Select
                value={form.mcpConnectionId || undefined}
                disabled={disabled || !mcpConnected}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChange({ ...form, mcpConnectionId: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage(
                      workspaceAutomationFormMessages.selectConnection,
                    )}
                  >
                    {enabledMcpServerConnections.find(
                      (connection) => connection.id === form.mcpConnectionId,
                    )?.displayName ??
                      intl.formatMessage(workspaceAutomationFormMessages.selectConnection)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledMcpServerConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.mcpConnectionId} />
            </div>
          </EditorRow>
        ) : null}

        {form.semrushEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siSemrush} />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.semrush} />}
            description={
              semrushConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.semrushDescription)
                : intl.formatMessage(workspaceAutomationFormMessages.semrushDisconnectedDescription)
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeSemrushTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    semrushEnabled: false,
                    semrushConnectionId: "",
                  })
                }
              />
            }
          >
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.selectConnection} />
              </Label>
              <Select
                value={form.semrushConnectionId || undefined}
                disabled={disabled || !semrushConnected}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChange({ ...form, semrushConnectionId: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage(
                      workspaceAutomationFormMessages.selectConnection,
                    )}
                  >
                    {enabledSemrushConnections.find(
                      (connection) => connection.id === form.semrushConnectionId,
                    )?.displayName ??
                      intl.formatMessage(workspaceAutomationFormMessages.selectConnection)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledSemrushConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.semrushConnectionId} />
            </div>
          </EditorRow>
        ) : null}

        {form.ahrefsEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.ahrefs} />}
            description={
              ahrefsConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.ahrefsDescription)
                : intl.formatMessage(workspaceAutomationFormMessages.ahrefsDisconnectedDescription)
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeAhrefsTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    ahrefsEnabled: false,
                    ahrefsConnectionId: "",
                  })
                }
              />
            }
          >
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.selectConnection} />
              </Label>
              <Select
                value={form.ahrefsConnectionId || undefined}
                disabled={disabled || !ahrefsConnected}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChange({ ...form, ahrefsConnectionId: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage(
                      workspaceAutomationFormMessages.selectConnection,
                    )}
                  >
                    {enabledAhrefsConnections.find(
                      (connection) => connection.id === form.ahrefsConnectionId,
                    )?.displayName ??
                      intl.formatMessage(workspaceAutomationFormMessages.selectConnection)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledAhrefsConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.ahrefsConnectionId} />
            </div>
          </EditorRow>
        ) : null}

        {form.webSearchEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Globe02Icon} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.webSearch} />}
            description={intl.formatMessage(workspaceAutomationFormMessages.webSearchDescription)}
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeWebSearchTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    webSearchEnabled: false,
                    webSearchProvider: "auto",
                  })
                }
              />
            }
          >
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.webSearchProvider} />
              </Label>
              <Select
                value={form.webSearchProvider}
                disabled={disabled}
                onValueChange={(value) => {
                  if (value !== "auto" && value !== "perplexity" && value !== "exa") {
                    return;
                  }
                  onChange({ ...form, webSearchProvider: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {form.webSearchProvider === "perplexity"
                      ? intl.formatMessage(
                          workspaceAutomationFormMessages.webSearchProviderPerplexity,
                        )
                      : form.webSearchProvider === "exa"
                        ? intl.formatMessage(workspaceAutomationFormMessages.webSearchProviderExa)
                        : intl.formatMessage(workspaceAutomationFormMessages.webSearchProviderAuto)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    <FormattedMessage {...workspaceAutomationFormMessages.webSearchProviderAuto} />
                  </SelectItem>
                  <SelectItem value="perplexity">
                    <FormattedMessage
                      {...workspaceAutomationFormMessages.webSearchProviderPerplexity}
                    />
                  </SelectItem>
                  <SelectItem value="exa">
                    <FormattedMessage {...workspaceAutomationFormMessages.webSearchProviderExa} />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </EditorRow>
        ) : null}

        <AddToolMenu
          contentfulConnected={contentfulConnected}
          crowdinConnected={crowdinConnected}
          crowdinProjects={crowdinProjects}
          disabled={disabled}
          emailConnected={emailConnected}
          form={form}
          githubConnected={githubConnected}
          knowledgeAvailable={knowledgeAvailable}
          mcpConnected={mcpConnected}
          onChange={onChange}
          repositories={repositories}
          ahrefsConnected={ahrefsConnected}
          semrushConnected={semrushConnected}
          slackConnected={slackConnected}
        />
      </EditorPanel>

      <Sheet open={memoriesOpen} onOpenChange={setMemoriesOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl md:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              <FormattedMessage {...workspaceAutomationFormMessages.manageMemoriesTitle} />
            </SheetTitle>
            <SheetDescription>
              <FormattedMessage {...workspaceAutomationFormMessages.manageMemoriesDescription} />
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 pb-6">
            <KnowledgeMemoryEditor
              organizationSlug={organizationSlug}
              canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
            />
          </div>
        </SheetContent>
      </Sheet>
    </EditorSection>
  );
}

function formatRunStatus(intl: IntlShape, status: string) {
  const statusMessages = {
    queued: workspaceAutomationFormMessages.runStatusQueued,
    running: workspaceAutomationFormMessages.runStatusRunning,
    succeeded: workspaceAutomationFormMessages.runStatusSucceeded,
    failed: workspaceAutomationFormMessages.runStatusFailed,
    cancelled: workspaceAutomationFormMessages.runStatusCancelled,
    skipped: workspaceAutomationFormMessages.runStatusSkipped,
  } as const;

  const message = statusMessages[status as keyof typeof statusMessages];
  return message ? intl.formatMessage(message) : status;
}

function formatTriggerSource(intl: IntlShape, triggerSource: string) {
  const triggerMessages = {
    manual: workspaceAutomationFormMessages.triggerSourceManual,
    scheduled: workspaceAutomationFormMessages.triggerSourceScheduled,
    github: workspaceAutomationFormMessages.triggerSourceGithub,
    contentful: workspaceAutomationFormMessages.triggerSourceContentful,
    source_upload: workspaceAutomationFormMessages.triggerSourceSourceUpload,
  } as const;

  const message = triggerMessages[triggerSource as keyof typeof triggerMessages];
  return message ? intl.formatMessage(message) : triggerSource;
}

function RunHistoryTable({ runs }: { runs: WorkspaceAutomationRunRecord[] }) {
  const intl = useIntl();

  if (runs.length === 0) {
    return (
      <EditorPanel className="px-4 py-10">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage {...workspaceAutomationFormMessages.noRunsYet} />
        </p>
      </EditorPanel>
    );
  }

  return (
    <EditorPanel>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historyStatus} />
        </span>
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historyTrigger} />
        </span>
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historySummary} />
        </span>
        <span>
          <FormattedMessage {...workspaceAutomationFormMessages.historyCompleted} />
        </span>
      </div>
      {runs.map((run) => (
        <div
          key={run.id}
          className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-border px-4 py-4 text-sm last:border-b-0"
        >
          <Badge variant="outline" className="w-fit">
            {formatRunStatus(intl, run.status)}
          </Badge>
          <span>{formatTriggerSource(intl, run.triggerSource)}</span>
          <span className="truncate text-muted-foreground">
            {Object.keys(run.outputSummary).length > 0
              ? JSON.stringify(run.outputSummary)
              : EMPTY_CELL}
          </span>
          <span className="text-muted-foreground">
            {run.completedAt ? new Date(run.completedAt).toLocaleString() : EMPTY_CELL}
          </span>
        </div>
      ))}
    </EditorPanel>
  );
}

export function WorkspaceAutomationEditor({
  actions,
  canUpdateKnowledgeMemory = false,
  disabled,
  errors,
  form,
  knowledgeAvailable = false,
  mode,
  onChange,
  organizationSlug,
  runHistory,
}: {
  actions?: ReactNode;
  canUpdateKnowledgeMemory?: boolean;
  disabled?: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  knowledgeAvailable?: boolean;
  mode: "create" | "detail";
  onChange: (next: WorkspaceAutomationFormState) => void;
  organizationSlug: string;
  runHistory?: WorkspaceAutomationRunRecord[];
}) {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<AutomationEditorTab>("settings");

  const projectsQuery = useQuery({
    queryKey: ["projects", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].projects.$get({
        param: { organizationSlug },
      });
      if (response.status !== 200) {
        throw new Error("Failed to load projects");
      }
      const body = await response.json();
      return body.projects;
    },
  });

  const githubInstallationQuery = useQuery({
    queryKey: ["github-installation", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["github-installation"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load GitHub installation");
      }
      const body = await response.json();
      return body.installation as { githubInstallationId: string } | null;
    },
  });

  const githubConnected = Boolean(githubInstallationQuery.data);
  const tmsProviderQuery = useActiveTmsProvider(organizationSlug);
  const crowdinConnected = isCrowdinAutomationConnected(tmsProviderQuery.data?.providerKind);
  const tmsLiveProjectsQuery = useTmsLiveProjects(organizationSlug, {
    enabled: crowdinConnected,
  });

  const repositoriesQuery = useQuery({
    queryKey: ["github-installation-repositories", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"][
        "github-installation"
      ].repositories.$get({
        param: { organizationSlug },
        query: {},
      });
      if (!response.ok) {
        throw new Error("Failed to load GitHub repositories");
      }
      const body = await response.json();
      return body.repositories as GithubRepositoryOption[];
    },
    enabled: githubConnected,
  });

  const slackQuery = useQuery({
    queryKey: ["slack-agent", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["agent-slack"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Slack settings");
      }
      const body = await response.json();
      return body.slackAgent;
    },
  });

  const emailQuery = useQuery({
    queryKey: ["email-agent", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["agent-email"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load email agent settings");
      }
      const body = await response.json();
      return body.emailAgent;
    },
  });

  const contentfulConnectionsQuery = useQuery({
    queryKey: ["contentful-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["contentful-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Contentful connections");
      }
      const body = await response.json();
      return body.contentfulConnections as ContentfulConnectionOption[];
    },
  });

  const mcpServerConnectionsQuery = useQuery({
    queryKey: ["mcp-server-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["mcp-server-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load MCP server connections");
      }
      const body = await response.json();
      return body.mcpServerConnections as McpServerConnectionOption[];
    },
  });

  const semrushConnectionsQuery = useQuery({
    queryKey: ["semrush-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["semrush-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Semrush connections");
      }
      const body = await response.json();
      return body.semrushConnections as SemrushConnectionOption[];
    },
  });

  const ahrefsConnectionsQuery = useQuery({
    queryKey: ["ahrefs-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["ahrefs-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Ahrefs connections");
      }
      const body = await response.json();
      return body.ahrefsConnections as AhrefsConnectionOption[];
    },
  });

  const repositories = useMemo(
    () =>
      selectableAutomationRepositories(
        repositoriesQuery.data ?? [],
        form.githubInstallationRepositoryId,
      ),
    [form.githubInstallationRepositoryId, repositoriesQuery.data],
  );
  const canActivate = workspaceAutomationFormCanActivate(form);
  const slackConnected = Boolean(slackQuery.data?.enabled);
  const emailConnected = Boolean(emailQuery.data?.enabled);
  const contentfulConnections = contentfulConnectionsQuery.data ?? [];
  const contentfulConnected = contentfulConnections.length > 0;
  const mcpServerConnections = mcpServerConnectionsQuery.data ?? [];
  const semrushConnections = semrushConnectionsQuery.data ?? [];
  const ahrefsConnections = ahrefsConnectionsQuery.data ?? [];
  const crowdinLiveProjects = (tmsLiveProjectsQuery.data ?? []).map(toCrowdinProjectOption);
  const hasHistory = mode === "detail";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <Label htmlFor="automation-name" className="sr-only">
              <FormattedMessage {...workspaceAutomationFormMessages.automationNameLabel} />
            </Label>
            <Input
              id="automation-name"
              value={form.name}
              disabled={disabled}
              placeholder={intl.formatMessage(
                workspaceAutomationFormMessages.untitledAutomationPlaceholder,
              )}
              className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-medium shadow-none ring-0 focus-visible:ring-0 md:text-2xl"
              onChange={(event) => onChange({ ...form, name: event.target.value })}
            />
            <FieldError message={errors.name} />
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
          <label className="flex items-center gap-2 text-foreground">
            <Switch
              checked={form.status === "active"}
              disabled={disabled || !canActivate}
              onCheckedChange={(checked) =>
                onChange({
                  ...form,
                  status: checked ? "active" : "paused",
                })
              }
            />
            <span>
              {form.status === "active" ? (
                <FormattedMessage {...workspaceAutomationFormMessages.statusActive} />
              ) : (
                <FormattedMessage {...workspaceAutomationFormMessages.statusPaused} />
              )}
            </span>
          </label>
          {form.createNativeTmsJobEnabled ||
          form.assignTranslateWithAgentEnabled ||
          form.contentfulEnabled ||
          (form.githubEnabled && form.githubMode === "sync") ||
          form.triggerMode === "source_upload" ? (
            <>
              <span className="text-border">{METADATA_SEPARATOR}</span>
              <HeaderProjectSelector
                disabled={disabled}
                form={form}
                isError={projectsQuery.isError}
                isLoading={projectsQuery.isLoading}
                onChange={onChange}
                projects={projectsQuery.data ?? []}
              />
            </>
          ) : null}
          {form.triggerMode !== "manual" ? (
            <>
              <span className="text-border">{METADATA_SEPARATOR}</span>
              <span>{triggerSummary(intl, form, repositories, projectsQuery.data ?? [])}</span>
            </>
          ) : null}
          <span className="text-border">{METADATA_SEPARATOR}</span>
          <span>
            {intl.formatMessage(workspaceAutomationFormMessages.toolCount, {
              count: toolCount(form),
            })}
          </span>
        </div>
        <FieldError message={errors.projectId} />
        {!canActivate ? (
          <p className="text-xs text-muted-foreground">
            <FormattedMessage {...workspaceAutomationFormMessages.activateRequiresTool} />
          </p>
        ) : null}
        <FieldError message={errors.form} />
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AutomationEditorTab)}>
        <TabsList>
          <TabsTrigger value="settings">
            <FormattedMessage {...workspaceAutomationFormMessages.settingsTab} />
          </TabsTrigger>
          {hasHistory ? (
            <TabsTrigger value="history">
              <FormattedMessage {...workspaceAutomationFormMessages.runHistoryTab} />
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="settings" className="mt-4 flex flex-col gap-6">
          <TriggerSettings
            contentfulConnected={contentfulConnected}
            disabled={disabled}
            errors={errors}
            form={form}
            githubConnected={githubConnected}
            onChange={onChange}
            repositories={repositories}
          />

          <EditorSection
            title={intl.formatMessage(workspaceAutomationFormMessages.agentInstructionsSection)}
          >
            <div className="relative rounded-xl">
              <Textarea
                id="automation-instructions"
                value={form.instructions}
                disabled={disabled}
                className="relative z-0 min-h-80 resize-y rounded-xl border-border bg-muted pb-10 font-sans text-sm leading-6"
                placeholder={intl.formatMessage(
                  workspaceAutomationFormMessages.instructionsPlaceholder,
                )}
                onChange={(event) => onChange({ ...form, instructions: event.target.value })}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-px bottom-px z-10 h-11 rounded-b-[calc(0.75rem-1px)] bg-linear-to-t from-gray-alpha-200 via-gray-alpha-100 to-transparent backdrop-blur-sm"
              />
            </div>
            <FieldError message={errors.instructions} />
          </EditorSection>

          <ToolsSettings
            canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
            contentfulConnections={contentfulConnections}
            crowdinConnected={crowdinConnected}
            crowdinLiveProjects={crowdinLiveProjects}
            disabled={disabled}
            emailConnected={emailConnected}
            errors={errors}
            form={form}
            githubConnected={githubConnected}
            knowledgeAvailable={knowledgeAvailable}
            mcpServerConnections={mcpServerConnections}
            onChange={onChange}
            organizationSlug={organizationSlug}
            projects={projectsQuery.data ?? []}
            repositories={repositories}
            ahrefsConnections={ahrefsConnections}
            semrushConnections={semrushConnections}
            slackConnected={slackConnected}
          />
        </TabsContent>

        {hasHistory ? (
          <TabsContent value="history" className="mt-4">
            <RunHistoryTable runs={runHistory ?? []} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

export function WorkspaceAutomationForm(props: {
  organizationSlug: string;
  form: WorkspaceAutomationFormState;
  errors: Record<string, string | undefined>;
  disabled?: boolean;
  knowledgeAvailable?: boolean;
  canUpdateKnowledgeMemory?: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  return <WorkspaceAutomationEditor mode="create" {...props} />;
}
