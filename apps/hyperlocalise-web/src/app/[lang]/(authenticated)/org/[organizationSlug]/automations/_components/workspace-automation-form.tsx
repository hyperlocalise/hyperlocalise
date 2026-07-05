"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Add01Icon,
  ArrowDown01Icon,
  FolderLibraryIcon,
  GitBranchIcon,
  SlackIcon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { ClockIcon, MailIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { useIntl, type IntlShape } from "react-intl";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createApiClient } from "@/lib/api-client";
import {
  AUTOMATION_WEEKDAY_OPTIONS,
  addBranchPattern,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model";
import { AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/repository-automation-settings-panel.messages";
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

const COMING_SOON_SERP_TOOLS: readonly ComingSoonAutomationTool[] = [
  { id: "semrush", name: "Semrush", icon: siSemrush },
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
      return `Every hour · ${form.scheduledTimezone}`;
    }

    if (form.scheduledCadence === "weekly") {
      const weekdayMessage =
        AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[
          form.scheduledDayOfWeek as keyof typeof AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE
        ];
      const weekday = weekdayMessage
        ? intl.formatMessage(weekdayMessage)
        : intl.formatMessage(AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[1]);
      return `Every ${weekday} at ${formatHour(form.scheduledHourUtc)} · ${form.scheduledTimezone}`;
    }

    return `Every day at ${formatHour(form.scheduledHourUtc)} · ${form.scheduledTimezone}`;
  }

  if (form.triggerMode === "github") {
    const repository = repositories.find(
      (entry) => entry.id === form.githubInstallationRepositoryId,
    );
    const repositoryLabel = repository?.fullName ?? "repository required";
    const branchLabel = form.pushBranches.join(", ") || "branches required";
    return `GitHub push · ${repositoryLabel} · ${branchLabel}`;
  }

  if (form.triggerMode === "contentful") {
    return "Contentful webhook";
  }

  if (form.triggerMode === "source_upload") {
    const project = projects.find((entry) => entry.id === form.translationProjectId);
    return project?.name ? `Source upload · ${project.name}` : "Source upload · project required";
  }

  return "";
}

function toolCount(form: WorkspaceAutomationFormState) {
  return (
    Number(form.githubEnabled) +
    Number(form.slackEnabled) +
    Number(form.emailEnabled) +
    Number(form.contentfulEnabled) +
    Number(form.translationEnabled)
  );
}

function formatRepositoryOptionLabel(repository: GithubRepositoryOption) {
  return `${repository.fullName}${repository.enabled ? "" : " (disabled)"}`;
}

function selectedRepositoryLabel(
  repositoryId: string,
  repositories: GithubRepositoryOption[],
  placeholder = "Select repository",
) {
  if (!repositoryId) {
    return placeholder;
  }

  return (
    repositories.find((repository) => repository.id === repositoryId)?.fullName ??
    "Unknown repository"
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
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">Repository</Label>
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
              ? "Connect GitHub to choose a repository"
              : selectedRepositoryLabel(form.githubInstallationRepositoryId, repositories)}
          </span>
        </SelectTrigger>
        <SelectContent>
          {repositories.map((repository) => (
            <SelectItem key={repository.id} value={repository.id}>
              {formatRepositoryOptionLabel(repository)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

function selectedSlackChannelLabel(channelId: string, channels: SlackChannelOption[]) {
  if (!channelId) {
    return "Select channel";
  }

  const channel = channels.find((entry) => entry.id === channelId);
  return channel ? `#${channel.name}` : channelId;
}

function selectedContentfulConnectionLabel(
  connectionId: string,
  connections: ContentfulConnectionOption[],
) {
  if (!connectionId) {
    return "Select connection";
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
  const usesTranslationProject =
    form.triggerMode === "source_upload" ||
    (form.translationEnabled && (form.triggerMode !== "github" || !form.githubEnabled));
  const selectableProjects = usesTranslationProject
    ? projects.filter((project) => project.source !== "external_tms")
    : projects;
  const activeProjectId = usesTranslationProject ? form.translationProjectId : form.githubProjectId;
  const selectedProject = selectableProjects.find((project) => project.id === activeProjectId);
  const triggerLabel =
    selectedProject?.name ?? (activeProjectId ? "Unknown project" : "Select project");

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
          <DropdownMenuLabel>Projects</DropdownMenuLabel>
          {isError ? <DropdownMenuItem disabled>Unable to load projects</DropdownMenuItem> : null}
          {!isLoading && selectableProjects.length === 0 ? (
            <DropdownMenuItem disabled>No projects found</DropdownMenuItem>
          ) : null}
          {selectableProjects.map((project) => (
            <DropdownMenuItem key={project.id} onClick={() => handleProjectSelect(project.id)}>
              <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={1.8} className="size-4" />
              {project.name}
              {activeProjectId === project.id ? (
                <DropdownMenuShortcut>Selected</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatBranchPatternLabel(branches: string[]) {
  if (branches.length === 0) {
    return "Branches";
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
          <span className="truncate">{formatBranchPatternLabel(branches)}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={1.8}
            className="size-3.5 shrink-0 opacity-60"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56" align="start">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Branch patterns</DropdownMenuLabel>
            {branches.length === 0 ? (
              <DropdownMenuItem disabled>No branches added</DropdownMenuItem>
            ) : (
              branches.map((branch) => (
                <DropdownMenuItem
                  key={branch}
                  onClick={() => onChange(branches.filter((value) => value !== branch))}
                >
                  <span className="min-w-0 flex-1 truncate">{branch}</span>
                  <DropdownMenuShortcut>Remove</DropdownMenuShortcut>
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
              aria-label="Branch pattern"
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
              Add
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
          Add Trigger
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="start" sideOffset={2}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Supported triggers</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={form.triggerMode === "manual"}
              onClick={() => onChange({ ...form, triggerMode: "manual" })}
            >
              <ClockIcon className="size-4" />
              Manual run
              {form.triggerMode === "manual" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.triggerMode === "scheduled"}
              onClick={() => onChange({ ...form, triggerMode: "scheduled" })}
            >
              <ClockIcon className="size-4" />
              Scheduled
              {form.triggerMode === "scheduled" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
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
              GitHub push
              {form.triggerMode === "github" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !githubConnected ? (
                <DropdownMenuShortcut>Connect first</DropdownMenuShortcut>
              ) : form.githubEnabled && form.githubMode === "agent" ? (
                <DropdownMenuShortcut>Sync only</DropdownMenuShortcut>
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
              Contentful webhook
              {form.triggerMode === "contentful" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !contentfulConnected ? (
                <DropdownMenuShortcut>Connect first</DropdownMenuShortcut>
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
              Source upload
              {form.triggerMode === "source_upload" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
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
    <EditorSection title="Triggers">
      <EditorPanel>
        {form.triggerMode === "scheduled" ? (
          <EditorRow
            icon={<ClockIcon className="size-4" />}
            title={
              <>
                <span>Every</span>
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
                    <SelectItem value="hourly">Hour</SelectItem>
                    <SelectItem value="daily">Day</SelectItem>
                    <SelectItem value="weekly">Week</SelectItem>
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
                    <span>at</span>
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
                  aria-label="Schedule timezone"
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
            title="GitHub push"
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
                        form.githubInstallationRepositoryId,
                        repositories,
                        "Repository",
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {repositories.map((repository) => (
                      <SelectItem key={repository.id} value={repository.id}>
                        {formatRepositoryOptionLabel(repository)}
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
            title="Manual only"
            description="Runs only start when a teammate queues one from this automation."
          />
        ) : null}

        {form.triggerMode === "contentful" ? (
          <EditorRow
            icon={<SearchIcon className="size-4" />}
            title="Contentful webhook"
            description={
              contentfulConnected
                ? "Runs when Contentful sends a matching entry create or update webhook."
                : "Connect Contentful in Integrations before this trigger can run."
            }
          />
        ) : null}

        {form.triggerMode === "source_upload" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} className="size-4" />}
            title="Source upload"
            description="Runs when a source file is uploaded to the project selected above."
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
  onChange,
  repositories,
  slackConnected,
}: {
  contentfulConnected: boolean;
  disabled?: boolean;
  emailConnected: boolean;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
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
          Add Tool
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="max-h-(--available-height) w-80 overflow-y-auto"
          align="start"
          sideOffset={2}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel>Supported tools</DropdownMenuLabel>
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
              Use GitHub repo
              {form.githubEnabled && form.githubMode === "agent" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !githubConnected ? (
                <DropdownMenuShortcut>Connect first</DropdownMenuShortcut>
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
              GitHub sync workflows
              {form.githubEnabled && form.githubMode === "sync" ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !githubConnected ? (
                <DropdownMenuShortcut>Connect first</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.slackEnabled || !slackConnected}
              onClick={() => onChange({ ...form, slackEnabled: true })}
            >
              <HugeiconsIcon icon={SlackIcon} strokeWidth={1.8} className="size-4" />
              Send to Slack
              {form.slackEnabled ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !slackConnected ? (
                <DropdownMenuShortcut>Connect first</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.emailEnabled || !emailConnected}
              onClick={() => onChange({ ...form, emailEnabled: true })}
            >
              <MailIcon className="size-4" />
              Send email
              {form.emailEnabled ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !emailConnected ? (
                <DropdownMenuShortcut>Enable first</DropdownMenuShortcut>
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
              Contentful translate
              {form.contentfulEnabled ? (
                <DropdownMenuShortcut>Added</DropdownMenuShortcut>
              ) : !contentfulConnected ? (
                <DropdownMenuShortcut>Connect first</DropdownMenuShortcut>
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
              Translate
              {form.translationEnabled ? <DropdownMenuShortcut>Added</DropdownMenuShortcut> : null}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Coming soon</DropdownMenuLabel>
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
                <span className="min-w-0 flex-1">Google</span>
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
              Linear
              <ComingSoonBadge />
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ContentfulTargetLocalesPicker({
  availableLocales,
  disabled,
  emptyMessage = "Select a Contentful connection to choose target locales.",
  error,
  labelledBy,
  selectedLocales,
  onChange,
}: {
  availableLocales: string[];
  disabled?: boolean;
  emptyMessage?: string;
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
              {getLocaleLabel(locale)} ({locale})
            </Button>
          );
        })}
      </div>
      <FieldError message={error} />
    </>
  );
}

function ToolsSettings({
  contentfulConnections,
  disabled,
  emailConnected,
  errors,
  form,
  githubConnected,
  onChange,
  organizationSlug,
  projects,
  repositories,
  slackChannels,
  slackChannelsLoading,
  slackConnected,
}: {
  contentfulConnections: ContentfulConnectionOption[];
  disabled?: boolean;
  emailConnected: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  organizationSlug: string;
  projects: ProjectOption[];
  repositories: GithubRepositoryOption[];
  slackChannels: SlackChannelOption[];
  slackChannelsLoading: boolean;
  slackConnected: boolean;
}) {
  const contentfulConnected = contentfulConnections.length > 0;
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

  return (
    <EditorSection title="Tools">
      <EditorPanel>
        {form.githubEnabled && form.githubMode === "agent" ? (
          <EditorRow
            icon={<HugeiconsIcon icon={GitBranchIcon} strokeWidth={1.8} className="size-4" />}
            title="Use GitHub repo"
            description="Read the repository and follow your instructions. GitHub skills apply automatically."
            action={
              <DeleteToolButton
                disabled={disabled}
                label="Remove GitHub repo tool"
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
            title="GitHub sync workflows"
            description="Push source, pull translations, and validation checks."
            action={
              <DeleteToolButton
                disabled={disabled}
                label="Remove GitHub sync workflows"
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
                  <span className="text-xs text-foreground">Push source</span>
                  <Switch
                    size="sm"
                    checked={form.pushSourceEnabled}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...form, pushSourceEnabled: checked })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">Pull translations</span>
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
                  <span className="text-xs text-foreground">Validation</span>
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
                <span>Send to Slack</span>
                {!slackConnected ? <Badge variant="secondary">Connect first</Badge> : null}
              </>
            }
            description={
              slackConnected ? (
                "Notify a channel when runs reach a terminal state."
              ) : (
                <>
                  Connect Slack in{" "}
                  <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                    Integrations
                  </Link>{" "}
                  to use this tool.
                </>
              )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label="Remove Slack notifications"
                onClick={() => onChange({ ...form, slackEnabled: false, slackChannelId: "" })}
              />
            }
          >
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Channel</Label>
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
                      ? "Loading channels..."
                      : selectedSlackChannelLabel(form.slackChannelId, slackChannels)}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {!slackChannelsLoading && slackChannels.length === 0 ? (
                    <SelectItem value="__no_slack_channels" disabled>
                      No channels found
                    </SelectItem>
                  ) : null}
                  {slackChannels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      #{channel.name}
                      {channel.private ? " (private)" : ""}
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
                <span>Send email</span>
                {!emailConnected ? <Badge variant="secondary">Enable first</Badge> : null}
              </>
            }
            description={
              emailConnected ? (
                "Send terminal run summaries to specific recipients."
              ) : (
                <>
                  Enable the email agent in{" "}
                  <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                    Integrations
                  </Link>{" "}
                  to use email notifications.
                </>
              )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label="Remove email notifications"
                onClick={() => onChange({ ...form, emailEnabled: false, emailRecipients: [] })}
              />
            }
          >
            <div className="grid gap-1.5">
              <Label htmlFor="email-recipients" className="text-xs text-muted-foreground">
                Recipients
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
                <span>Contentful translate</span>
                {!contentfulConnected ? <Badge variant="secondary">Connect first</Badge> : null}
              </>
            }
            description={
              contentfulConnected ? (
                "Translate detected Contentful fields, run QA, and write drafts back for review."
              ) : (
                <>
                  Connect Contentful in{" "}
                  <Link href={`/org/${organizationSlug}/integrations`} className="underline">
                    Integrations
                  </Link>{" "}
                  to use this tool.
                </>
              )
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label="Remove Contentful translate"
                onClick={() => onChange({ ...form, contentfulEnabled: false })}
              />
            }
          >
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Connection</Label>
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
                        form.contentfulConnectionId,
                        contentfulConnections,
                      )}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {contentfulConnections.map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.displayName}
                        {connection.enabled ? "" : " (disabled)"}
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
                  <Label className="text-xs text-muted-foreground">Project</Label>
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
                          ?.name ?? "Select project"}
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
                      Entry ID
                    </Label>
                    <Input
                      id="contentful-entry-id"
                      value={form.contentfulEntryId}
                      disabled={disabled}
                      className="h-8 rounded-lg text-sm"
                      placeholder="Contentful entry ID"
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
                  Target locales
                </Label>
                <ContentfulTargetLocalesPicker
                  availableLocales={contentfulAvailableTargetLocales}
                  disabled={disabled}
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
                  <span className="text-xs text-foreground">Run QA</span>
                  <Switch
                    size="sm"
                    checked={form.contentfulRunQa}
                    disabled={disabled}
                    onCheckedChange={(checked) => onChange({ ...form, contentfulRunQa: checked })}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <span className="text-xs text-foreground">Write drafts</span>
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
                  <span className="text-xs text-foreground">Overwrite targets</span>
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
            title="Translate"
            description="Queue translation jobs for uploaded source files in the project selected above."
            action={
              <DeleteToolButton
                disabled={disabled}
                label="Remove Translate"
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
                <span className="text-xs text-foreground">Use project target locales</span>
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
                    Target locales
                  </Label>
                  <ContentfulTargetLocalesPicker
                    availableLocales={translationAvailableTargetLocales}
                    disabled={disabled}
                    emptyMessage="Choose a project above to pick target locales."
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

        <AddToolMenu
          contentfulConnected={contentfulConnected}
          disabled={disabled}
          emailConnected={emailConnected}
          form={form}
          githubConnected={githubConnected}
          onChange={onChange}
          repositories={repositories}
          slackConnected={slackConnected}
        />
      </EditorPanel>
    </EditorSection>
  );
}

function RunHistoryTable({ runs }: { runs: WorkspaceAutomationRunRecord[] }) {
  if (runs.length === 0) {
    return (
      <EditorPanel className="px-4 py-10">
        <p className="text-sm text-muted-foreground">No runs yet.</p>
      </EditorPanel>
    );
  }

  return (
    <EditorPanel>
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-border px-4 py-3 text-xs font-medium text-muted-foreground">
        <span>Status</span>
        <span>Trigger</span>
        <span>Summary</span>
        <span>Completed</span>
      </div>
      {runs.map((run) => (
        <div
          key={run.id}
          className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-4 border-b border-border px-4 py-4 text-sm last:border-b-0"
        >
          <Badge variant="outline" className="w-fit">
            {run.status}
          </Badge>
          <span>{run.triggerSource}</span>
          <span className="truncate text-muted-foreground">
            {Object.keys(run.outputSummary).length > 0 ? JSON.stringify(run.outputSummary) : "—"}
          </span>
          <span className="text-muted-foreground">
            {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
          </span>
        </div>
      ))}
    </EditorPanel>
  );
}

export function WorkspaceAutomationEditor({
  actions,
  disabled,
  errors,
  form,
  mode,
  onChange,
  organizationSlug,
  runHistory,
}: {
  actions?: ReactNode;
  disabled?: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
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

  const repositories = useMemo(
    () => (repositoriesQuery.data ?? []).filter((repository) => !repository.archived),
    [repositoriesQuery.data],
  );
  const canActivate = workspaceAutomationFormCanActivate(form);
  const slackConnected = Boolean(slackQuery.data?.enabled);
  const emailConnected = Boolean(emailQuery.data?.enabled);
  const contentfulConnections = contentfulConnectionsQuery.data ?? [];
  const contentfulConnected = contentfulConnections.length > 0;
  const hasHistory = mode === "detail";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <Label htmlFor="automation-name" className="sr-only">
              Automation name
            </Label>
            <Input
              id="automation-name"
              value={form.name}
              disabled={disabled}
              placeholder="Untitled automation"
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
            <span>{form.status === "active" ? "Active" : "Paused"}</span>
          </label>
          {form.translationEnabled ||
          form.contentfulEnabled ||
          (form.githubEnabled && form.githubMode === "sync") ||
          form.triggerMode === "source_upload" ? (
            <>
              <span className="text-border">|</span>
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
              <span className="text-border">|</span>
              <span>{triggerSummary(intl, form, repositories, projectsQuery.data ?? [])}</span>
            </>
          ) : null}
          <span className="text-border">|</span>
          <span>
            {toolCount(form)} tool{toolCount(form) === 1 ? "" : "s"}
          </span>
        </div>
        <FieldError message={errors.githubProjectId} />
        <FieldError message={errors.translationProjectId} />
        {!canActivate ? (
          <p className="text-xs text-muted-foreground">
            Add at least one supported tool to activate this automation.
          </p>
        ) : null}
        <FieldError message={errors.form} />
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AutomationEditorTab)}>
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          {hasHistory ? <TabsTrigger value="history">Run History</TabsTrigger> : null}
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

          <EditorSection title="Agent Instructions">
            <div className="relative rounded-xl">
              <Textarea
                id="automation-instructions"
                value={form.instructions}
                disabled={disabled}
                className="relative z-0 min-h-80 resize-y rounded-xl border-border bg-muted pb-10 font-sans text-sm leading-6"
                placeholder="Tell the automation what to do, what to inspect, and what to ignore."
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
            contentfulConnections={contentfulConnections}
            disabled={disabled}
            emailConnected={emailConnected}
            errors={errors}
            form={form}
            githubConnected={githubConnected}
            onChange={onChange}
            organizationSlug={organizationSlug}
            projects={projectsQuery.data ?? []}
            repositories={repositories}
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
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  return <WorkspaceAutomationEditor mode="create" {...props} />;
}
