import {
  DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS,
  type GithubRepositoryAutomationSettings,
  type GithubRepositoryAutomationSettingsPartial,
  hasEnabledGithubRepoAutomationWorkflow,
  validateGithubRepositoryAutomationSettings,
} from "@/lib/agents/github/github-repository-automation-settings";

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
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export const AUTOMATION_API_ERROR_MESSAGES: Record<string, string> = {
  automation_trigger_required:
    "Enable at least one workflow and choose when automation should run.",
  push_trigger_requires_branches: "Add at least one branch pattern for push triggers.",
  weekly_schedule_requires_day_of_week: "Choose a day of the week for weekly schedules.",
  invalid_automation_timezone: "Enter a valid IANA timezone such as UTC or America/New_York.",
  github_repository_not_enabled: "Enable this repository before configuring automation.",
  github_repository_archived: "Archived repositories cannot use translation automation.",
  invalid_branch_pattern: "Branch patterns may only use letters, numbers, ., _, -, /, *, and ?.",
};

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
  form: GithubRepositoryAutomationFormState,
): GithubRepositoryAutomationFieldErrors {
  const errors: GithubRepositoryAutomationFieldErrors = {};
  const hasWorkflow = hasAnyAutomationWorkflowEnabled(form);

  if (form.pushSourceEnabled && !form.pushSourceProjectId.trim()) {
    errors.pushSourceProjectId = "Choose a Hyperlocalise project for push source.";
  }

  if (form.pullTranslationsEnabled && !form.pullTranslationsProjectId.trim()) {
    errors.pullTranslationsProjectId = "Choose a Hyperlocalise project for pull translations.";
  }

  if (!hasWorkflow) {
    return errors;
  }

  if (form.triggerMode === "none") {
    errors.trigger = "Choose push or scheduled triggers when workflows are enabled.";
    return errors;
  }

  if (form.triggerMode === "push") {
    if (form.pushBranches.length === 0) {
      errors.pushBranches = AUTOMATION_API_ERROR_MESSAGES.push_trigger_requires_branches;
    } else {
      const invalidPattern = form.pushBranches.find(
        (branch) => !BRANCH_PATTERN_REGEX.test(branch.trim()),
      );
      if (invalidPattern) {
        errors.pushBranches = AUTOMATION_API_ERROR_MESSAGES.invalid_branch_pattern;
      }
    }
  }

  if (form.triggerMode === "scheduled") {
    if (form.scheduledCadence === "weekly" && form.scheduledDayOfWeek === undefined) {
      errors.scheduledDayOfWeek =
        AUTOMATION_API_ERROR_MESSAGES.weekly_schedule_requires_day_of_week;
    }

    const timezone = form.scheduledTimezone.trim() || "UTC";
    try {
      Intl.DateTimeFormat("en-US", { timeZone: timezone });
    } catch {
      errors.scheduledTimezone = AUTOMATION_API_ERROR_MESSAGES.invalid_automation_timezone;
    }
  }

  const validationError = validateGithubRepositoryAutomationSettings(
    formStateToAutomationSettings(form),
  );
  if (validationError) {
    const mapped = mapAutomationApiErrorToFieldErrors(validationError);
    return { ...errors, ...mapped };
  }

  return errors;
}

export function mapAutomationApiErrorToFieldErrors(
  errorCode: string,
  message?: string,
): GithubRepositoryAutomationFieldErrors {
  const fallbackMessage = message ?? AUTOMATION_API_ERROR_MESSAGES[errorCode];

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
      return { form: fallbackMessage ?? "Could not save automation settings." };
  }
}

export function normalizeBranchPatternInput(value: string) {
  return value.trim();
}

export function addBranchPattern(
  branches: string[],
  rawPattern: string,
): { branches: string[]; error?: string } {
  const pattern = normalizeBranchPatternInput(rawPattern);

  if (!pattern) {
    return { branches, error: "Enter a branch pattern." };
  }

  if (!BRANCH_PATTERN_REGEX.test(pattern)) {
    return { branches, error: AUTOMATION_API_ERROR_MESSAGES.invalid_branch_pattern };
  }

  if (branches.includes(pattern)) {
    return { branches, error: "That branch pattern is already listed." };
  }

  if (branches.length >= MAX_AUTOMATION_BRANCH_PATTERNS) {
    return {
      branches,
      error: `You can add up to ${MAX_AUTOMATION_BRANCH_PATTERNS} branch patterns.`,
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
