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
import type React from "react";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  CaretDownIcon,
  ChatTextIcon,
  CheckIcon,
  ClockIcon,
  GitBranchIcon,
  GitCommitIcon,
  GithubLogoIcon,
  GitPullRequestIcon,
  HandTapIcon,
  UploadSimpleIcon,
  WebhooksLogoIcon,
  type Icon,
} from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type IntlShape, type MessageDescriptor } from "react-intl";

import { AutomationTimeZoneSelect } from "@/components/automation/automation-time-zone-select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuHint,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  AUTOMATION_WEEKDAY_OPTIONS,
  addBranchPattern,
} from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model";
import { AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/integrations/_components/github-repository-automation-view-model.messages";
import { workspaceAutomationFormMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-form.messages";
import { workspaceAutomationTriggerMessages } from "@/app/[lang]/(authenticated)/org/[organizationSlug]/automations/_components/workspace-automation-trigger-settings.messages";
import type { WorkspaceAutomationGithubTriggerEvent } from "@/lib/agents/workspace-automation-types";
import type { WorkspaceAutomationFormState } from "@/lib/agents/workspace-automation-view-model";
import { buildWorkspaceAutomationWebChatHref } from "@/lib/agents/workspace-automation-web-chat-url";
import { cn } from "@/lib/primitives/cn";

import { WebChatUrlCopyField } from "./web-chat-url-copy-field";
import {
  resolveContentfulTriggerContentTypes,
  type ContentfulConnectionOption,
} from "./workspace-automation-contentful-trigger";

export type GithubRepositoryOption = {
  id: string;
  fullName: string;
  enabled: boolean;
  archived: boolean;
  defaultBranch: string | null;
};

/** What a trigger needs from outside the form to offer itself and to fill in defaults. */
export type TriggerContext = {
  contentfulConnected: boolean;
  contentfulConnections: ContentfulConnectionOption[];
  githubConnected: boolean;
  repositories: GithubRepositoryOption[];
};

type TriggerFieldsProps = {
  automationId?: string;
  context: TriggerContext;
  disabled?: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  onChange: (next: WorkspaceAutomationFormState) => void;
  organizationSlug: string;
};

/**
 * One choice in the trigger menu. Each option owns the form fields it reads and writes, so
 * adding a trigger with its own data shape means adding one entry here.
 */
type TriggerOption = {
  id: string;
  group?: "github";
  icon: Icon;
  label: MessageDescriptor;
  /** Whether the form currently describes this trigger. */
  matches: (form: WorkspaceAutomationFormState) => boolean;
  /** Only called when `matches` is false, so switching never resets the current trigger. */
  select: (
    form: WorkspaceAutomationFormState,
    context: TriggerContext,
  ) => WorkspaceAutomationFormState;
  /** An integration that must be connected before the option can be chosen. */
  isUnavailable?: (context: TriggerContext) => boolean;
  /** Controls that follow the trigger name on the same line, read as prose. */
  Fields?: ComponentType<TriggerFieldsProps>;
  /** Rows shown under the trigger line, connected to it. */
  Details?: ComponentType<TriggerFieldsProps>;
};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

function Prose({ children }: { children: ReactNode }) {
  return <span className="text-sm text-foreground">{children}</span>;
}

const pillClassName = "h-8 max-w-xs rounded-lg";

/** A select styled like the other inline controls, caret included. */
function PillSelectTrigger({ children, ...props }: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger size="sm" showIcon={false} className={pillClassName} {...props}>
      {children}
      <CaretDownIcon className="size-3.5 shrink-0 opacity-60" />
    </SelectTrigger>
  );
}

export function formatRepositoryOptionLabel(intl: IntlShape, repository: GithubRepositoryOption) {
  if (repository.enabled) {
    return repository.fullName;
  }

  return intl.formatMessage(workspaceAutomationFormMessages.repositoryDisabledSuffix, {
    name: repository.fullName,
  });
}

export function selectedRepositoryLabel(
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

function formatHour(hourUtc: number) {
  return `${String(hourUtc).padStart(2, "0")}:00`;
}

const CADENCE_MESSAGE_BY_VALUE: Record<
  WorkspaceAutomationFormState["scheduledCadence"],
  MessageDescriptor
> = {
  hourly: workspaceAutomationTriggerMessages.cadenceHour,
  daily: workspaceAutomationTriggerMessages.cadenceDay,
  weekly: workspaceAutomationTriggerMessages.cadenceWeek,
};

function weekdayMessage(dayOfWeek: number) {
  return (
    AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[
      dayOfWeek as keyof typeof AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE
    ] ?? AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[1]
  );
}

function BranchPatternSelector({
  branches,
  disabled,
  onChange,
}: {
  branches: string[];
  disabled?: boolean;
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
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={intl.formatMessage(workspaceAutomationFormMessages.branchPatternsMenu)}
            className={cn(
              pillClassName,
              "justify-between gap-2 border-input bg-input/30 px-3 text-sm font-normal text-foreground hover:bg-input/50",
            )}
          />
        }
      >
        <span className="truncate">{formatBranchPatternLabel(intl, branches)}</span>
        <CaretDownIcon className="size-3.5 shrink-0 opacity-60" />
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
            aria-label={intl.formatMessage(workspaceAutomationFormMessages.branchPatternAriaLabel)}
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
  );
}

function GithubTriggerFields({ context, disabled, errors, form, onChange }: TriggerFieldsProps) {
  const intl = useIntl();

  return (
    <>
      <Prose>
        <FormattedMessage {...workspaceAutomationTriggerMessages.toBranch} />
      </Prose>
      <BranchPatternSelector
        branches={form.pushBranches}
        disabled={disabled}
        onChange={(pushBranches) => onChange({ ...form, pushBranches })}
      />
      <Prose>
        <FormattedMessage {...workspaceAutomationTriggerMessages.ofRepository} />
      </Prose>
      <Select
        value={form.githubInstallationRepositoryId || null}
        onValueChange={(value) => {
          if (!value) {
            return;
          }
          onChange({
            ...form,
            repositoryTargetKind: "github",
            githubInstallationRepositoryId: value,
          });
        }}
        disabled={disabled}
      >
        <PillSelectTrigger
          aria-label={intl.formatMessage(workspaceAutomationFormMessages.repositoryLabel)}
        >
          <span className="truncate">
            {selectedRepositoryLabel(
              intl,
              form.githubInstallationRepositoryId,
              context.repositories,
              intl.formatMessage(workspaceAutomationFormMessages.selectRepository),
            )}
          </span>
        </PillSelectTrigger>
        <SelectContent>
          {context.repositories.map((repository) => (
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
      <FieldError message={errors.pushBranches} />
      <FieldError message={errors.githubRepository} />
      <FieldError message={errors.githubEvents} />
    </>
  );
}

function ScheduledTriggerFields({ disabled, errors, form, onChange }: TriggerFieldsProps) {
  const intl = useIntl();

  return (
    <>
      <Prose>
        <FormattedMessage {...workspaceAutomationTriggerMessages.every} />
      </Prose>
      <Select
        value={form.scheduledCadence}
        onValueChange={(value) =>
          onChange({ ...form, scheduledCadence: value as typeof form.scheduledCadence })
        }
        disabled={disabled}
      >
        <PillSelectTrigger
          aria-label={intl.formatMessage(workspaceAutomationTriggerMessages.cadenceAriaLabel)}
        >
          <span className="truncate">
            <FormattedMessage {...CADENCE_MESSAGE_BY_VALUE[form.scheduledCadence]} />
          </span>
        </PillSelectTrigger>
        <SelectContent>
          <SelectItem value="hourly">
            <FormattedMessage {...workspaceAutomationTriggerMessages.cadenceHour} />
          </SelectItem>
          <SelectItem value="daily">
            <FormattedMessage {...workspaceAutomationTriggerMessages.cadenceDay} />
          </SelectItem>
          <SelectItem value="weekly">
            <FormattedMessage {...workspaceAutomationTriggerMessages.cadenceWeek} />
          </SelectItem>
        </SelectContent>
      </Select>
      {form.scheduledCadence === "weekly" ? (
        <>
          <Prose>
            <FormattedMessage {...workspaceAutomationTriggerMessages.onWeekday} />
          </Prose>
          <Select
            value={String(form.scheduledDayOfWeek)}
            onValueChange={(value) => onChange({ ...form, scheduledDayOfWeek: Number(value) })}
            disabled={disabled}
          >
            <PillSelectTrigger
              aria-label={intl.formatMessage(workspaceAutomationTriggerMessages.weekdayAriaLabel)}
            >
              <span className="truncate">
                {intl.formatMessage(weekdayMessage(form.scheduledDayOfWeek))}
              </span>
            </PillSelectTrigger>
            <SelectContent>
              {AUTOMATION_WEEKDAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {intl.formatMessage(AUTOMATION_WEEKDAY_MESSAGE_BY_VALUE[option.value])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      ) : null}
      {form.scheduledCadence !== "hourly" ? (
        <>
          <Prose>
            <FormattedMessage {...workspaceAutomationTriggerMessages.at} />
          </Prose>
          <Select
            value={String(form.scheduledHourUtc)}
            onValueChange={(value) => onChange({ ...form, scheduledHourUtc: Number(value) })}
            disabled={disabled}
          >
            <PillSelectTrigger
              aria-label={intl.formatMessage(workspaceAutomationTriggerMessages.hourAriaLabel)}
            >
              <span className="truncate">{formatHour(form.scheduledHourUtc)}</span>
            </PillSelectTrigger>
            <SelectContent className="max-h-72">
              {Array.from({ length: 24 }, (_, hour) => (
                <SelectItem key={hour} value={String(hour)}>
                  {formatHour(hour)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AutomationTimeZoneSelect
            size="sm"
            aria-label={intl.formatMessage(
              workspaceAutomationFormMessages.scheduleTimezoneAriaLabel,
            )}
            value={form.scheduledTimezone}
            disabled={disabled}
            className={cn(pillClassName, "min-w-0")}
            onValueChange={(value) => onChange({ ...form, scheduledTimezone: value })}
          />
        </>
      ) : null}
      <FieldError message={errors.scheduledTimezone} />
    </>
  );
}

function readContentfulTriggerContentTypes({ context, form }: TriggerFieldsProps) {
  const connection = context.contentfulConnections.find(
    (entry) => entry.id === form.contentfulConnectionId,
  );
  return {
    connection,
    ...resolveContentfulTriggerContentTypes({
      savedContentTypeIds: form.contentfulContentTypeIds,
      connection,
    }),
  };
}

/** Read-only: the content types whose publish reaches this automation. */
function ContentfulTriggerFields(props: TriggerFieldsProps) {
  const { any, contentTypeIds } = readContentfulTriggerContentTypes(props);

  if (any) {
    return (
      <Prose>
        <FormattedMessage {...workspaceAutomationTriggerMessages.contentfulAnyType} />
      </Prose>
    );
  }

  if (contentTypeIds.length === 0) {
    return null;
  }

  return (
    <>
      <Prose>
        <FormattedMessage {...workspaceAutomationTriggerMessages.contentfulOfType} />
      </Prose>
      {contentTypeIds.map((contentTypeId) => (
        <span
          key={contentTypeId}
          className="flex h-8 max-w-xs items-center truncate rounded-lg border border-border px-3 text-sm text-muted-foreground"
        >
          {contentTypeId}
        </span>
      ))}
    </>
  );
}

function ContentfulTriggerDetails(props: TriggerFieldsProps) {
  const { context, disabled, form, onChange } = props;
  const { any, connection, contentTypeIds, differsFromConnection } =
    readContentfulTriggerContentTypes(props);

  if (!context.contentfulConnected) {
    return (
      <TriggerDetailRow>
        <span className="text-xs text-muted-foreground">
          <FormattedMessage
            {...workspaceAutomationFormMessages.contentfulWebhookDisconnectedDescription}
          />
        </span>
      </TriggerDetailRow>
    );
  }

  if (!connection || !differsFromConnection) {
    return null;
  }

  const startsNothing = !any && contentTypeIds.length === 0;

  return (
    <TriggerDetailRow>
      <span className={cn("text-xs", startsNothing ? "text-destructive" : "text-muted-foreground")}>
        <FormattedMessage
          {...(startsNothing
            ? workspaceAutomationTriggerMessages.contentfulNoStartingType
            : workspaceAutomationTriggerMessages.contentfulTypesDiffer)}
        />
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className="h-8 rounded-full px-3"
        onClick={() =>
          onChange({ ...form, contentfulContentTypeIds: [...connection.contentTypeIds] })
        }
      >
        <FormattedMessage {...workspaceAutomationTriggerMessages.contentfulUseConnectionTypes} />
      </Button>
    </TriggerDetailRow>
  );
}

function WebChatTriggerDetails({ automationId, organizationSlug }: TriggerFieldsProps) {
  const intl = useIntl();

  if (!automationId) {
    return (
      <TriggerDetailRow>
        <span className="text-xs text-muted-foreground">
          <FormattedMessage {...workspaceAutomationFormMessages.webChatUrlPending} />
        </span>
      </TriggerDetailRow>
    );
  }

  const chatHref = buildWorkspaceAutomationWebChatHref({
    organizationSlug,
    automationId,
    locale: intl.locale,
  });

  return (
    <TriggerDetailRow>
      <Prose>
        <FormattedMessage {...workspaceAutomationTriggerMessages.chatUrl} />
      </Prose>
      <div className="min-w-0 flex-1 basis-64">
        <WebChatUrlCopyField automationId={automationId} organizationSlug={organizationSlug} />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-full px-3"
        nativeButton={false}
        render={<Link href={chatHref} target="_blank" rel="noreferrer" />}
      >
        <FormattedMessage {...workspaceAutomationFormMessages.openChat} />
      </Button>
    </TriggerDetailRow>
  );
}

function githubEventsMatch(
  form: WorkspaceAutomationFormState,
  events: WorkspaceAutomationGithubTriggerEvent[],
) {
  if (form.triggerMode !== "github") {
    return false;
  }

  const has = (event: WorkspaceAutomationGithubTriggerEvent) => form.githubEvents.includes(event);
  // A GitHub trigger with no events listens to pushes once saved.
  const listensToPush = has("push") || !has("pull_request");
  return (
    listensToPush === events.includes("push") &&
    has("pull_request") === events.includes("pull_request")
  );
}

function selectGithubTrigger(
  form: WorkspaceAutomationFormState,
  context: TriggerContext,
  events: WorkspaceAutomationGithubTriggerEvent[],
): WorkspaceAutomationFormState {
  if (form.triggerMode === "github") {
    return { ...form, githubEvents: events };
  }

  const defaultRepositoryId =
    form.githubInstallationRepositoryId ||
    context.repositories.find((repository) => repository.enabled)?.id ||
    context.repositories[0]?.id ||
    "";

  return {
    ...form,
    triggerMode: "github",
    githubEnabled: true,
    githubEvents: events,
    repositoryTargetKind: "github",
    githubInstallationRepositoryId: defaultRepositoryId,
    validationEnabled:
      form.githubMode === "agent"
        ? form.validationEnabled
        : form.pushSourceEnabled || form.pullTranslationsEnabled
          ? form.validationEnabled
          : true,
  };
}

const TRIGGER_OPTIONS: TriggerOption[] = [
  {
    id: "manual",
    icon: HandTapIcon,
    label: workspaceAutomationTriggerMessages.manual,
    matches: (form) => form.triggerMode === "manual",
    select: (form) => ({ ...form, triggerMode: "manual" }),
  },
  {
    id: "scheduled",
    icon: ClockIcon,
    label: workspaceAutomationTriggerMessages.scheduled,
    matches: (form) => form.triggerMode === "scheduled",
    select: (form) => ({ ...form, triggerMode: "scheduled" }),
    Fields: ScheduledTriggerFields,
  },
  {
    id: "github_push",
    group: "github",
    icon: GitCommitIcon,
    label: workspaceAutomationTriggerMessages.githubPush,
    matches: (form) => githubEventsMatch(form, ["push"]),
    select: (form, context) => selectGithubTrigger(form, context, ["push"]),
    isUnavailable: (context) => !context.githubConnected,
    Fields: GithubTriggerFields,
  },
  {
    id: "github_pull_request",
    group: "github",
    icon: GitPullRequestIcon,
    label: workspaceAutomationTriggerMessages.githubPullRequest,
    matches: (form) => githubEventsMatch(form, ["pull_request"]),
    select: (form, context) => selectGithubTrigger(form, context, ["pull_request"]),
    isUnavailable: (context) => !context.githubConnected,
    Fields: GithubTriggerFields,
  },
  {
    id: "github_push_or_pull_request",
    group: "github",
    icon: GitBranchIcon,
    label: workspaceAutomationTriggerMessages.githubPushOrPullRequest,
    matches: (form) => githubEventsMatch(form, ["push", "pull_request"]),
    select: (form, context) => selectGithubTrigger(form, context, ["push", "pull_request"]),
    isUnavailable: (context) => !context.githubConnected,
    Fields: GithubTriggerFields,
  },
  {
    id: "contentful",
    icon: WebhooksLogoIcon,
    label: workspaceAutomationTriggerMessages.contentful,
    matches: (form) => form.triggerMode === "contentful",
    select: (form) => ({ ...form, triggerMode: "contentful", contentfulEnabled: true }),
    isUnavailable: (context) => !context.contentfulConnected,
    Fields: ContentfulTriggerFields,
    Details: ContentfulTriggerDetails,
  },
  {
    id: "source_upload",
    icon: UploadSimpleIcon,
    label: workspaceAutomationTriggerMessages.sourceUpload,
    matches: (form) => form.triggerMode === "source_upload",
    select: (form) => ({
      ...form,
      triggerMode: "source_upload",
      createNativeTmsJobEnabled: true,
      createNativeTmsJobUseProjectTargetLocales: true,
      assignTranslateWithAgentEnabled: true,
    }),
  },
  {
    id: "web_chat",
    icon: ChatTextIcon,
    label: workspaceAutomationTriggerMessages.webChat,
    matches: (form) => form.triggerMode === "web_chat",
    select: (form) => ({ ...form, triggerMode: "web_chat" }),
    Details: WebChatTriggerDetails,
  },
];

function TriggerDetailRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 ps-3">
      <span
        aria-hidden
        className="mt-0.5 h-4 w-3 shrink-0 rounded-bl-md border-b border-l border-border"
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function TriggerMenuItem({
  context,
  option,
  selected,
  onSelect,
}: {
  context: TriggerContext;
  option: TriggerOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const unavailable = option.isUnavailable?.(context) ?? false;

  return (
    <DropdownMenuItem disabled={unavailable && !selected} onClick={onSelect}>
      <option.icon className="size-4" />
      <FormattedMessage {...option.label} />
      {selected ? (
        <CheckIcon className="ms-auto size-4" />
      ) : unavailable ? (
        <DropdownMenuHint>
          <FormattedMessage {...workspaceAutomationFormMessages.connectFirstShortcut} />
        </DropdownMenuHint>
      ) : null}
    </DropdownMenuItem>
  );
}

/** Options that share a `group` sit together in one submenu. */
const TRIGGER_GROUPS: Record<
  NonNullable<TriggerOption["group"]>,
  { icon: Icon; label: MessageDescriptor }
> = {
  github: { icon: GithubLogoIcon, label: workspaceAutomationTriggerMessages.githubGroup },
};

function TriggerMenu({
  context,
  disabled,
  form,
  onChange,
  selected,
}: {
  context: TriggerContext;
  disabled?: boolean;
  form: WorkspaceAutomationFormState;
  onChange: (next: WorkspaceAutomationFormState) => void;
  selected: TriggerOption;
}) {
  function renderItem(option: TriggerOption) {
    return (
      <TriggerMenuItem
        key={option.id}
        context={context}
        option={option}
        selected={option === selected}
        onSelect={() => {
          // Choosing the current trigger again leaves its fields as they are.
          if (option === selected) {
            return;
          }
          onChange(option.select(form, context));
        }}
      />
    );
  }

  const entries: ReactNode[] = [];
  const renderedGroups = new Set<string>();
  for (const option of TRIGGER_OPTIONS) {
    if (option.group === undefined) {
      entries.push(renderItem(option));
      continue;
    }
    if (renderedGroups.has(option.group)) {
      continue;
    }
    renderedGroups.add(option.group);
    const group = TRIGGER_GROUPS[option.group];
    const options = TRIGGER_OPTIONS.filter((candidate) => candidate.group === option.group);
    entries.push(
      <DropdownMenuSub key={option.group}>
        {/* Same gap as a plain item, so the labels line up. */}
        <DropdownMenuSubTrigger className="gap-2.5">
          <group.icon className="size-4" />
          <span className="flex-1">
            <FormattedMessage {...group.label} />
          </span>
          {options.includes(selected) ? <CheckIcon className="size-4" /> : null}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-80">{options.map(renderItem)}</DropdownMenuSubContent>
      </DropdownMenuSub>,
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            className="h-8 max-w-full justify-between gap-2 rounded-lg border-input bg-input/30 px-3 text-sm font-medium text-foreground hover:bg-input/50"
          />
        }
      >
        <selected.icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          <FormattedMessage {...selected.label} />
        </span>
        <CaretDownIcon className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="start" sideOffset={4}>
        {entries}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TriggerSettings({
  automationId,
  contentfulConnected,
  contentfulConnections = [],
  disabled,
  errors,
  form,
  githubConnected,
  onChange,
  organizationSlug,
  repositories,
}: {
  automationId?: string;
  contentfulConnected: boolean;
  contentfulConnections?: ContentfulConnectionOption[];
  disabled?: boolean;
  errors: Record<string, string | undefined>;
  form: WorkspaceAutomationFormState;
  githubConnected: boolean;
  onChange: (next: WorkspaceAutomationFormState) => void;
  organizationSlug: string;
  repositories: GithubRepositoryOption[];
}) {
  const context: TriggerContext = {
    contentfulConnected,
    contentfulConnections,
    githubConnected,
    repositories,
  };
  const selected = TRIGGER_OPTIONS.find((option) => option.matches(form)) ?? TRIGGER_OPTIONS[0]!;
  const fieldsProps: TriggerFieldsProps = {
    automationId,
    context,
    disabled,
    errors,
    form,
    onChange,
    organizationSlug,
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-2 text-xs font-medium text-muted-foreground">
        <FormattedMessage {...workspaceAutomationFormMessages.triggerSection} />
      </h2>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <TriggerMenu
            context={context}
            disabled={disabled}
            form={form}
            onChange={onChange}
            selected={selected}
          />
          {selected.Fields ? <selected.Fields {...fieldsProps} /> : null}
        </div>
        {selected.Details ? <selected.Details {...fieldsProps} /> : null}
      </div>
      <FieldError message={errors.trigger} />
    </section>
  );
}
