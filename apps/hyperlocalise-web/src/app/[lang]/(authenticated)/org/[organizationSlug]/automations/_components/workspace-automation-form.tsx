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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  PlusIcon,
  CaretDownIcon,
  BrainIcon,
  ChatTextIcon,
  TrashIcon,
  FoldersIcon,
  GitBranchIcon,
  GlobeIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  SparkleIcon,
  CheckSquareIcon,
  UploadSimpleIcon,
  XIcon,
  BinocularsIcon,
  ListMagnifyingGlassIcon,
  MegaphoneIcon,
  TranslateIcon,
  ArrowClockwiseIcon,
  type Icon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from "react-intl";
import type { SimpleIcon } from "simple-icons";
import {
  siGithub,
  siGitlab,
  siGoogle,
  siGoogleads,
  siGoogleanalytics,
  siLinear,
  siMeta,
  siSemrush,
  siCrowdin,
  siContentful,
  siIntercom,
  siSanity,
  siWebflow,
  siGoogledrive,
} from "simple-icons";

import { SimpleBrandIcon } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/simple-brand-icon";
import { IntegrationLogo } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/integration-logo";
import { KnowledgeMemoryEditor } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/knowledge/_components/knowledge-memory-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { Spinner } from "@/components/ui/spinner";
import { AHREFS_PIPES_SLUG } from "@/lib/ahrefs/constants";
import { BRAZE_PIPES_SLUG } from "@/lib/braze/constants";
import { CUSTOMER_IO_PIPES_SLUG } from "@/lib/customer-io/constants";
import { HUBSPOT_PIPES_SLUG } from "@/lib/hubspot/constants";
import { LOOPS_PIPES_SLUG } from "@/lib/loops/constants";
import { INTERCOM_PIPES_SLUG } from "@/lib/intercom/constants";
import { SANITY_PIPES_SLUG } from "@/lib/sanity/constants";
import { GOOGLE_DRIVE_PIPES_SLUG } from "@/lib/google-drive/constants";
import { WorkspaceAutomationGoogleDriveSettings } from "./workspace-automation-google-drive-settings";
import type { WorkspaceAutomationEditorTab } from "@/lib/navigation/workspace-automation-editor-tab";
import { GITLAB_PIPES_SLUG } from "@/lib/gitlab/constants";
import { createApiClient } from "@/lib/api-client";
import { useGoSvcClient } from "@/lib/go-svc/use-go-svc-client";
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
import {
  WORKSPACE_AUTOMATION_MODELS,
  type WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";
import {
  addSkillToWorkspaceAutomationForm,
  removeSkillFromWorkspaceAutomationForm,
  resolveWorkspaceAutomationSkillAvailability,
  type WorkspaceAutomationSkillDefaults,
} from "@/lib/agents/workspace-automation-skill-form";
import {
  getWorkspaceAutomationSkill,
  listMissingWorkspaceAutomationSkillIntegrations,
  listWorkspaceAutomationSkillNamesByTool,
  resolveWorkspaceAutomationSkills,
  WORKSPACE_AUTOMATION_SKILLS,
  type WorkspaceAutomationSkillConnections,
  type WorkspaceAutomationSkillIntegration,
  WORKSPACE_AUTOMATION_SKILL_CATEGORIES,
  type WorkspaceAutomationSkill,
  type WorkspaceAutomationSkillCategory,
  type WorkspaceAutomationSkillTool,
} from "@/lib/agents/workspace-automation-skills";
import {
  addSuggestedToolToWorkspaceAutomationForm,
  suggestWorkspaceAutomationAdditions,
  type WorkspaceAutomationSuggestedToolId,
  type WorkspaceAutomationSuggestion,
} from "@/lib/agents/workspace-automation-suggestions";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import {
  applyWorkspaceAutomationProjectSelection,
  selectableAutomationRepositories,
  workspaceAutomationFormCanActivate,
} from "@/lib/agents/workspace-automation-view-model";
import { cn } from "@/lib/primitives/cn";
import type { ApiProject } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/projects/_components/project-list";

import { RunHistoryTable } from "./workspace-automation-run-history";
import type { ContentfulConnectionOption } from "./workspace-automation-contentful-trigger";
import {
  AutomationAssistantLayout,
  AutomationAssistantOpenButton,
} from "./automation-assistant-panel";
import type { AutomationAssistantApi } from "./automation-assistant-api";
import { AutomationAssistantProvider } from "./automation-assistant-provider";
import { AutomationAssistantSummary } from "./automation-assistant-summary";
import {
  AUTOMATION_ICON_GLYPH_TONES,
  AutomationIconTile,
  type AutomationIconTone,
} from "./automation-icon-tile";
import { WorkspaceAutomationKnowledgeFilesPanel } from "./workspace-automation-knowledge-files-panel";
import {
  formatRepositoryOptionLabel,
  selectedRepositoryLabel,
  TriggerSettings,
  type GithubRepositoryOption,
} from "./workspace-automation-trigger-settings";
import { WorkspaceAutomationBrazeCampaignsSettings } from "./workspace-automation-braze-campaigns-settings";
import { WorkspaceAutomationCustomerIoSettings } from "./workspace-automation-customer-io-settings";
import { WorkspaceAutomationBrazeSettings } from "./workspace-automation-braze-settings";
import { WorkspaceAutomationIntercomSettings } from "./workspace-automation-intercom-settings";
import { WorkspaceAutomationSanitySettings } from "./workspace-automation-sanity-settings";
import { WorkspaceAutomationWebflowSettings } from "./workspace-automation-webflow-settings";
import type { WebflowConnectionSummary } from "@/lib/webflow/types";
import { useScrollToFirstFieldError } from "./use-scroll-to-first-field-error";

const api = createApiClient();

type ProjectOption = {
  id: string;
  name: string;
  source?: string;
  externalProviderKind?: string | null;
  sourceLocale: string | null;
  targetLocales: string[];
};
type GitlabProjectOption = {
  id: number;
  name: string;
  pathWithNamespace: string;
  defaultBranch: string | null;
  httpUrlToRepo: string;
  archived: boolean;
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
type ZernioConnectionOption = {
  id: string;
  displayName: string;
  enabled: boolean;
  validationStatus: string;
};

type ComingSoonAutomationTool = {
  id: string;
  name: string;
  icon?: SimpleIcon;
};

const COMING_SOON_GOOGLE_MENU_LABEL = "Google";
const COMING_SOON_LINEAR_MENU_LABEL = "Linear";
const METADATA_SEPARATOR = "|";

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

const AUTOMATION_MODEL_MESSAGES = {
  "openai/gpt-6.1-sol": workspaceAutomationFormMessages.modelGpt61Sol,
  "openai/gpt-6.1-sol-fast": workspaceAutomationFormMessages.modelGpt61SolFast,
  "openai/gpt-6-luna": workspaceAutomationFormMessages.modelGpt6Luna,
  "openai/gpt-6-luna-fast": workspaceAutomationFormMessages.modelGpt6LunaFast,
  "openai/gpt-6-astra": workspaceAutomationFormMessages.modelGpt6Astra,
  "openai/gpt-6-astra-fast": workspaceAutomationFormMessages.modelGpt6AstraFast,
  "openai/gpt-6-sol": workspaceAutomationFormMessages.modelGpt6Sol,
  "openai/gpt-6-sol-fast": workspaceAutomationFormMessages.modelGpt6SolFast,
  "openai/gpt-5.6-luna": workspaceAutomationFormMessages.modelGpt56Luna,
  "openai/gpt-5.6-terra": workspaceAutomationFormMessages.modelGpt56Terra,
  "openai/gpt-5.6-terra-fast": workspaceAutomationFormMessages.modelGpt56TerraFast,
  "openai/gpt-5.6-sol": workspaceAutomationFormMessages.modelGpt56Sol,
  "openai/gpt-5.6-sol-fast": workspaceAutomationFormMessages.modelGpt56SolFast,
  "anthropic/claude-sonnet-5": workspaceAutomationFormMessages.modelClaudeSonnet5,
  "anthropic/claude-opus-5.5": workspaceAutomationFormMessages.modelClaudeOpus55,
  "anthropic/claude-opus-5": workspaceAutomationFormMessages.modelClaudeOpus5,
  "google/gemini-3.8-flash": workspaceAutomationFormMessages.modelGemini38Flash,
  "google/gemini-3.7-flash": workspaceAutomationFormMessages.modelGemini37Flash,
  "google/gemini-3.6-flash": workspaceAutomationFormMessages.modelGemini36Flash,
  "google/gemini-3.5-flash": workspaceAutomationFormMessages.modelGemini35Flash,
  "google/gemini-3.1-pro-preview": workspaceAutomationFormMessages.modelGemini31ProPreview,
} as const;

/** Brand marks keep their colour, except in a disabled menu item, where they go grey. */
const BRAND_ICON_CLASS = "size-4 in-data-disabled:grayscale";

const BUILT_IN_MENU_ICON_CLASS = cn("size-4", AUTOMATION_ICON_GLYPH_TONES.builtIn);

function ZernioToolIcon() {
  return <IntegrationLogo src="/images/zernio-logo.svg" className={BRAND_ICON_CLASS} />;
}

function BrazeToolIcon({ className }: { className?: string }) {
  return (
    <IntegrationLogo src="/images/braze-logo.svg" className={cn(BRAND_ICON_CLASS, className)} />
  );
}

function CustomerIoToolIcon({ className }: { className?: string }) {
  return (
    <IntegrationLogo
      src="/images/customerio-logo.svg"
      className={cn(BRAND_ICON_CLASS, className)}
    />
  );
}

function LoopsToolIcon({ className }: { className?: string }) {
  return (
    <IntegrationLogo src="/images/loops-logo.png" className={cn(BRAND_ICON_CLASS, className)} />
  );
}

function HubspotToolIcon({ className }: { className?: string }) {
  return (
    <IntegrationLogo src="/images/hubspot-logo.svg" className={cn(BRAND_ICON_CLASS, className)} />
  );
}

function SlackToolIcon({ className }: { className?: string }) {
  return (
    <IntegrationLogo src="/images/slack-logo.svg" className={cn(BRAND_ICON_CLASS, className)} />
  );
}

function AutomationToolMenuIcon({
  colored = true,
  icon,
}: {
  /** Off for a tool that cannot be used yet. */
  colored?: boolean;
  icon?: SimpleIcon;
}) {
  if (icon) {
    return <SimpleBrandIcon icon={icon} colored={colored} className={BRAND_ICON_CLASS} />;
  }

  return <MagnifyingGlassIcon className="size-4" />;
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

  return (
    <p data-slot="field-error" className="text-xs text-destructive">
      {message}
    </p>
  );
}

function EditorSection({
  title,
  titleAside,
  titleEnd,
  children,
}: {
  title: string;
  /** Shown after the title, wrapping onto further lines when it is long. */
  titleAside?: ReactNode;
  /** Kept at the right end of the title's own line, whatever wraps beside it. */
  titleEnd?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      {titleAside === undefined && titleEnd === undefined ? (
        <h2 className="px-2 text-xs font-medium text-muted-foreground">{title}</h2>
      ) : (
        <div className="flex items-start gap-x-3 px-2">
          {/* As tall as a suggestion chip, so the content below stays put when one appears. */}
          <div className="flex min-h-7.5 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
            {titleAside}
          </div>
          {titleEnd ? <div className="flex h-7.5 shrink-0 items-center">{titleEnd}</div> : null}
        </div>
      )}
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
  tone,
}: {
  icon: ReactNode;
  /** What the icon's colour says about the row; left out, the icon stays grey. */
  tone?: AutomationIconTone;
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
        <AutomationIconTile tone={tone}>{icon}</AutomationIconTile>
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
  requiredBySkills = [],
}: {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  /** Attached skills that need the tool. It is then removed by removing those skills. */
  requiredBySkills?: string[];
}) {
  const intl = useIntl();

  if (requiredBySkills.length > 0) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Badge variant="secondary" tabIndex={0}>
              <FormattedMessage
                {...workspaceAutomationFormMessages.requiredForSkillBadge}
                values={{ count: requiredBySkills.length }}
              />
            </Badge>
          }
        />
        <TooltipContent side="top" align="end" className="max-w-xs">
          {intl.formatMessage(workspaceAutomationFormMessages.requiredForSkillTooltip, {
            skills: intl.formatList(requiredBySkills, { type: "conjunction" }),
          })}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
    >
      <TrashIcon className="size-4" />
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
      // Hourly runs start on the hour whatever the timezone, so the summary leaves it out.
      return intl.formatMessage(workspaceAutomationFormMessages.scheduledTriggerHourly);
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

  if (form.triggerMode === "web_chat") {
    return intl.formatMessage(workspaceAutomationFormMessages.webChatSummary);
  }

  return "";
}

function toolCount(form: WorkspaceAutomationFormState) {
  return (
    Number(form.githubEnabled) +
    Number(form.gitlabEnabled) +
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
    Number(form.knowledgeFilesEnabled) +
    Number(form.mcpEnabled) +
    Number(form.semrushEnabled) +
    Number(form.zernioEnabled) +
    Number(form.ahrefsEnabled) +
    Number(form.intercomEnabled) +
    Number(form.sanityEnabled) +
    Number(form.webSearchEnabled)
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

function gitlabProjectPickerValue(project: { pathWithNamespace: string }) {
  return `gitlab:${project.pathWithNamespace}`;
}

function formGitlabProjectValue(form: WorkspaceAutomationFormState) {
  if (!form.gitlabPathWithNamespace) {
    return "";
  }
  return `gitlab:${form.gitlabPathWithNamespace}`;
}

function formatGitlabProjectOptionLabel(project: GitlabProjectOption) {
  return project.pathWithNamespace;
}

function resolveDefaultGitlabProject(
  form: WorkspaceAutomationFormState,
  projects: GitlabProjectOption[],
): GitlabProjectOption | null {
  const currentValue = formGitlabProjectValue(form);
  const current = projects.find((project) => gitlabProjectPickerValue(project) === currentValue);
  if (current) {
    return current;
  }
  return projects.find((project) => !project.archived) ?? null;
}

function withGitlabRepository(
  form: WorkspaceAutomationFormState,
  project: { pathWithNamespace: string },
): WorkspaceAutomationFormState {
  return {
    ...form,
    gitlabEnabled: true,
    gitlabPathWithNamespace: project.pathWithNamespace,
    repositoryTargetKind: "gitlab",
    githubEnabled: false,
    githubCommentEnabled: false,
    githubInstallationRepositoryId: "",
  };
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
        value={form.githubInstallationRepositoryId || null}
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
            <SelectItem
              key={repository.id}
              value={repository.id}
              label={formatRepositoryOptionLabel(intl, repository)}
            >
              {formatRepositoryOptionLabel(intl, repository)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

function GitlabProjectSelect({
  disabled,
  error,
  form,
  onChange,
  projects,
}: {
  disabled?: boolean;
  error?: string;
  form: WorkspaceAutomationFormState;
  onChange: (next: WorkspaceAutomationFormState) => void;
  projects: GitlabProjectOption[];
}) {
  const intl = useIntl();
  const selectedValue = formGitlabProjectValue(form);

  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.gitlabProjectLabel} />
      </Label>
      <Select
        value={selectedValue || null}
        onValueChange={(value) => {
          if (!value) {
            return;
          }
          const project = projects.find((entry) => gitlabProjectPickerValue(entry) === value);
          if (!project) {
            return;
          }
          onChange(withGitlabRepository(form, project));
        }}
        disabled={disabled || projects.length === 0}
      >
        <SelectTrigger className="h-8 w-full rounded-lg">
          <span className="truncate">
            {projects.length === 0
              ? intl.formatMessage(workspaceAutomationFormMessages.connectGitlabForProject)
              : selectedValue
                ? projects.find((project) => gitlabProjectPickerValue(project) === selectedValue)
                  ? formatGitlabProjectOptionLabel(
                      projects.find(
                        (project) => gitlabProjectPickerValue(project) === selectedValue,
                      )!,
                    )
                  : form.gitlabPathWithNamespace
                : intl.formatMessage(workspaceAutomationFormMessages.selectGitlabProject)}
          </span>
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem
              key={gitlabProjectPickerValue(project)}
              value={gitlabProjectPickerValue(project)}
              label={formatGitlabProjectOptionLabel(project)}
            >
              {formatGitlabProjectOptionLabel(project)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError message={error} />
    </div>
  );
}

function HeaderModelSelector({
  disabled,
  form,
  onChange,
}: {
  disabled?: boolean;
  form: WorkspaceAutomationFormState;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="ghost"
            aria-label={intl.formatMessage(workspaceAutomationFormMessages.modelLabel)}
            title={intl.formatMessage(workspaceAutomationFormMessages.modelDescription)}
            className="h-auto gap-1 px-0 py-0 text-sm font-normal text-muted-foreground hover:bg-transparent hover:text-foreground disabled:opacity-50"
          />
        }
      >
        <BrainIcon className="size-4" />
        <FormattedMessage {...AUTOMATION_MODEL_MESSAGES[form.model]} />
        <CaretDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <FormattedMessage {...workspaceAutomationFormMessages.modelLabel} />
          </DropdownMenuLabel>
          {WORKSPACE_AUTOMATION_MODELS.map((model) => (
            <DropdownMenuItem
              key={model}
              onClick={() =>
                onChange({
                  ...form,
                  model,
                })
              }
            >
              <FormattedMessage {...AUTOMATION_MODEL_MESSAGES[model]} />
              {form.model === model ? (
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
        <FoldersIcon className="size-4" />
        {isLoading ? <Skeleton className="h-3.5 w-20 rounded-full bg-muted" /> : triggerLabel}
        <CaretDownIcon className="size-3.5" />
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
              <FoldersIcon className="size-4" />
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

function AddToolMenu({
  contentfulConnected,
  crowdinConnected,
  disabled,
  emailConnected,
  form,
  githubConnected,
  gitlabConnected,
  gitlabProjects,
  knowledgeAvailable,
  mcpConnected,
  onChange,
  repositories,
  ahrefsConnected,
  intercomConnected,
  sanityConnected,
  webflowConnected,
  brazeConnected,
  customerIoConnected,
  loopsConnected,
  hubspotConnected,
  semrushConnected,
  zernioConnected,
  slackConnected,
  crowdinProjects,
}: {
  contentfulConnected: boolean;
  crowdinConnected: boolean;
  disabled?: boolean;
  emailConnected: boolean;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  gitlabConnected: boolean;
  gitlabProjects: GitlabProjectOption[];
  knowledgeAvailable: boolean;
  mcpConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  repositories: GithubRepositoryOption[];
  ahrefsConnected: boolean;
  intercomConnected: boolean;
  sanityConnected: boolean;
  webflowConnected: boolean;
  brazeConnected: boolean;
  customerIoConnected: boolean;
  loopsConnected: boolean;
  hubspotConnected: boolean;
  semrushConnected: boolean;
  zernioConnected: boolean;
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
          <PlusIcon className="size-4" />
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
              <BrainIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
            <DropdownMenuItem
              disabled={form.knowledgeFilesEnabled}
              onClick={() => onChange({ ...form, knowledgeFilesEnabled: true })}
            >
              <FoldersIcon className={BUILT_IN_MENU_ICON_CLASS} />
              <FormattedMessage {...workspaceAutomationFormMessages.knowledgeFiles} />
              {form.knowledgeFilesEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
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
                  disabled={form.githubEnabled || !githubConnected || form.gitlabEnabled}
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
                      gitlabEnabled: false,
                      gitlabPathWithNamespace: "",
                      pushSourceEnabled: false,
                      pullTranslationsEnabled: false,
                      validationEnabled: false,
                    });
                  }}
                >
                  <GitBranchIcon className="size-4" />
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
                  disabled={form.githubEnabled || !githubConnected || form.gitlabEnabled}
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
                      gitlabEnabled: false,
                      gitlabPathWithNamespace: "",
                      validationEnabled:
                        form.pushSourceEnabled || form.pullTranslationsEnabled
                          ? form.validationEnabled
                          : true,
                    });
                  }}
                >
                  <GitBranchIcon className="size-4" />
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
                  disabled={form.githubCommentEnabled || !githubConnected || form.gitlabEnabled}
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
                      gitlabEnabled: false,
                      gitlabPathWithNamespace: "",
                    });
                  }}
                >
                  <ChatTextIcon className="size-4" />
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
              disabled={
                form.gitlabEnabled ||
                !gitlabConnected ||
                form.githubEnabled ||
                form.githubCommentEnabled
              }
              onClick={() => {
                const defaultProject = resolveDefaultGitlabProject(form, gitlabProjects);
                onChange(
                  withGitlabRepository(form, {
                    pathWithNamespace: defaultProject?.pathWithNamespace ?? "",
                  }),
                );
              }}
            >
              <AutomationToolMenuIcon icon={siGitlab} />
              <FormattedMessage {...workspaceAutomationFormMessages.useGitlabRepo} />
              {form.gitlabEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !gitlabConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.slackEnabled || !slackConnected}
              onClick={() => onChange({ ...form, slackEnabled: true })}
            >
              <SlackToolIcon />
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
              <EnvelopeIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
              <AutomationToolMenuIcon icon={siContentful} />
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
              disabled={form.intercomEnabled || !intercomConnected}
              onClick={() => onChange({ ...form, intercomEnabled: true })}
            >
              <AutomationToolMenuIcon icon={siIntercom} />
              Intercom Help Center
              {form.intercomEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !intercomConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.sanityEnabled || !sanityConnected}
              onClick={() => onChange({ ...form, sanityEnabled: true })}
            >
              <AutomationToolMenuIcon icon={siSanity} />
              Sanity documents
              {form.sanityEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !sanityConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={form.webflowEnabled || !webflowConnected}
              onClick={() => onChange({ ...form, webflowEnabled: true })}
            >
              <AutomationToolMenuIcon icon={siWebflow} />
              Webflow CMS items
              {form.webflowEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !webflowConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                form.brazeEnabled ||
                form.brazeCampaignsEnabled ||
                form.loopsEnabled ||
                form.hubspotEnabled ||
                !brazeConnected
              }
              onClick={() =>
                onChange({
                  ...form,
                  brazeEnabled: true,
                  brazeCampaignsEnabled: false,
                  loopsEnabled: false,
                  hubspotEnabled: false,
                })
              }
            >
              <BrazeToolIcon />
              Braze Email Templates
              {form.brazeEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !brazeConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : form.brazeCampaignsEnabled ? (
                <DropdownMenuHint>Use a separate automation</DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                form.brazeCampaignsEnabled ||
                form.brazeEnabled ||
                form.loopsEnabled ||
                form.hubspotEnabled ||
                !brazeConnected
              }
              onClick={() =>
                onChange({
                  ...form,
                  brazeCampaignsEnabled: true,
                  brazeEnabled: false,
                  loopsEnabled: false,
                  hubspotEnabled: false,
                })
              }
            >
              <BrazeToolIcon />
              Braze Campaigns & Canvas
              {form.brazeCampaignsEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !brazeConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : form.brazeEnabled ? (
                <DropdownMenuHint>Use a separate automation</DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                form.customerIoEnabled ||
                form.brazeEnabled ||
                form.brazeCampaignsEnabled ||
                form.loopsEnabled ||
                form.hubspotEnabled ||
                !customerIoConnected
              }
              onClick={() =>
                onChange({
                  ...form,
                  customerIoEnabled: true,
                  brazeEnabled: false,
                  brazeCampaignsEnabled: false,
                  loopsEnabled: false,
                  hubspotEnabled: false,
                })
              }
            >
              <CustomerIoToolIcon />
              Customer.io Campaigns, Broadcasts, Newsletters & Transactional
              {form.customerIoEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !customerIoConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : form.brazeEnabled || form.brazeCampaignsEnabled ? (
                <DropdownMenuHint>Use a separate automation</DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                form.loopsEnabled ||
                form.brazeEnabled ||
                form.brazeCampaignsEnabled ||
                form.customerIoEnabled ||
                form.hubspotEnabled ||
                !loopsConnected
              }
              onClick={() =>
                onChange({
                  ...form,
                  loopsEnabled: true,
                  brazeEnabled: false,
                  brazeCampaignsEnabled: false,
                  customerIoEnabled: false,
                  hubspotEnabled: false,
                })
              }
            >
              <LoopsToolIcon />
              Loops Transactional, Campaigns & Workflows
              {form.loopsEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !loopsConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : form.brazeEnabled || form.brazeCampaignsEnabled || form.customerIoEnabled ? (
                <DropdownMenuHint>Use a separate automation</DropdownMenuHint>
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={
                form.hubspotEnabled ||
                form.brazeEnabled ||
                form.brazeCampaignsEnabled ||
                form.customerIoEnabled ||
                form.loopsEnabled ||
                !hubspotConnected
              }
              onClick={() =>
                onChange({
                  ...form,
                  hubspotEnabled: true,
                  brazeEnabled: false,
                  brazeCampaignsEnabled: false,
                  customerIoEnabled: false,
                  loopsEnabled: false,
                })
              }
            >
              <HubspotToolIcon />
              HubSpot emails, forms, pages, and blog posts
              {form.hubspotEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !hubspotConnected ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
                </DropdownMenuHint>
              ) : form.brazeEnabled ||
                form.brazeCampaignsEnabled ||
                form.customerIoEnabled ||
                form.loopsEnabled ? (
                <DropdownMenuHint>Use a separate automation</DropdownMenuHint>
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
                <UploadSimpleIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
                  <UploadSimpleIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
                  <BrainIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
                <CheckSquareIcon className={BUILT_IN_MENU_ICON_CLASS} />
                <span className="min-w-0 flex-1">
                  <FormattedMessage {...workspaceAutomationFormMessages.issuesToolsMenu} />
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuItem
                  disabled={form.listIssuesEnabled}
                  onClick={() => onChange({ ...form, listIssuesEnabled: true })}
                >
                  <CheckSquareIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
                  <CheckSquareIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
              <FoldersIcon className="size-4" />
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
              disabled={form.zernioEnabled || !zernioConnected}
              onClick={() => onChange({ ...form, zernioEnabled: true })}
            >
              <ZernioToolIcon />
              <FormattedMessage {...workspaceAutomationFormMessages.zernio} />
              {form.zernioEnabled ? (
                <DropdownMenuHint>
                  <FormattedMessage {...workspaceAutomationFormMessages.addedShortcut} />
                </DropdownMenuHint>
              ) : !zernioConnected ? (
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
              <GlobeIcon className={BUILT_IN_MENU_ICON_CLASS} />
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
                <AutomationToolMenuIcon icon={siGoogle} colored={false} />
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

const SKILL_INTEGRATION_LABELS: Record<WorkspaceAutomationSkillIntegration, MessageDescriptor> = {
  github: workspaceAutomationFormMessages.skillIntegrationGithub,
  crowdin: workspaceAutomationFormMessages.skillIntegrationCrowdin,
  contentful: workspaceAutomationFormMessages.skillIntegrationContentful,
  intercom: workspaceAutomationFormMessages.skillIntegrationIntercom,
  sanity: workspaceAutomationFormMessages.skillIntegrationSanity,
  webflow: workspaceAutomationFormMessages.skillIntegrationWebflow,
  google_drive: workspaceAutomationFormMessages.skillIntegrationGoogleDrive,
  braze: workspaceAutomationFormMessages.skillIntegrationBraze,
  customer_io: workspaceAutomationFormMessages.skillIntegrationCustomerIo,
  loops: workspaceAutomationFormMessages.skillIntegrationLoops,
  hubspot: workspaceAutomationFormMessages.skillIntegrationHubspot,
  slack: workspaceAutomationFormMessages.skillIntegrationSlack,
  email: workspaceAutomationFormMessages.skillIntegrationEmail,
};

function formatSkillConnectFirstHint(
  intl: IntlShape,
  integrations: WorkspaceAutomationSkillIntegration[],
) {
  return intl.formatMessage(workspaceAutomationFormMessages.skillConnectFirstHint, {
    integrations: intl.formatList(
      integrations.map((integration) => intl.formatMessage(SKILL_INTEGRATION_LABELS[integration])),
      { type: "conjunction" },
    ),
  });
}

const SKILL_CATEGORY_LABELS: Record<WorkspaceAutomationSkillCategory, MessageDescriptor> = {
  review: workspaceAutomationFormMessages.skillCategoryReview,
  research: workspaceAutomationFormMessages.skillCategoryResearch,
  translate: workspaceAutomationFormMessages.skillCategoryTranslate,
  report: workspaceAutomationFormMessages.skillCategoryReport,
};

const SKILL_CATEGORY_ICONS: Record<WorkspaceAutomationSkillCategory, Icon> = {
  review: ListMagnifyingGlassIcon,
  research: BinocularsIcon,
  translate: TranslateIcon,
  report: MegaphoneIcon,
};

const SKILL_BRAND_ICONS: Partial<Record<WorkspaceAutomationSkillTool, SimpleIcon>> = {
  use_github_repository: siGithub,
  notify_github_comment: siGithub,
  use_crowdin: siCrowdin,
  run_contentful_translation: siContentful,
  import_intercom_articles: siIntercom,
  push_intercom_translations: siIntercom,
  import_sanity_documents: siSanity,
  push_sanity_translations: siSanity,
  import_webflow_items: siWebflow,
  push_webflow_translations: siWebflow,
};

const SKILL_TOOL_ICONS: Partial<Record<WorkspaceAutomationSkillTool, Icon>> = {
  use_web_search: GlobeIcon,
  create_native_tms_job: UploadSimpleIcon,
  list_issues: CheckSquareIcon,
  notify_email: EnvelopeIcon,
};

/** Whether the skill works through an outside service or is part of Hyperlocalise. */
function skillIconTone(skill: WorkspaceAutomationSkill): AutomationIconTone {
  const tool = skill.tools[0];
  return tool && (tool === "notify_slack" || SKILL_BRAND_ICONS[tool]) ? "external" : "builtIn";
}

/** The integration or surface the skill touches, the same icon its tool row uses. */
function SkillIcon({ className, skill }: { className?: string; skill: WorkspaceAutomationSkill }) {
  const tool = skill.tools[0];
  if (
    tool === "import_braze_templates" ||
    tool === "push_braze_templates" ||
    tool === "import_braze_campaigns" ||
    tool === "push_braze_campaigns"
  ) {
    return <BrazeToolIcon className={className} />;
  }
  if (tool === "import_customer_io_campaigns" || tool === "push_customer_io_campaigns") {
    return <CustomerIoToolIcon className={className} />;
  }
  if (tool === "import_loops_emails" || tool === "push_loops_emails") {
    return <LoopsToolIcon className={className} />;
  }
  if (tool === "import_hubspot_content" || tool === "push_hubspot_content") {
    return <HubspotToolIcon className={className} />;
  }
  if (tool === "notify_slack") {
    return <SlackToolIcon className={className} />;
  }
  const brand = tool ? SKILL_BRAND_ICONS[tool] : undefined;
  if (brand) {
    return <SimpleBrandIcon icon={brand} colored className={cn(BRAND_ICON_CLASS, className)} />;
  }

  const ToolIcon = (tool ? SKILL_TOOL_ICONS[tool] : undefined) ?? SparkleIcon;
  return <ToolIcon className={cn(BUILT_IN_MENU_ICON_CLASS, className)} />;
}

function SkillsSettings({
  connections,
  disabled,
  error,
  form,
  onAddSkill,
  onChange,
}: {
  connections: WorkspaceAutomationSkillConnections;
  disabled?: boolean;
  error?: string;
  form: WorkspaceAutomationFormState;
  onAddSkill: (skillId: string) => void;
  onChange: (next: WorkspaceAutomationFormState) => void;
}) {
  const intl = useIntl();
  const attachedSkills = resolveWorkspaceAutomationSkills(form.skillIds);

  return (
    <EditorSection title={intl.formatMessage(workspaceAutomationFormMessages.skillsSection)}>
      <EditorPanel>
        {attachedSkills.length === 0 ? (
          <p className="border-b border-border px-3 py-3 text-xs text-muted-foreground">
            <FormattedMessage {...workspaceAutomationFormMessages.skillsEmpty} />
          </p>
        ) : null}
        {attachedSkills.map((skill) => (
          <EditorRow
            key={skill.id}
            icon={<SkillIcon skill={skill} />}
            tone={skillIconTone(skill)}
            title={skill.name}
            description={`${skill.description} ${skill.grants}`}
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeSkill, {
                  name: skill.name,
                })}
                onClick={() => onChange(removeSkillFromWorkspaceAutomationForm(form, skill.id))}
              />
            }
          />
        ))}
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
            <PlusIcon className="size-4" />
            <FormattedMessage {...workspaceAutomationFormMessages.addSkill} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" sideOffset={2}>
            {WORKSPACE_AUTOMATION_SKILL_CATEGORIES.map((category) => {
              const CategoryIcon = SKILL_CATEGORY_ICONS[category];
              return (
                <DropdownMenuSub key={category}>
                  <DropdownMenuSubTrigger className="gap-2.5">
                    <CategoryIcon className="size-4" />
                    <span className="flex-1">
                      <FormattedMessage {...SKILL_CATEGORY_LABELS[category]} />
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-72">
                    {WORKSPACE_AUTOMATION_SKILLS.filter((skill) => skill.category === category).map(
                      (skill) => {
                        const availability = resolveWorkspaceAutomationSkillAvailability(
                          form,
                          skill,
                        );
                        const missingIntegrations =
                          availability === "available"
                            ? listMissingWorkspaceAutomationSkillIntegrations(skill, connections)
                            : [];
                        return (
                          <Tooltip key={skill.id}>
                            {/* The wrapper takes the hover: a disabled item ignores the pointer. */}
                            <TooltipTrigger render={<div />}>
                              <DropdownMenuItem
                                disabled={
                                  availability !== "available" || missingIntegrations.length > 0
                                }
                                className="items-start"
                                onClick={() => onAddSkill(skill.id)}
                              >
                                <SkillIcon skill={skill} className="mt-0.5 shrink-0" />
                                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                  <span>{skill.name}</span>
                                  {/* Under the name: beside it, the wording squeezes the name onto two lines. */}
                                  {availability === "trigger_mismatch" ? (
                                    <span className="text-xs font-medium">
                                      <FormattedMessage
                                        {...workspaceAutomationFormMessages.skillNotApplicableHint}
                                      />
                                    </span>
                                  ) : availability === "skill_exclusive" ? (
                                    <span className="text-xs font-medium">
                                      <FormattedMessage
                                        {...workspaceAutomationFormMessages.skillExclusiveHint}
                                      />
                                    </span>
                                  ) : missingIntegrations.length > 0 ? (
                                    <span className="text-xs font-medium">
                                      {formatSkillConnectFirstHint(intl, missingIntegrations)}
                                    </span>
                                  ) : null}
                                </span>
                                {availability === "attached" ? (
                                  <DropdownMenuHint>
                                    <FormattedMessage
                                      {...workspaceAutomationFormMessages.addedShortcut}
                                    />
                                  </DropdownMenuHint>
                                ) : null}
                              </DropdownMenuItem>
                            </TooltipTrigger>
                            <TooltipContent
                              side="right"
                              sideOffset={8}
                              className="max-w-64 py-2 text-pretty"
                            >
                              {skill.description}
                            </TooltipContent>
                          </Tooltip>
                        );
                      },
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </EditorPanel>
      <FieldError message={error} />
    </EditorSection>
  );
}

const SUGGESTION_TYPING_PAUSE_MS = 300;

const SUGGESTED_TOOL_LABELS: Record<WorkspaceAutomationSuggestedToolId, MessageDescriptor> = {
  github_sync: workspaceAutomationFormMessages.githubSyncWorkflows,
  gitlab: workspaceAutomationFormMessages.useGitlabRepo,
  semrush: workspaceAutomationFormMessages.semrush,
  ahrefs: workspaceAutomationFormMessages.ahrefs,
  zernio: workspaceAutomationFormMessages.zernio,
};

function SuggestionChip({
  disabled,
  flashOnMount,
  onAdd,
  onDismiss,
  suggestion,
}: {
  disabled?: boolean;
  flashOnMount: boolean;
  onAdd: (suggestion: WorkspaceAutomationSuggestion) => void;
  onDismiss: (suggestion: WorkspaceAutomationSuggestion) => void;
  suggestion: WorkspaceAutomationSuggestion;
}) {
  const intl = useIntl();
  // Fixed at mount: the highlight has to outlast the re-renders that typing causes.
  const [flash] = useState(flashOnMount);
  const name =
    suggestion.kind === "skill"
      ? suggestion.skill.name
      : intl.formatMessage(SUGGESTED_TOOL_LABELS[suggestion.toolId]);
  const unavailableHint =
    suggestion.availability === "trigger_mismatch"
      ? intl.formatMessage(workspaceAutomationFormMessages.skillNotApplicableHint)
      : suggestion.availability === "skill_exclusive"
        ? intl.formatMessage(workspaceAutomationFormMessages.skillExclusiveHint)
        : suggestion.availability !== "connect_first"
          ? null
          : suggestion.kind === "skill"
            ? formatSkillConnectFirstHint(intl, suggestion.missingIntegrations)
            : intl.formatMessage(workspaceAutomationFormMessages.connectFirstShortcut);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-background",
        flash && "animate-suggestion-flash motion-reduce:animate-none",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={disabled || unavailableHint !== null}
        aria-label={intl.formatMessage(workspaceAutomationFormMessages.addSuggestion, {
          name,
        })}
        className="h-7 gap-1.5 rounded-full pr-1.5 pl-2.5 text-xs"
        onClick={() => onAdd(suggestion)}
      >
        {suggestion.kind === "skill" ? (
          <SkillIcon skill={suggestion.skill} className="size-3.5" />
        ) : (
          <PlusIcon className="size-3.5" />
        )}
        {name}
        {unavailableHint ? <span className="text-muted-foreground">{unavailableHint}</span> : null}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={disabled}
        aria-label={intl.formatMessage(workspaceAutomationFormMessages.dismissSuggestion, {
          name,
        })}
        className="mr-0.5 rounded-full text-muted-foreground hover:text-foreground"
        onClick={() => onDismiss(suggestion)}
      >
        <XIcon />
      </Button>
    </span>
  );
}

function SuggestionChips({
  disabled,
  onAdd,
  onDismiss,
  shownKeys,
  suggestions,
}: {
  disabled?: boolean;
  onAdd: (suggestion: WorkspaceAutomationSuggestion) => void;
  onDismiss: (suggestion: WorkspaceAutomationSuggestion) => void;
  /** Suggestions that were already on screen; any other chip is new and flashes once. */
  shownKeys: ReadonlySet<string>;
  suggestions: WorkspaceAutomationSuggestion[];
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.suggestionsLabel} />
      </span>
      {suggestions.map((suggestion) => (
        <SuggestionChip
          key={suggestion.key}
          disabled={disabled}
          flashOnMount={!shownKeys.has(suggestion.key)}
          suggestion={suggestion}
          onAdd={onAdd}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function ToolsSettings({
  automationId,
  canUpdateKnowledgeMemory,
  contentfulConnections,
  crowdinConnected,
  crowdinLiveProjects,
  disabled,
  emailConnected,
  emailProviderConnected,
  errors,
  form,
  githubConnected,
  gitlabConnected,
  gitlabProjects,
  knowledgeAvailable,
  mcpServerConnections,
  onChange,
  organizationSlug,
  projects,
  repositories,
  ahrefsConnected,
  intercomConnected,
  googleDriveConnected,
  sanityConnected,
  webflowConnected,
  webflowConnections,
  brazeConnected,
  customerIoConnected,
  semrushConnections,
  zernioConnections,
  slackConnected,
  loopsConnected,
  hubspotConnected,
}: {
  automationId?: string;
  canUpdateKnowledgeMemory: boolean;
  contentfulConnections: ContentfulConnectionOption[];
  crowdinConnected: boolean;
  crowdinLiveProjects: ProjectOption[];
  disabled?: boolean;
  emailConnected: boolean;
  emailProviderConnected: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  gitlabConnected: boolean;
  gitlabProjects: GitlabProjectOption[];
  knowledgeAvailable: boolean;
  mcpServerConnections: McpServerConnectionOption[];
  onChange: (next: WorkspaceAutomationFormState) => void;
  organizationSlug: string;
  projects: ProjectOption[];
  repositories: GithubRepositoryOption[];
  ahrefsConnected: boolean;
  intercomConnected: boolean;
  googleDriveConnected: boolean;
  sanityConnected: boolean;
  webflowConnected: boolean;
  webflowConnections: WebflowConnectionSummary[];
  brazeConnected: boolean;
  customerIoConnected: boolean;
  loopsConnected: boolean;
  hubspotConnected: boolean;
  semrushConnections: SemrushConnectionOption[];
  zernioConnections: ZernioConnectionOption[];
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
  const enabledZernioConnections = zernioConnections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );
  const zernioConnected = enabledZernioConnections.length > 0;
  const crowdinProjects = collectCrowdinProjects(projects, crowdinLiveProjects);
  const contentfulTargetLocalesFieldId = "contentful-target-locales";
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const contentfulAvailableTargetLocales = selectedProject?.targetLocales ?? [];
  const showContentfulEntryId = form.triggerMode === "scheduled";
  const createNativeTmsJobAvailableTargetLocales = selectedProject?.targetLocales ?? [];
  const createNativeTmsJobTargetLocalesFieldId = "create-native-tms-job-target-locales";
  const intl = useIntl();
  const [memoriesOpen, setMemoriesOpen] = useState(false);
  const skillTools = listWorkspaceAutomationSkillNamesByTool(form.skillIds);

  return (
    <EditorSection title={intl.formatMessage(workspaceAutomationFormMessages.toolsSection)}>
      <EditorPanel>
        {form.knowledgeEnabled ? (
          <EditorRow
            icon={<BrainIcon className="size-4" />}
            tone="builtIn"
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

        {form.knowledgeFilesEnabled ? (
          <EditorRow
            icon={<FoldersIcon className="size-4" />}
            tone="builtIn"
            title={<FormattedMessage {...workspaceAutomationFormMessages.knowledgeFiles} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.knowledgeFilesDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeKnowledgeFilesTool)}
                onClick={() => onChange({ ...form, knowledgeFilesEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationKnowledgeFilesPanel
              automationId={automationId}
              disabled={disabled}
              organizationSlug={organizationSlug}
            />
          </EditorRow>
        ) : null}

        {form.githubEnabled && form.githubMode === "agent" ? (
          <EditorRow
            icon={<GitBranchIcon className="size-4" />}
            tone="external"
            title={<FormattedMessage {...workspaceAutomationFormMessages.useGithubRepo} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.useGithubRepoDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("use_github_repository")}
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

        {form.gitlabEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siGitlab} />}
            tone="external"
            title={<FormattedMessage {...workspaceAutomationFormMessages.useGitlabRepo} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.useGitlabRepoDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeGitlabRepoTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    gitlabEnabled: false,
                    gitlabPathWithNamespace: "",
                    repositoryTargetKind:
                      form.githubEnabled || form.githubCommentEnabled ? "github" : "none",
                  })
                }
              />
            }
          >
            <GitlabProjectSelect
              disabled={disabled}
              error={errors.gitlabRepository}
              form={form}
              onChange={onChange}
              projects={gitlabProjects}
            />
          </EditorRow>
        ) : null}

        {form.githubEnabled && form.githubMode === "sync" ? (
          <EditorRow
            icon={<GitBranchIcon className="size-4" />}
            tone="external"
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
            icon={<ChatTextIcon className="size-4" />}
            tone="external"
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
                requiredBySkills={skillTools.get("notify_github_comment")}
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
            icon={<SlackToolIcon />}
            tone="external"
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
                requiredBySkills={skillTools.get("notify_slack")}
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
            icon={<EnvelopeIcon className="size-4" />}
            tone="builtIn"
            title={
              <>
                <span>
                  <FormattedMessage {...workspaceAutomationFormMessages.sendEmail} />
                </span>
                {!emailProviderConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.enableFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description={
              emailProviderConnected
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
                requiredBySkills={skillTools.get("notify_email")}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeEmailNotifications)}
                onClick={() =>
                  onChange({
                    ...form,
                    emailEnabled: false,
                    emailRecipients: [],
                    emailFrom: "",
                  })
                }
              />
            }
          >
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">
                  <FormattedMessage {...workspaceAutomationFormMessages.emailProviderLabel} />
                </Label>
                <Select
                  value={form.emailProvider}
                  disabled={disabled}
                  onValueChange={(value) => {
                    if (value !== "resend" && value !== "sendgrid") {
                      return;
                    }
                    onChange({ ...form, emailProvider: value });
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {form.emailProvider === "sendgrid"
                        ? intl.formatMessage(workspaceAutomationFormMessages.emailProviderSendgrid)
                        : intl.formatMessage(workspaceAutomationFormMessages.emailProviderResend)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="resend">
                      <FormattedMessage {...workspaceAutomationFormMessages.emailProviderResend} />
                    </SelectItem>
                    <SelectItem value="sendgrid">
                      <FormattedMessage
                        {...workspaceAutomationFormMessages.emailProviderSendgrid}
                      />
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email-from" className="text-xs text-muted-foreground">
                  <FormattedMessage {...workspaceAutomationFormMessages.emailFromLabel} />
                </Label>
                <Input
                  id="email-from"
                  type="email"
                  value={form.emailFrom}
                  disabled={disabled || !emailProviderConnected}
                  placeholder={intl.formatMessage(
                    workspaceAutomationFormMessages.emailFromPlaceholder,
                  )}
                  onChange={(event) => onChange({ ...form, emailFrom: event.target.value })}
                />
                <FieldError message={errors.emailFrom} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="email-recipients" className="text-xs text-muted-foreground">
                  <FormattedMessage {...workspaceAutomationFormMessages.recipientsLabel} />
                </Label>
                <Textarea
                  id="email-recipients"
                  value={form.emailRecipients.join("\n")}
                  disabled={disabled || !emailProviderConnected}
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
            </div>
          </EditorRow>
        ) : null}

        {form.contentfulEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siContentful} />}
            tone="external"
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
                requiredBySkills={skillTools.get("run_contentful_translation")}
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
                  value={form.contentfulConnectionId || null}
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
                      <SelectItem
                        key={connection.id}
                        value={connection.id}
                        label={
                          connection.enabled
                            ? connection.displayName
                            : intl.formatMessage(
                                workspaceAutomationFormMessages.connectionDisabledSuffix,
                                { name: connection.displayName },
                              )
                        }
                      >
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

        {form.intercomEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siIntercom} />}
            tone="external"
            title={
              <>
                <span>Intercom Help Center</span>
                {!intercomConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import articles on a schedule, translate in Jobs, then push approved translations when you are ready."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_intercom_articles")}
                label="Remove Intercom"
                onClick={() => onChange({ ...form, intercomEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationIntercomSettings
              organizationSlug={organizationSlug}
              form={form}
              errors={errors}
              intercomConnected={intercomConnected}
              projectSourceLocale={selectedProject?.sourceLocale}
              projectTargetLocales={selectedProject?.targetLocales}
              onChange={onChange}
            />
            <FieldError message={errors.intercom} />
          </EditorRow>
        ) : null}

        {form.googleDriveEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siGoogledrive} />}
            tone="external"
            title={
              <>
                <span>Google Drive files</span>
                {!googleDriveConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import selected Drive folders and files into the project, translate in the Content editor, then push locale copies back to Drive."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_google_drive_files")}
                label="Remove Google Drive"
                onClick={() => onChange({ ...form, googleDriveEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationGoogleDriveSettings
              organizationSlug={organizationSlug}
              form={form}
              setForm={onChange}
              fieldErrors={errors}
            />
            <FieldError message={errors.googleDrive} />
          </EditorRow>
        ) : null}

        {form.sanityEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siSanity} />}
            tone="external"
            title={
              <>
                <span>Sanity documents</span>
                {!sanityConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import documents on a schedule, translate in Jobs, then push approved translations when you are ready."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_sanity_documents")}
                label="Remove Sanity"
                onClick={() => onChange({ ...form, sanityEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationSanitySettings
              organizationSlug={organizationSlug}
              form={form}
              errors={errors}
              sanityConnected={sanityConnected}
              projectSourceLocale={selectedProject?.sourceLocale}
              projectTargetLocales={selectedProject?.targetLocales}
              onChange={onChange}
            />
            <FieldError message={errors.sanity} />
          </EditorRow>
        ) : null}

        {form.webflowEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siWebflow} />}
            tone="external"
            title={
              <>
                <span>Webflow CMS items</span>
                {!webflowConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import collection items on a schedule, translate in Jobs, then push approved translations when you are ready."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_webflow_items")}
                label="Remove Webflow"
                onClick={() => onChange({ ...form, webflowEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationWebflowSettings
              organizationSlug={organizationSlug}
              form={form}
              errors={errors}
              webflowConnected={webflowConnected}
              connections={webflowConnections}
              projectSourceLocale={selectedProject?.sourceLocale}
              projectTargetLocales={selectedProject?.targetLocales}
              onChange={onChange}
            />
            <FieldError message={errors.webflow} />
          </EditorRow>
        ) : null}

        {form.brazeEnabled ? (
          <EditorRow
            icon={<BrazeToolIcon />}
            title={
              <>
                <span>Braze Email Templates</span>
                {!brazeConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import templates on a schedule, translate in Jobs, then push approved locales as library copies."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_braze_templates")}
                label="Remove Braze"
                onClick={() => onChange({ ...form, brazeEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationBrazeSettings
              organizationSlug={organizationSlug}
              form={form}
              errors={errors}
              brazeConnected={brazeConnected}
              projectSourceLocale={selectedProject?.sourceLocale}
              projectTargetLocales={selectedProject?.targetLocales}
              onChange={onChange}
            />
            <FieldError message={errors.braze} />
          </EditorRow>
        ) : null}

        {form.brazeCampaignsEnabled ? (
          <EditorRow
            icon={<BrazeToolIcon />}
            title={
              <>
                <span>Braze Campaigns & Canvas</span>
                {!brazeConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import tagged draft campaigns and Canvas as JSON, translate in Jobs, then push approved locales through the Translation API."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_braze_campaigns")}
                label="Remove Braze"
                onClick={() => onChange({ ...form, brazeCampaignsEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationBrazeCampaignsSettings
              organizationSlug={organizationSlug}
              form={form}
              errors={errors}
              brazeConnected={brazeConnected}
              projectSourceLocale={selectedProject?.sourceLocale}
              projectTargetLocales={selectedProject?.targetLocales}
              onChange={onChange}
            />
            <FieldError message={errors.braze} />
          </EditorRow>
        ) : null}

        {form.customerIoEnabled ? (
          <EditorRow
            icon={<CustomerIoToolIcon />}
            title={
              <>
                <span>Customer.io Campaigns, Broadcasts, Newsletters & Transactional</span>
                {!customerIoConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import campaigns, broadcasts, newsletters, and transactional messages as JSON, translate in Jobs, then push approved locales back to Customer.io."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_customer_io_campaigns")}
                label="Remove Customer.io"
                onClick={() => onChange({ ...form, customerIoEnabled: false })}
              />
            }
          >
            <WorkspaceAutomationCustomerIoSettings
              organizationSlug={organizationSlug}
              form={form}
              customerIoConnected={customerIoConnected}
              onChange={onChange}
            />
            <FieldError message={errors.customerIo} />
          </EditorRow>
        ) : null}

        {form.loopsEnabled ? (
          <EditorRow
            icon={<LoopsToolIcon />}
            title={
              <>
                <span>Loops Transactional, Campaigns & Workflows</span>
                {!loopsConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import Loops emails as HTML, translate in Jobs, then push approved locales as separate unpublished Loops copies."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_loops_emails")}
                label="Remove Loops"
                onClick={() => onChange({ ...form, loopsEnabled: false })}
              />
            }
          >
            <FieldError message={errors.loops} />
          </EditorRow>
        ) : null}

        {form.hubspotEnabled ? (
          <EditorRow
            icon={<HubspotToolIcon />}
            title={
              <>
                <span>HubSpot emails, forms, pages, and blog posts</span>
                {!hubspotConnected ? (
                  <Badge variant="secondary">
                    <FormattedMessage {...workspaceAutomationFormMessages.connectFirstBadge} />
                  </Badge>
                ) : null}
              </>
            }
            description="Import HubSpot marketing emails, forms, blog posts, landing pages, and website pages, translate in Jobs, then push approved locales as unpublished copies."
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("import_hubspot_content")}
                label="Remove HubSpot"
                onClick={() => onChange({ ...form, hubspotEnabled: false })}
              />
            }
          >
            <FieldError message={errors.hubspot} />
          </EditorRow>
        ) : null}

        {form.crowdinEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon icon={siCrowdin} />}
            tone="external"
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
                requiredBySkills={skillTools.get("use_crowdin")}
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
                value={form.crowdinProjectId || null}
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
                    <SelectItem key={project.id} value={project.id} label={project.name}>
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
            icon={<UploadSimpleIcon className="size-4" />}
            tone="builtIn"
            title={<FormattedMessage {...workspaceAutomationFormMessages.createJob} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.createJobDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("create_native_tms_job")}
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
            icon={<BrainIcon className="size-4" />}
            tone="builtIn"
            title={<FormattedMessage {...workspaceAutomationFormMessages.translateWithAgent} />}
            description={
              <FormattedMessage
                {...workspaceAutomationFormMessages.translateWithAgentDescription}
              />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("assign_translate_with_agent")}
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
            icon={<CheckSquareIcon className="size-4" />}
            tone="builtIn"
            title={<FormattedMessage {...workspaceAutomationFormMessages.listIssues} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.listIssuesDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("list_issues")}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeListIssues)}
                onClick={() => onChange({ ...form, listIssuesEnabled: false })}
              />
            }
          />
        ) : null}

        {form.createIssueEnabled ? (
          <EditorRow
            icon={<CheckSquareIcon className="size-4" />}
            tone="builtIn"
            title={<FormattedMessage {...workspaceAutomationFormMessages.createIssue} />}
            description={
              <FormattedMessage {...workspaceAutomationFormMessages.createIssueDescription} />
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("create_issue")}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeCreateIssue)}
                onClick={() => onChange({ ...form, createIssueEnabled: false })}
              />
            }
          />
        ) : null}

        {form.mcpEnabled ? (
          <EditorRow
            icon={<FoldersIcon className="size-4" />}
            tone="external"
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
                value={form.mcpConnectionId || null}
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
                    <SelectItem
                      key={connection.id}
                      value={connection.id}
                      label={connection.displayName}
                    >
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
            tone="external"
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
                value={form.semrushConnectionId || null}
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
                    <SelectItem
                      key={connection.id}
                      value={connection.id}
                      label={connection.displayName}
                    >
                      {connection.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.semrushConnectionId} />
            </div>
          </EditorRow>
        ) : null}

        {form.zernioEnabled ? (
          <EditorRow
            icon={<ZernioToolIcon />}
            tone="external"
            title={<FormattedMessage {...workspaceAutomationFormMessages.zernio} />}
            description={
              zernioConnected
                ? intl.formatMessage(workspaceAutomationFormMessages.zernioDescription)
                : intl.formatMessage(workspaceAutomationFormMessages.zernioDisconnectedDescription)
            }
            action={
              <DeleteToolButton
                disabled={disabled}
                label={intl.formatMessage(workspaceAutomationFormMessages.removeZernioTool)}
                onClick={() =>
                  onChange({
                    ...form,
                    zernioEnabled: false,
                    zernioConnectionId: "",
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
                value={form.zernioConnectionId || null}
                disabled={disabled || !zernioConnected}
                onValueChange={(value) => {
                  if (!value) {
                    return;
                  }
                  onChange({ ...form, zernioConnectionId: value });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={intl.formatMessage(
                      workspaceAutomationFormMessages.selectConnection,
                    )}
                  >
                    {enabledZernioConnections.find(
                      (connection) => connection.id === form.zernioConnectionId,
                    )?.displayName ??
                      intl.formatMessage(workspaceAutomationFormMessages.selectConnection)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {enabledZernioConnections.map((connection) => (
                    <SelectItem
                      key={connection.id}
                      value={connection.id}
                      label={connection.displayName}
                    >
                      {connection.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.zernioConnectionId} />
            </div>
          </EditorRow>
        ) : null}

        {form.ahrefsEnabled ? (
          <EditorRow
            icon={<AutomationToolMenuIcon />}
            tone="external"
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
                  })
                }
              />
            }
          >
            <FieldError message={errors.ahrefs} />
          </EditorRow>
        ) : null}

        {form.webSearchEnabled ? (
          <EditorRow
            icon={<GlobeIcon className="size-4" />}
            tone="builtIn"
            title={<FormattedMessage {...workspaceAutomationFormMessages.webSearch} />}
            description={intl.formatMessage(workspaceAutomationFormMessages.webSearchDescription)}
            action={
              <DeleteToolButton
                disabled={disabled}
                requiredBySkills={skillTools.get("use_web_search")}
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
          gitlabConnected={gitlabConnected}
          gitlabProjects={gitlabProjects}
          knowledgeAvailable={knowledgeAvailable}
          mcpConnected={mcpConnected}
          onChange={onChange}
          repositories={repositories}
          ahrefsConnected={ahrefsConnected}
          intercomConnected={intercomConnected}
          sanityConnected={sanityConnected}
          webflowConnected={webflowConnected}
          brazeConnected={brazeConnected}
          customerIoConnected={customerIoConnected}
          loopsConnected={loopsConnected}
          hubspotConnected={hubspotConnected}
          semrushConnected={semrushConnected}
          zernioConnected={zernioConnected}
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

export function WorkspaceAutomationEditor({
  actions,
  assistantApi,
  assistantEnabled = false,
  assistantHasUnsavedChanges,
  assistantInitialPrompt = null,
  automationId,
  canUpdateKnowledgeMemory = false,
  disabled,
  errors,
  footer,
  form,
  knowledgeAvailable = false,
  mode,
  onAssistantChange,
  onAssistantSessionChange,
  onAssistantWorkingChange,
  onChange,
  organizationSlug,
  runHistory,
  runHistoryRefreshing,
  onRefreshRunHistory,
  initialEditorTab,
}: {
  actions?: ReactNode;
  /** The assistant's calls in place of the server's, for a story. */
  assistantApi?: AutomationAssistantApi;
  /** Offers the automation assistant beside the form. */
  assistantEnabled?: boolean;
  /** Whether the page holds anything unsaved, so the assistant stops calling saved changes unsaved. */
  assistantHasUnsavedChanges?: boolean;
  /** A request handed over from the automations page, which the assistant starts with. */
  assistantInitialPrompt?: string | null;
  automationId?: string;
  canUpdateKnowledgeMemory?: boolean;
  disabled?: boolean;
  errors: Record<string, string | undefined>;
  /** Shown under the editor, in the same scrolling pane when the assistant is offered. */
  footer?: ReactNode;
  form: WorkspaceAutomationFormState;
  knowledgeAvailable?: boolean;
  mode: "create" | "detail";
  /**
   * Called with the form after each change the assistant makes, and the turn that made it;
   * `onChange` when absent.
   */
  onAssistantChange?: (next: WorkspaceAutomationFormState, turn: string) => void;
  /** Called when the assistant's session for this page starts or ends. */
  onAssistantSessionChange?: (sessionId: string | null) => void;
  /** Called when a turn of the assistant's starts or stops running. */
  onAssistantWorkingChange?: (working: boolean) => void;
  onChange: (next: WorkspaceAutomationFormState) => void;
  onRefreshRunHistory?: () => void;
  organizationSlug: string;
  runHistory?: WorkspaceAutomationRunRecord[];
  runHistoryRefreshing?: boolean;
  initialEditorTab?: WorkspaceAutomationEditorTab;
}) {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<WorkspaceAutomationEditorTab>(
    initialEditorTab ?? "settings",
  );
  useEffect(() => {
    if (initialEditorTab) {
      setActiveTab(initialEditorTab);
    }
  }, [initialEditorTab]);
  const editorRef = useScrollToFirstFieldError(errors, activeTab, setActiveTab);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [riskySkillId, setRiskySkillId] = useState<string | null>(null);
  // Suggestions follow the text once typing pauses, so a keyword that is only the start of a
  // longer word ("pr" in "project") does not flash a chip in and out.
  const [suggestionText, setSuggestionText] = useState({
    name: form.name,
    instructions: form.instructions,
  });
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSuggestionText((current) =>
        current.name === form.name && current.instructions === form.instructions
          ? current
          : { name: form.name, instructions: form.instructions },
      );
    }, SUGGESTION_TYPING_PAUSE_MS);
    return () => clearTimeout(timeout);
  }, [form.name, form.instructions]);
  const [shownSuggestionKeys, setShownSuggestionKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const { client: goSvcClient } = useGoSvcClient();

  const projectsQuery = useQuery({
    queryKey: ["projects", organizationSlug],
    queryFn: async () => {
      const body = await goSvcClient.project.list(organizationSlug);
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

  const resendPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, "resend"],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: "resend" },
      });
      if (!response.ok) {
        throw new Error("Failed to load Resend connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
        apiKeyLast4: string | null;
      };
    },
  });

  const sendgridPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, "sendgrid"],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: "sendgrid" },
      });
      if (!response.ok) {
        throw new Error("Failed to load SendGrid connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
        apiKeyLast4: string | null;
      };
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

  const webflowConnectionsQuery = useQuery({
    queryKey: ["webflow-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["webflow-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Webflow connections");
      }
      const body = await response.json();
      return body.webflowConnections as WebflowConnectionSummary[];
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

  const zernioConnectionsQuery = useQuery({
    queryKey: ["zernio-connections", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"]["zernio-connections"].$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        throw new Error("Failed to load Zernio connections");
      }
      const body = await response.json();
      return body.zernioConnections as ZernioConnectionOption[];
    },
  });

  const brazePipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, BRAZE_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: BRAZE_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Braze connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
      };
    },
  });

  const customerIoPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, CUSTOMER_IO_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: CUSTOMER_IO_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Customer.io connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
      };
    },
  });

  const loopsPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, LOOPS_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: LOOPS_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Loops connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
      };
    },
  });

  const hubspotPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, HUBSPOT_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: HUBSPOT_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load HubSpot connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
      };
    },
  });

  const intercomPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, INTERCOM_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: INTERCOM_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Intercom connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
        apiKeyLast4: string | null;
      };
    },
  });

  const sanityPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, SANITY_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: SANITY_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Sanity connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
        apiKeyLast4: string | null;
      };
    },
  });

  const googleDrivePipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, GOOGLE_DRIVE_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: GOOGLE_DRIVE_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Google Drive connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
      };
    },
  });

  const ahrefsPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, AHREFS_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: AHREFS_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load Ahrefs connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
        apiKeyLast4: string | null;
      };
    },
  });

  const gitlabPipesQuery = useQuery({
    queryKey: ["pipes", organizationSlug, GITLAB_PIPES_SLUG],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].pipes[":provider"].$get({
        param: { organizationSlug, provider: GITLAB_PIPES_SLUG },
      });
      if (!response.ok) {
        throw new Error("Failed to load GitLab connection");
      }
      const body = await response.json();
      return body.pipe as {
        connected: boolean;
        needsReauthorization: boolean;
        apiKeyLast4: string | null;
      };
    },
  });

  const gitlabProjectsQuery = useQuery({
    queryKey: ["gitlab-projects", organizationSlug],
    queryFn: async () => {
      const response = await api.api.orgs[":organizationSlug"].gitlab.projects.$get({
        param: { organizationSlug },
      });
      if (!response.ok) {
        return [] as GitlabProjectOption[];
      }
      const body = await response.json();
      return body.projects as GitlabProjectOption[];
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
  const emailProviderConnected =
    form.emailProvider === "sendgrid"
      ? Boolean(sendgridPipesQuery.data?.connected)
      : Boolean(resendPipesQuery.data?.connected);
  const emailConnected =
    Boolean(resendPipesQuery.data?.connected) || Boolean(sendgridPipesQuery.data?.connected);
  const contentfulConnections = contentfulConnectionsQuery.data ?? [];
  const contentfulConnected = contentfulConnections.length > 0;
  const webflowConnections = webflowConnectionsQuery.data ?? [];
  const webflowConnected = webflowConnections.length > 0;
  const mcpServerConnections = mcpServerConnectionsQuery.data ?? [];
  const semrushConnections = semrushConnectionsQuery.data ?? [];
  const zernioConnections = zernioConnectionsQuery.data ?? [];
  const ahrefsConnected = Boolean(ahrefsPipesQuery.data?.connected);
  const intercomConnected = Boolean(intercomPipesQuery.data?.connected);
  const sanityConnected = Boolean(sanityPipesQuery.data?.connected);
  const googleDriveConnected = Boolean(googleDrivePipesQuery.data?.connected);
  const brazeConnected = Boolean(brazePipesQuery.data?.connected);
  const customerIoConnected = Boolean(customerIoPipesQuery.data?.connected);
  const loopsConnected = Boolean(loopsPipesQuery.data?.connected);
  const hubspotConnected = Boolean(hubspotPipesQuery.data?.connected);
  const gitlabConnected = Boolean(gitlabPipesQuery.data?.connected);
  const gitlabProjects = gitlabProjectsQuery.data ?? [];
  const crowdinLiveProjects = (tmsLiveProjectsQuery.data ?? []).map(toCrowdinProjectOption);
  const hasHistory = mode === "detail";
  const skillDefaults: WorkspaceAutomationSkillDefaults = {
    githubInstallationRepositoryId: resolveDefaultGithubRepositoryId(form, repositories),
    crowdinProjectId: defaultCrowdinProjectId(
      form,
      collectCrowdinProjects(projectsQuery.data ?? [], crowdinLiveProjects),
    ),
    contentfulConnectionId:
      contentfulConnections.length === 1 ? contentfulConnections[0]?.id : undefined,
    webflowConnectionId: webflowConnections.length === 1 ? webflowConnections[0]?.id : undefined,
  };
  const usableSemrushConnections = semrushConnections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );
  const usableZernioConnections = zernioConnections.filter(
    (connection) => connection.enabled && connection.validationStatus === "valid",
  );
  // Undefined while a status is loading or failed to load, so only a known gap greys a skill out.
  const skillConnections: WorkspaceAutomationSkillConnections = {
    github: githubInstallationQuery.isSuccess ? githubConnected : undefined,
    crowdin: tmsProviderQuery.isSuccess ? crowdinConnected : undefined,
    contentful: contentfulConnectionsQuery.isSuccess ? contentfulConnected : undefined,
    intercom: intercomPipesQuery.isSuccess ? intercomConnected : undefined,
    sanity: sanityPipesQuery.isSuccess ? sanityConnected : undefined,
    webflow: webflowConnectionsQuery.isSuccess ? webflowConnected : undefined,
    google_drive: googleDrivePipesQuery.isSuccess ? googleDriveConnected : undefined,
    braze: brazePipesQuery.isSuccess ? brazeConnected : undefined,
    customer_io: customerIoPipesQuery.isSuccess ? customerIoConnected : undefined,
    loops: loopsPipesQuery.isSuccess ? loopsConnected : undefined,
    hubspot: hubspotPipesQuery.isSuccess ? hubspotConnected : undefined,
    slack: slackQuery.isSuccess ? slackConnected : undefined,
    email: emailConnected
      ? true
      : resendPipesQuery.isSuccess && sendgridPipesQuery.isSuccess
        ? false
        : undefined,
  };
  const suggestions = suggestWorkspaceAutomationAdditions({
    form: { ...form, ...suggestionText },
    skillConnections,
    connections: {
      github: githubConnected,
      gitlab: gitlabConnected,
      semrush: usableSemrushConnections.length > 0,
      ahrefs: ahrefsConnected,
      zernio: usableZernioConnections.length > 0,
    },
    dismissed: dismissedSuggestions,
  });
  // Kept here, not in the chips: the chips unmount with the settings tab, and coming back to
  // the tab must not flash suggestions that were already there.
  const suggestionKeys = suggestions.map((suggestion) => suggestion.key).join("\n");
  useEffect(() => {
    setShownSuggestionKeys(new Set(suggestionKeys ? suggestionKeys.split("\n") : []));
  }, [suggestionKeys]);
  const addSkill = (skillId: string) =>
    onChange(addSkillToWorkspaceAutomationForm(form, skillId, skillDefaults));
  // A skill that declares a risk is attached only after the user confirms it.
  const requestAddSkill = (skillId: string) => {
    if (getWorkspaceAutomationSkill(skillId)?.risk) {
      setRiskySkillId(skillId);
      return;
    }
    addSkill(skillId);
  };
  const riskySkill = riskySkillId ? getWorkspaceAutomationSkill(riskySkillId) : null;
  const addSuggestion = (suggestion: WorkspaceAutomationSuggestion) => {
    if (suggestion.kind === "skill") {
      requestAddSkill(suggestion.skill.id);
      return;
    }
    onChange(
      addSuggestedToolToWorkspaceAutomationForm(form, suggestion.toolId, {
        githubInstallationRepositoryId: skillDefaults.githubInstallationRepositoryId,
        gitlabPathWithNamespace: resolveDefaultGitlabProject(form, gitlabProjects)
          ?.pathWithNamespace,
        semrushConnectionId:
          usableSemrushConnections.length === 1 ? usableSemrushConnections[0]?.id : undefined,
        zernioConnectionId:
          usableZernioConnections.length === 1 ? usableZernioConnections[0]?.id : undefined,
      }),
    );
  };

  // The assistant waits for these before its first turn, so it knows what is connected.
  const skillConnectionsSettled =
    !projectsQuery.isPending &&
    !githubInstallationQuery.isPending &&
    !(githubConnected && repositoriesQuery.isPending) &&
    !tmsProviderQuery.isPending &&
    !(crowdinConnected && tmsLiveProjectsQuery.isPending) &&
    !contentfulConnectionsQuery.isPending &&
    !slackQuery.isPending &&
    !resendPipesQuery.isPending &&
    !sendgridPipesQuery.isPending &&
    !intercomPipesQuery.isPending &&
    !sanityPipesQuery.isPending &&
    !webflowConnectionsQuery.isPending &&
    !brazePipesQuery.isPending &&
    !customerIoPipesQuery.isPending &&
    !loopsPipesQuery.isPending &&
    !hubspotPipesQuery.isPending;

  const editor = (
    <div ref={editorRef} className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="flex flex-col gap-3">
        {/* The actions drop under the name when both do not fit, as with the assistant open. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-64 flex-1">
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
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
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
          <span className="text-border">{METADATA_SEPARATOR}</span>
          <HeaderProjectSelector
            disabled={disabled}
            form={form}
            isError={projectsQuery.isError}
            isLoading={projectsQuery.isLoading}
            onChange={onChange}
            projects={projectsQuery.data ?? []}
          />
          <span className="text-border">{METADATA_SEPARATOR}</span>
          <HeaderModelSelector disabled={disabled} form={form} onChange={onChange} />
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

      <AutomationAssistantSummary organizationSlug={organizationSlug} />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as WorkspaceAutomationEditorTab)}
      >
        {/* A new automation has settings only, and one tab is no choice to offer. */}
        {hasHistory ? (
          // The rule runs the editor's width, and the active tab's underline sits on it.
          <div className="border-b border-border">
            <TabsList variant="line" className="-ms-[3px]">
              <TabsTrigger value="settings">
                <FormattedMessage {...workspaceAutomationFormMessages.settingsTab} />
              </TabsTrigger>
              <TabsTrigger value="history">
                <FormattedMessage {...workspaceAutomationFormMessages.runHistoryTab} />
              </TabsTrigger>
            </TabsList>
          </div>
        ) : null}

        <TabsContent
          value="settings"
          className={cn("flex flex-col gap-6", hasHistory ? "mt-4" : undefined)}
        >
          <TriggerSettings
            automationId={automationId}
            contentfulConnected={contentfulConnected}
            contentfulConnections={contentfulConnections}
            disabled={disabled}
            errors={errors}
            form={form}
            githubConnected={githubConnected}
            onChange={onChange}
            organizationSlug={organizationSlug}
            repositories={repositories}
          />

          <EditorSection
            title={intl.formatMessage(workspaceAutomationFormMessages.agentInstructionsSection)}
            titleAside={
              <SuggestionChips
                disabled={disabled}
                shownKeys={shownSuggestionKeys}
                suggestions={suggestions}
                onAdd={addSuggestion}
                onDismiss={(suggestion) =>
                  setDismissedSuggestions((current) => new Set(current).add(suggestion.key))
                }
              />
            }
            // Above the right edge of the text box it helps to fill in.
            titleEnd={assistantEnabled ? <AutomationAssistantOpenButton /> : undefined}
          >
            <Textarea
              id="automation-instructions"
              value={form.instructions}
              disabled={disabled}
              className="min-h-80 resize-y rounded-xl border-border bg-muted font-sans text-sm leading-6"
              placeholder={intl.formatMessage(
                form.skillIds.length > 0
                  ? workspaceAutomationFormMessages.instructionsWithSkillsPlaceholder
                  : workspaceAutomationFormMessages.instructionsPlaceholder,
              )}
              onChange={(event) => onChange({ ...form, instructions: event.target.value })}
            />
            <FieldError message={errors.instructions} />
          </EditorSection>

          <SkillsSettings
            connections={skillConnections}
            disabled={disabled}
            error={errors.skills}
            form={form}
            onAddSkill={requestAddSkill}
            onChange={onChange}
          />

          <ToolsSettings
            automationId={automationId}
            canUpdateKnowledgeMemory={canUpdateKnowledgeMemory}
            contentfulConnections={contentfulConnections}
            crowdinConnected={crowdinConnected}
            crowdinLiveProjects={crowdinLiveProjects}
            disabled={disabled}
            emailConnected={emailConnected}
            emailProviderConnected={emailProviderConnected}
            errors={errors}
            form={form}
            githubConnected={githubConnected}
            gitlabConnected={gitlabConnected}
            gitlabProjects={gitlabProjects}
            knowledgeAvailable={knowledgeAvailable}
            mcpServerConnections={mcpServerConnections}
            onChange={onChange}
            organizationSlug={organizationSlug}
            projects={projectsQuery.data ?? []}
            repositories={repositories}
            ahrefsConnected={ahrefsConnected}
            intercomConnected={intercomConnected}
            googleDriveConnected={googleDriveConnected}
            sanityConnected={sanityConnected}
            webflowConnected={webflowConnected}
            webflowConnections={webflowConnections}
            brazeConnected={brazeConnected}
            customerIoConnected={customerIoConnected}
            loopsConnected={loopsConnected}
            hubspotConnected={hubspotConnected}
            semrushConnections={semrushConnections}
            zernioConnections={zernioConnections}
            slackConnected={slackConnected}
          />
        </TabsContent>

        {hasHistory ? (
          <TabsContent value="history" className="mt-4 flex flex-col gap-3">
            {onRefreshRunHistory ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={runHistoryRefreshing}
                  onClick={onRefreshRunHistory}
                >
                  {runHistoryRefreshing ? <Spinner className="size-3.5" /> : <ArrowClockwiseIcon />}
                  <FormattedMessage {...workspaceAutomationFormMessages.refreshRunHistory} />
                </Button>
              </div>
            ) : null}
            <RunHistoryTable runs={runHistory ?? []} />
          </TabsContent>
        ) : null}
      </Tabs>

      <AlertDialog
        open={riskySkill !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRiskySkillId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {intl.formatMessage(workspaceAutomationFormMessages.riskySkillTitle, {
                name: riskySkill?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>{riskySkill?.risk}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <FormattedMessage {...workspaceAutomationFormMessages.riskySkillCancel} />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (riskySkillId) {
                  addSkill(riskySkillId);
                }
                setRiskySkillId(null);
              }}
            >
              <FormattedMessage {...workspaceAutomationFormMessages.riskySkillConfirm} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  if (!assistantEnabled) {
    return (
      <>
        {editor}
        {footer}
      </>
    );
  }

  return (
    <AutomationAssistantProvider
      api={assistantApi}
      automationId={automationId}
      connections={skillConnections}
      connectionsSettled={skillConnectionsSettled}
      contentfulConnectionIds={contentfulConnections.map((connection) => connection.id)}
      crowdinProjectIds={collectCrowdinProjects(projectsQuery.data ?? [], crowdinLiveProjects).map(
        (project) => project.id,
      )}
      form={form}
      hasUnsavedChanges={assistantHasUnsavedChanges}
      initialPrompt={assistantInitialPrompt}
      mode={mode}
      onChange={onAssistantChange ?? onChange}
      onSessionChange={onAssistantSessionChange}
      onWorkingChange={onAssistantWorkingChange}
      organizationSlug={organizationSlug}
      projectName={
        (projectsQuery.data ?? []).find((project) => project.id === form.projectId)?.name ?? null
      }
      repositories={repositories.map((repository) => ({
        id: repository.id,
        name: repository.fullName,
        selectable: repository.enabled && !repository.archived,
      }))}
    >
      <AutomationAssistantLayout>
        {editor}
        {footer}
      </AutomationAssistantLayout>
    </AutomationAssistantProvider>
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
