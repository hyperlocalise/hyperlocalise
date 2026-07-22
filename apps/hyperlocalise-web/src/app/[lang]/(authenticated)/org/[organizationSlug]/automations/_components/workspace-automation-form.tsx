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
  FolderLibraryIcon,
  GitBranchIcon,
  SlackIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { ClockIcon, MailIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";
import type { SimpleIcon } from "simple-icons";
import {
  siGoogle,
  siGoogleads,
  siGoogleanalytics,
  siLinear,
  siMeta,
  siSemrush,
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
  DropdownMenuShortcut,
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
import { workspaceAutomationFormMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.messages";
import { getLocaleLabel } from "@/lib/i18n/locales";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { workspaceAutomationFormCanActivate } from "@/lib/agents/workspace-automation-view-model";
import type { WorkspaceAutomationRunRecord } from "@/lib/agents/workspace-automations";
import { cn } from "@/lib/primitives/cn";

const api = createApiClient();

type ProjectOption = {
  id: string;
  name: string;
  source?: string;
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
type SlackChannelOption = { id: string; name: string; private: boolean };
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
  { id: "ahrefs", name: "Ahrefs" },
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

  return <SearchIcon className="size-4" />;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
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
      <Trash2Icon className="size-4" />
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
    return intl.formatMessage(workspaceAutomationFormMessages.githubPushSummary, {
      repository: repositoryLabel,
      branches: branchLabel,
    });
  }

  if (form.triggerMode === "contentful") {
    return intl.formatMessage(workspaceAutomationFormMessages.contentfulWebhook);
  }

  if (form.triggerMode === "source_upload") {
    const project = projects.find((entry) => entry.id === form.translationProjectId);
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
    Number(form.contentfulEnabled) +
    Number(form.translationEnabled) +
    Number(form.knowledgeEnabled) +
    Number(form.mcpEnabled) +
    Number(form.semrushEnabled)
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

  return repositories.find((repository) => repository.enabled)?.id ?? repositories[0]?.id ?? "";
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

function selectedSlackChannelLabel(
  intl: IntlShape,
  channelId: string,
  channels: SlackChannelOption[],
) {
  if (!channelId) {
    return intl.formatMessage(workspaceAutomationFormMessages.selectChannel);
  }

  const channel = channels.find((entry) => entry.id === channelId);
  if (!channel) {
    return channelId;
  }

  return channel.private
    ? intl.formatMessage(workspaceAutomationFormMessages.privateChannelSuffix, {
        name: channel.name,
      })
    : intl.formatMessage(workspaceAutomationFormMessages.publicChannelLabel, {
        name: channel.name,
      });
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
    (form.translationEnabled && (form.triggerMode !== "github" || !form.githubEnabled));
  const selectableProjects = usesTranslationProject
    ? projects.filter((project) => project.source !== "external_tms")
    : projects;
  const activeProjectId = usesTranslationProject ? form.translationProjectId : form.githubProjectId;
  const selectedProject = selectableProjects.find((project) => project.id === activeProjectId);
  const triggerLabel =
    selectedProject?.name ??
    (activeProjectId
      ? intl.formatMessage(workspaceAutomationFormMessages.unknownProject)
      : intl.formatMessage(workspaceAutomationFormMessages.selectProject));

  function handleProjectSelect(projectId: string) {
    if (usesTranslationProject) {
      onChange({
        ...form,
        translationProjectId: projectId,
        ...(form.githubEnabled ? { githubProjectId: projectId } : {}),
      });
      return;
    }

    onChange({
      ...form,
      githubProjectId: projectId,
      ...(form.translationEnabled ? { translationProjectId: projectId } : {}),
    });
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
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.selectedShortcut} />
                </DropdownMenuShortcut>
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
                  <DropdownMenuShortcut>
                    <FormattedMessage {...workspaceAutomationFormMessages.removeShortcut} />
                  </DropdownMenuShortcut>
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
              <ClockIcon className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.manualRun} />
              {form.triggerMode === "manual" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "scheduled"}
              onClick={() => onChange({ ...form, triggerMode: "scheduled" })}
            >
              <ClockIcon className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.scheduled} />
              {form.triggerMode === "scheduled" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                form.triggerMode === "github" ||
                !githubConnected ||
                (form.githubEnabled && form.githubMode === "agent")
              }
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
              <FormattedMessage {...workspaceAutomationFormMessages.githubPush} />
              {form.triggerMode === "github" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !githubConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : form.githubEnabled && form.githubMode === "agent" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.syncOnlyShortcut} />
                </DropdownMenuShortcut>
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
              <SearchIcon className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.contentfulWebhook} />
              {form.triggerMode === "contentful" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !contentfulConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "source_upload"}
              onClick={() =>
                onChange({
                  ...form,
                  triggerMode: "source_upload",
                  translationEnabled: true,
                  translationUseProjectTargetLocales: true,
                  translationProjectId: form.translationProjectId || form.githubProjectId || "",
                })
              }
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.sourceUpload} />
              {form.triggerMode === "source_upload" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
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
            icon={<ClockIcon className="size-4" />}
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
              <FieldError message={errors.githubRepository} />
            </div>
          </EditorRow>
        ) : null}

        {form.triggerMode === "manual" ? (
          <EditorRow
            icon={<ClockIcon className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.manualOnlyTitle} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.manualOnlyDescription} />
            }
          />
        ) : null}

        {form.triggerMode === "contentful" ? (
          <EditorRow
            icon={<SearchIcon className="size-4" />}
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
  disabled,
  emailConnected,
  form,
  githubConnected,
  knowledgeAvailable,
  mcpConnected,
  onChange,
  repositories,
  semrushConnected,
  slackConnected,
}: {
  contentfulConnected: boolean;
  disabled?: boolean;
  emailConnected: boolean;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  knowledgeAvailable: boolean;
  mcpConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
  semrushConnected: boolean;
  slackConnected: boolean;
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
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !knowledgeAvailable ? (
                <DropdownMenuShortcut>
                  <FormattedMessage
                    {...workspaceAutomationFormMessages.enableKnowledgeFirstShortcut}
                  />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <FormattedMessage {...workspaceAutomationFormMessages.supportedTools} />
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={form.githubEnabled || !githubConnected}
              onClick={() => {
                const defaultRepositoryId = resolveDefaultGithubRepositoryId(form, repositories);

                onChange({
                  ...form,
                  githubEnabled: true,
                  githubMode: "agent",
                  repositoryTargetKind: "github",
                  githubInstallationRepositoryId: defaultRepositoryId,
                  githubProjectId: "",
                  pushSourceEnabled: false,
                  pullTranslationsEnabled: false,
                  validationEnabled: false,
                });
              }}
            >
              <HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.useGithubRepo} />
              {form.githubEnabled && form.githubMode === "agent" ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !githubConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.githubEnabled || !githubConnected}
              onClick={() => {
                const defaultRepositoryId = resolveDefaultGithubRepositoryId(form, repositories);

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
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !githubConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.slackEnabled || !slackConnected}
              onClick={() => onChange({ ...form, slackEnabled: true })}
            >
              <HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.sendToSlack} />
              {form.slackEnabled ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !slackConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.emailEnabled || !emailConnected}
              onClick={() => onChange({ ...form, emailEnabled: true })}
            >
              <MailIcon className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.sendEmail} />
              {form.emailEnabled ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !emailConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.enableFirstShortcut} />
                </DropdownMenuShortcut>
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
              <SearchIcon className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.contentfulTranslate} />
              {form.contentfulEnabled ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !contentfulConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.translationEnabled}
              onClick={() =>
                onChange({
                  ...form,
                  translationEnabled: true,
                  translationUseProjectTargetLocales: true,
                  translationProjectId: form.translationProjectId || form.githubProjectId || "",
                  triggerMode: form.triggerMode === "manual" ? "source_upload" : form.triggerMode,
                })
              }
            >
              <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.translate} />
              {form.translationEnabled ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.mcpEnabled || !mcpConnected}
              onClick={() => onChange({ ...form, mcpEnabled: true })}
            >
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
              <FormattedMessage {...workspaceAutomationFormMessages.mcpServer} />
              {form.mcpEnabled ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !mcpConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.semrushEnabled || !semrushConnected}
              onClick={() => onChange({ ...form, semrushEnabled: true })}
            >
              <AutomationToolMenuIcon icon={siSemrush} />
              <FormattedMessage {...workspaceAutomationFormMessages.semrush} />
              {form.semrushEnabled ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuShortcut>
              ) : !semrushConnected ? (
                <DropdownMenuShortcut>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuShortcut>
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
  semrushConnections,
  slackChannels,
  slackChannelsLoading,
  slackConnected,
}: {
  canUpdateKnowledgeMemory: boolean;
  contentfulConnections: ContentfulConnectionOption[];
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
  semrushConnections: SemrushConnectionOption[];
  slackChannels: SlackChannelOption[];
  slackChannelsLoading: boolean;
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
  const contentfulTargetLocalesFieldId = "contentful-target-locales";
  const selectedContentfulProject = projects.find(
    (project) => project.id === form.contentfulProjectId,
  );
  const contentfulAvailableTargetLocales = selectedContentfulProject?.targetLocales ?? [];
  const showContentfulEntryId = form.triggerMode === "scheduled";
  const selectedTranslationProject = projects.find(
    (project) => project.id === form.translationProjectId,
  );
  const translationAvailableTargetLocales = selectedTranslationProject?.targetLocales ?? [];
  const translationTargetLocalesFieldId = "translation-target-locales";
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
                  onClick={() => onChange({ ...form, knowledgeEnabled: false })}
                />
              </>
            }
          />
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
                    repositoryTargetKind: "none",
                    githubInstallationRepositoryId: "",
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
                    repositoryTargetKind: "none",
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
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">
                <FormattedMessage {...workspaceAutomationFormMessages.channelLabel} />
              </Label>
              <Select
                value={form.slackChannelId || undefined}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChange({ ...form, slackChannelId: value });
                }}
                disabled={disabled || !slackConnected || slackChannelsLoading}
              >
                <SelectTrigger className="h-8 w-full rounded-lg">
                  <span className="truncate">
                    {slackChannelsLoading
                      ? intl.formatMessage(workspaceAutomationFormMessages.loadingChannels)
                      : selectedSlackChannelLabel(intl, form.slackChannelId, slackChannels)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {!slackChannelsLoading && slackChannels.length === 0 ? (
                    <SelectItem value="__no_slack_channels" disabled>
                      {intl.formatMessage(workspaceAutomationFormMessages.noChannelsFound)}
                    </SelectItem>
                  ) : null}
                  {slackChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.private
                        ? intl.formatMessage(workspaceAutomationFormMessages.privateChannelSuffix, {
                            name: channel.name,
                          })
                        : intl.formatMessage(workspaceAutomationFormMessages.publicChannelLabel, {
                            name: channel.name,
                          })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.slackChannelId} />
            </div>
          </EditorRow>
        ) : null}

        {form.emailEnabled ? (
          <EditorRow
            icon={<MailIcon className="size-4" />}
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
            icon={<SearchIcon className="size-4" />}
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
              <div
                className={cn(
                  "grid gap-2",
                  showContentfulEntryId ? "md:grid-cols-2" : "md:grid-cols-1",
                )}
              >
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">
                    <FormattedMessage {...workspaceAutomationFormMessages.projectLabel} />
                  </Label>
                  <Select
                    value={form.contentfulProjectId || undefined}
                    disabled={disabled}
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }
                      const project = projects.find((entry) => entry.id === value);
                      onChange({
                        ...form,
                        contentfulProjectId: value,
                        contentfulSourceLocale:
                          project?.sourceLocale ?? form.contentfulSourceLocale,
                        contentfulTargetLocales:
                          project?.targetLocales && form.contentfulTargetLocales.length === 0
                            ? project.targetLocales
                            : form.contentfulTargetLocales.filter((locale) =>
                                project?.targetLocales.includes(locale),
                              ),
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full rounded-lg">
                      <span className="truncate">
                        {projects.find((project) => project.id === form.contentfulProjectId)
                          ?.name ??
                          intl.formatMessage(workspaceAutomationFormMessages.selectProject)}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.contentfulProjectId} />
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
              </div>
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

        {form.translationEnabled ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />}
            title={<FormattedMessage {...workspaceAutomationFormMessages.translate} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.translateDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeTranslate)}
                onClick={() =>
                  onChange({
                    ...form,
                    translationEnabled: false,
                    translationProjectId: "",
                    translationTargetLocales: [],
                    triggerMode: form.triggerMode === "source_upload" ? "manual" : form.triggerMode,
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
                  checked={form.translationUseProjectTargetLocales}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...form,
                      translationUseProjectTargetLocales: checked,
                      translationTargetLocales: checked ? [] : form.translationTargetLocales,
                    })
                  }
                />
              </label>
              {!form.translationUseProjectTargetLocales ? (
                <div className="grid gap-1.5">
                  <Label
                    id={translationTargetLocalesFieldId}
                    className="text-xs text-muted-foreground"
                  >
                    <FormattedMessage {...workspaceAutomationFormMessages.targetLocalesLabel} />
                  </Label>
                  <ContentfulTargetLocalesPicker
                    availableLocales={translationAvailableTargetLocales}
                    disabled={disabled}
                    emptyMessage={intl.formatMessage(
                      workspaceAutomationFormMessages.chooseProjectForTargetLocales,
                    )}
                    error={errors.translationTargetLocales}
                    labelledBy={translationTargetLocalesFieldId}
                    selectedLocales={form.translationTargetLocales}
                    onChange={(translationTargetLocales) =>
                      onChange({ ...form, translationTargetLocales })
                    }
                  />
                </div>
              ) : null}
            </div>
          </EditorRow>
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

        <AddToolMenu
          contentfulConnected={contentfulConnected}
          disabled={disabled}
          emailConnected={emailConnected}
          form={form}
          githubConnected={githubConnected}
          knowledgeAvailable={knowledgeAvailable}
          mcpConnected={mcpConnected}
          onChange={onChange}
          repositories={repositories}
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

  const slackChannelsQuery = useQuery({
    queryKey: ["slack-agent-channels", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["agent-slack"].channels.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Slack channels");
      }
      const body = await response.json();
      return body.channels as SlackChannelOption[];
    },
    enabled: Boolean(slackQuery.data?.enabled),
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

  const repositories = useMemo(
    () => (repositoriesQuery.data ?? []).filter((repository) => !repository.archived),
    [repositoriesQuery.data],
  );
  const canActivate = workspaceAutomationFormCanActivate(form);
  const slackConnected = Boolean(slackQuery.data?.enabled);
  const emailConnected = Boolean(emailQuery.data?.enabled);
  const contentfulConnections = contentfulConnectionsQuery.data ?? [];
  const contentfulConnected = contentfulConnections.length > 0;
  const mcpServerConnections = mcpServerConnectionsQuery.data ?? [];
  const semrushConnections = semrushConnectionsQuery.data ?? [];
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
          {form.translationEnabled ||
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
        <FieldError message={errors.githubProjectId} />
        <FieldError message={errors.translationProjectId} />
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
            semrushConnections={semrushConnections}
            slackChannels={slackChannelsQuery.data ?? []}
            slackChannelsLoading={slackChannelsQuery.isLoading}
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
