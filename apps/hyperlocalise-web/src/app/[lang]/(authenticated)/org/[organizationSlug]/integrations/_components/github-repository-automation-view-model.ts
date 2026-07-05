import type { IntlShape } from "react-intl";

import {
  DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
  type GithubRepositoryAutomationSettings,
  type GithubRepositoryAutomationSettingsPartial,
  hasEnabledGithubRepoAutomationWorkflow,
  validateGithubRepositoryAutomationSettings,
} from "@/lib/agents/github/github-repository-automation-settings";

import { githubRepositoryAutomationViewModelMessages } from "./github-repository-automation-view-model.messages";

export type GithubAutomationTriggerMode = "none" | "push" | "scheduled";

export type GithubRepositoryAutomationFormState = {
  pushSourceEnabled: boolean;
  pushSourceProjectId: string;
  pullTranslationsEnabled: boolean;
  pullTranslationsProjectId: string;
  validationEnabled: boolean;
  validationBlockOnFailure: boolean;
  triggerMode: GithubAutomationTriggerMode;
  pushBranches: string[];
  scheduledCadence: "hourly" | "daily" | "weekly";
  scheduledHourUtc: number;
  scheduledDayOfWeek: number;
  scheduledTimezone: string;
  statusCheckEnabled: boolean;
  statusCheckMode: "advisory" | "blocking";
};

export type GithubRepositoryAutomationFieldErrors = Partial<
  Record<
    | "pushSourceProjectId"
    | "pullTranslationsProjectId"
    | "trigger"
    | "pushBranches"
    | "scheduledDayOfWeek"
    | "scheduledTimezone"
    | "form",
    string
  >
>;

export const MAX_AUTOMATION_BRANCH_PATTERNS = 32;

const BRANCH_PATTERN_REGEX = /^[A-Za-z0-9._\-/*?]+$/;

export const AUTOMATION_WEEKDAY_OPTIONS = [
  { value: 0 },
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
] as const;

function getAutomationApiErrorMessage(intl: IntlShape, errorCode: string) {
  switch (errorCode) {
    case "automation_trigger_required":
      return intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.automationTriggerRequired,
      );
    case "push_trigger_requires_branches":
      return intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.pushTriggerRequiresBranches,
      );
    case "weekly_schedule_requires_day_of_week":
      return intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.weeklyScheduleRequiresDayOfWeek,
      );
    case "invalid_automation_timezone":
      return intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.invalidAutomationTimezone,
      );
    case "github_repository_not_enabled":
      return intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.githubRepositoryNotEnabled,
      );
    case "github_repository_archived":
      return intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.githubRepositoryArchived,
      );
    case "invalid_branch_pattern":
      return intl.formatMessage(githubRepositoryAutomationViewModelMessages.invalidBranchPattern);
    default:
      return undefined;
  }
}

export function createDefaultAutomationFormState(): GithubRepositoryAutomationFormState {
  const defaults = DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS;

  return {
    pushSourceEnabled: defaults.workflows.pushSource.enabled,
    pushSourceProjectId: defaults.workflows.pushSource.projectId ?? "",
    pullTranslationsEnabled: defaults.workflows.pullTranslations.enabled,
    pullTranslationsProjectId: defaults.workflows.pullTranslations.projectId ?? "",
    validationEnabled: defaults.workflows.validation.enabled,
    validationBlockOnFailure: defaults.workflows.validation.blockOnFailure,
    triggerMode: "none",
    pushBranches: ["main"],
    scheduledCadence: "daily",
    scheduledHourUtc: 2,
    scheduledDayOfWeek: 1,
    scheduledTimezone: "UTC",
    statusCheckEnabled: defaults.statusCheck.enabled,
    statusCheckMode: defaults.statusCheck.mode,
  };
}

export function createAutomationFormStateFromSettings(
  settings: GithubRepositoryAutomationSettings,
): GithubRepositoryAutomationFormState {
  const base = createDefaultAutomationFormState();
  const hasWorkflow = hasEnabledGithubRepoAutomationWorkflow(settings);

  let triggerMode: GithubAutomationTriggerMode = "none";
  if (hasWorkflow && settings.trigger?.mode === "push") {
    triggerMode = "push";
  } else if (hasWorkflow && settings.trigger?.mode === "scheduled") {
    triggerMode = "scheduled";
  }

  return {
    pushSourceEnabled: settings.workflows.pushSource.enabled,
    pushSourceProjectId: settings.workflows.pushSource.projectId ?? "",
    pullTranslationsEnabled: settings.workflows.pullTranslations.enabled,
    pullTranslationsProjectId: settings.workflows.pullTranslations.projectId ?? "",
    validationEnabled: settings.workflows.validation.enabled,
    validationBlockOnFailure: settings.workflows.validation.blockOnFailure,
    triggerMode,
    pushBranches:
      settings.trigger?.mode === "push" && settings.trigger.branches.length > 0
        ? [...settings.trigger.branches]
        : base.pushBranches,
    scheduledCadence:
      settings.trigger?.mode === "scheduled" ? settings.trigger.cadence : base.scheduledCadence,
    scheduledHourUtc:
      settings.trigger?.mode === "scheduled" ? settings.trigger.hourUtc : base.scheduledHourUtc,
    scheduledDayOfWeek:
      settings.trigger?.mode === "scheduled"
        ? (settings.trigger.dayOfWeek ?? base.scheduledDayOfWeek)
        : base.scheduledDayOfWeek,
    scheduledTimezone:
      settings.trigger?.mode === "scheduled" ? settings.trigger.timezone : base.scheduledTimezone,
    statusCheckEnabled: settings.statusCheck.enabled,
    statusCheckMode: settings.statusCheck.mode,
  };
}

export function hasAnyAutomationWorkflowEnabled(form: GithubRepositoryAutomationFormState) {
  return form.pushSourceEnabled || form.pullTranslationsEnabled || form.validationEnabled;
}

export function formStateToAutomationSettings(
  form: GithubRepositoryAutomationFormState,
): GithubRepositoryAutomationSettings {
  const hasWorkflow = hasAnyAutomationWorkflowEnabled(form);

  const trigger =
    !hasWorkflow || form.triggerMode === "none"
      ? null
      : form.triggerMode === "push"
        ? {
            mode: "push" as const,
            branches: form.pushBranches,
          }
        : {
            mode: "scheduled" as const,
            cadence: form.scheduledCadence,
            hourUtc: form.scheduledHourUtc,
            dayOfWeek: form.scheduledCadence === "weekly" ? form.scheduledDayOfWeek : undefined,
            timezone: form.scheduledTimezone.trim() || "UTC",
          };

  return {
    workflows: {
      pushSource: {
        enabled: form.pushSourceEnabled,
        ...(form.pushSourceProjectId.trim() ? { projectId: form.pushSourceProjectId.trim() } : {}),
      },
      pullTranslations: {
        enabled: form.pullTranslationsEnabled,
        ...(form.pullTranslationsProjectId.trim()
          ? { projectId: form.pullTranslationsProjectId.trim() }
          : {}),
      },
      validation: {
        enabled: form.validationEnabled,
        blockOnFailure: form.validationBlockOnFailure,
      },
    },
    trigger,
    statusCheck: {
      enabled: form.statusCheckEnabled,
      mode: form.statusCheckMode,
    },
  };
}

export function formStateToAutomationSettingsPayload(
  form: GithubRepositoryAutomationFormState,
): GithubRepositoryAutomationSettingsPartial {
  const settings = formStateToAutomationSettings(form);

  return {
    workflows: settings.workflows,
    trigger: settings.trigger,
    statusCheck: settings.statusCheck,
  };
}

export function validateAutomationFormState(
  intl: IntlShape,
  form: GithubRepositoryAutomationFormState,
): GithubRepositoryAutomationFieldErrors {
  const errors: GithubRepositoryAutomationFieldErrors = {};
  const hasWorkflow = hasAnyAutomationWorkflowEnabled(form);

  if (form.pushSourceEnabled && !form.pushSourceProjectId.trim()) {
    errors.pushSourceProjectId = intl.formatMessage(
      githubRepositoryAutomationViewModelMessages.pushSourceProjectRequired,
    );
  }

  if (form.pullTranslationsEnabled && !form.pullTranslationsProjectId.trim()) {
    errors.pullTranslationsProjectId = intl.formatMessage(
      githubRepositoryAutomationViewModelMessages.pullTranslationsProjectRequired,
    );
  }

  if (!hasWorkflow) {
    return errors;
  }

  if (form.triggerMode === "none") {
    errors.trigger = intl.formatMessage(
      githubRepositoryAutomationViewModelMessages.triggerRequired,
    );
    return errors;
  }

  if (form.triggerMode === "push") {
    if (form.pushBranches.length === 0) {
      errors.pushBranches = intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.pushTriggerRequiresBranches,
      );
    } else {
      const invalidPattern = form.pushBranches.find(
        (branch) => !BRANCH_PATTERN_REGEX.test(branch.trim()),
      );
      if (invalidPattern) {
        errors.pushBranches = intl.formatMessage(
          githubRepositoryAutomationViewModelMessages.invalidBranchPattern,
        );
      }
    }
  }

  if (form.triggerMode === "scheduled") {
    if (
      form.scheduledCadence === "weekly" &&
      (form.scheduledDayOfWeek < 0 || form.scheduledDayOfWeek > 6)
    ) {
      errors.scheduledDayOfWeek = intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.weeklyScheduleRequiresDayOfWeek,
      );
    }

    const timezone = form.scheduledTimezone.trim() || "UTC";
    try {
      Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      errors.scheduledTimezone = intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.invalidAutomationTimezone,
      );
    }
  }

  const validationError = validateGithubRepositoryAutomationSettings(
    formStateToAutomationSettings(form),
  );
  if (validationError) {
    const mapped = mapAutomationApiErrorToFieldErrors(intl, validationError);
    return { ...errors, ...mapped };
  }

  return errors;
}

export function mapAutomationApiErrorToFieldErrors(
  intl: IntlShape,
  errorCode: string,
  message?: string,
): GithubRepositoryAutomationFieldErrors {
  const fallbackMessage = message ?? getAutomationApiErrorMessage(intl, errorCode);

  switch (errorCode) {
    case "automation_trigger_required":
      return { trigger: fallbackMessage };
    case "push_trigger_requires_branches":
      return { pushBranches: fallbackMessage };
    case "weekly_schedule_requires_day_of_week":
      return { scheduledDayOfWeek: fallbackMessage };
    case "invalid_automation_timezone":
      return { scheduledTimezone: fallbackMessage };
    case "github_repository_not_enabled":
    case "github_repository_archived":
      return { form: fallbackMessage };
    default:
      return {
        form:
          fallbackMessage ??
          intl.formatMessage(githubRepositoryAutomationViewModelMessages.saveFailed),
      };
  }
}

export function normalizeBranchPatternInput(value: string) {
  return value.trim();
}

export function addBranchPattern(
  intl: IntlShape,
  branches: string[],
  rawPattern: string,
): { branches: string[]; error?: string } {
  const pattern = normalizeBranchPatternInput(rawPattern);

  if (!pattern) {
    return {
      branches,
      error: intl.formatMessage(githubRepositoryAutomationViewModelMessages.enterBranchPattern),
    };
  }

  if (!BRANCH_PATTERN_REGEX.test(pattern)) {
    return {
      branches,
      error: intl.formatMessage(githubRepositoryAutomationViewModelMessages.invalidBranchPattern),
    };
  }

  if (branches.includes(pattern)) {
    return {
      branches,
      error: intl.formatMessage(
        githubRepositoryAutomationViewModelMessages.branchPatternAlreadyListed,
      ),
    };
  }

  if (branches.length >= MAX_AUTOMATION_BRANCH_PATTERNS) {
    return {
      branches,
      error: intl.formatMessage(githubRepositoryAutomationViewModelMessages.maxBranchPatterns, {
        max: MAX_AUTOMATION_BRANCH_PATTERNS,
      }),
    };
  }

  return { branches: [...branches, pattern] };
}

export function formatAutomationNextRunAt(nextRunAt: string | null) {
  if (!nextRunAt) {
    return null;
  }

  const date = new Date(nextRunAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
