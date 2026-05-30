import { z } from "zod";

const branchPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._\-/*?]+$/, "invalid_branch_pattern");

export const githubRepoAutomationTriggerModeSchema = z.enum(["scheduled", "push"]);

export const githubRepoAutomationCadenceSchema = z.enum(["hourly", "daily", "weekly"]);

const scheduledTriggerSchema = z.object({
  mode: z.literal("scheduled"),
  cadence: githubRepoAutomationCadenceSchema,
  hourUtc: z.number().int().min(0).max(23).default(0),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  timezone: z.string().trim().min(1).max(64).default("UTC"),
});

const pushTriggerSchema = z.object({
  mode: z.literal("push"),
  branches: z.array(branchPatternSchema).min(1).max(32),
});

export const githubRepoAutomationTriggerSchema = z.discriminatedUnion("mode", [
  scheduledTriggerSchema,
  pushTriggerSchema,
]);

export const githubRepoAutomationValidationWorkflowSchema = z
  .object({
    enabled: z.boolean().default(false),
    blockOnFailure: z.boolean().default(true),
  })
  .default({ enabled: false, blockOnFailure: true });

export const githubRepoAutomationWorkflowsSchema = z.object({
  pushSource: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  pullTranslations: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  validation: githubRepoAutomationValidationWorkflowSchema,
});

export const githubRepositoryAutomationSettingsSchema = z.object({
  workflows: githubRepoAutomationWorkflowsSchema.default({
    pushSource: { enabled: false },
    pullTranslations: { enabled: false },
    validation: { enabled: false, blockOnFailure: true },
  }),
  trigger: githubRepoAutomationTriggerSchema.nullable().default(null),
});

export type GithubRepositoryAutomationSettings = z.infer<
  typeof githubRepositoryAutomationSettingsSchema
>;
export type GithubRepositoryAutomationSettingsPartial = {
  workflows?: {
    pushSource?: { enabled?: boolean };
    pullTranslations?: { enabled?: boolean };
    validation?: { enabled?: boolean; blockOnFailure?: boolean };
  };
  trigger?: z.infer<typeof githubRepoAutomationTriggerSchema> | null;
};

export const DEFAULT_GITHUB_REPOSITORY_AUTOMATION_SETTINGS: GithubRepositoryAutomationSettings =
  githubRepositoryAutomationSettingsSchema.parse({});

const githubRepositoryAutomationSettingsPartialSchema = z.object({
  workflows: z
    .object({
      pushSource: z.object({ enabled: z.boolean().optional() }).optional(),
      pullTranslations: z.object({ enabled: z.boolean().optional() }).optional(),
      validation: z
        .object({
          enabled: z.boolean().optional(),
          blockOnFailure: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  trigger: githubRepoAutomationTriggerSchema.nullable().optional(),
});

export function parseGithubRepositoryAutomationSettingsPartial(
  value: unknown,
): GithubRepositoryAutomationSettingsPartial {
  return githubRepositoryAutomationSettingsPartialSchema.parse(value);
}

export function normalizeStoredGithubRepositoryAutomationSettings(
  value: Record<string, unknown> | null | undefined,
): GithubRepositoryAutomationSettingsPartial {
  if (!value || Object.keys(value).length === 0) {
    return {};
  }

  return parseGithubRepositoryAutomationSettingsPartial(value);
}

export function mergeGithubRepositoryAutomationSettings(
  base: GithubRepositoryAutomationSettings,
  override?: GithubRepositoryAutomationSettingsPartial | null,
): GithubRepositoryAutomationSettings {
  if (!override) {
    return base;
  }

  const trigger = override.trigger !== undefined ? override.trigger : base.trigger;

  return githubRepositoryAutomationSettingsSchema.parse({
    workflows: {
      pushSource: {
        enabled: override.workflows?.pushSource?.enabled ?? base.workflows.pushSource.enabled,
      },
      pullTranslations: {
        enabled:
          override.workflows?.pullTranslations?.enabled ?? base.workflows.pullTranslations.enabled,
      },
      validation: {
        enabled: override.workflows?.validation?.enabled ?? base.workflows.validation.enabled,
        blockOnFailure:
          override.workflows?.validation?.blockOnFailure ??
          base.workflows.validation.blockOnFailure,
      },
    },
    trigger,
  });
}

export function hasEnabledGithubRepoAutomationWorkflow(
  settings: GithubRepositoryAutomationSettings,
): boolean {
  return (
    settings.workflows.pushSource.enabled ||
    settings.workflows.pullTranslations.enabled ||
    settings.workflows.validation.enabled
  );
}

export function validateGithubRepositoryAutomationSettings(
  settings: GithubRepositoryAutomationSettings,
): string | null {
  const hasWorkflow = hasEnabledGithubRepoAutomationWorkflow(settings);

  if (!hasWorkflow) {
    return null;
  }

  if (!settings.trigger) {
    return "automation_trigger_required";
  }

  if (settings.trigger.mode === "push") {
    if (settings.trigger.branches.length === 0) {
      return "push_trigger_requires_branches";
    }
  }

  if (settings.trigger.mode === "scheduled") {
    if (settings.trigger.cadence === "weekly" && settings.trigger.dayOfWeek === undefined) {
      return "weekly_schedule_requires_day_of_week";
    }
    if (!isValidAutomationTimeZone(settings.trigger.timezone)) {
      return "invalid_automation_timezone";
    }
  }

  return null;
}

function isValidAutomationTimeZone(timeZone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

type ZonedDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getZonedDateTimeParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
    weekday: WEEKDAY_TO_INDEX[weekday] ?? 0,
  };
}

function addDaysToLocalDate(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function nextTopOfHourUtc(from: Date): Date {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);
  next.setUTCMinutes(0);
  next.setUTCHours(next.getUTCHours() + 1);
  return next;
}

function nextDailyRunUtc(from: Date, hourUtc: number): Date {
  const next = new Date(from);
  next.setUTCHours(hourUtc, 0, 0, 0);

  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function nextWeeklyRunUtc(from: Date, timeZone: string, hourUtc: number, dayOfWeek: number): Date {
  const zoned = getZonedDateTimeParts(from, timeZone);
  let { year, month, day } = zoned;

  const daysUntil = (dayOfWeek - zoned.weekday + 7) % 7;
  if (daysUntil > 0) {
    ({ year, month, day } = addDaysToLocalDate(year, month, day, daysUntil));
  }

  let candidate = new Date(Date.UTC(year, month - 1, day, hourUtc, 0, 0));

  if (candidate.getTime() <= from.getTime()) {
    ({ year, month, day } = addDaysToLocalDate(year, month, day, 7));
    candidate = new Date(Date.UTC(year, month - 1, day, hourUtc, 0, 0));
  }

  return candidate;
}

export function computeNextScheduledRunAt(
  trigger: Extract<GithubRepositoryAutomationSettings["trigger"], { mode: "scheduled" }>,
  from: Date = new Date(),
): Date {
  if (trigger.cadence === "hourly") {
    return nextTopOfHourUtc(from);
  }

  const hourUtc = trigger.hourUtc;
  if (trigger.cadence === "daily") {
    return nextDailyRunUtc(from, hourUtc);
  }

  return nextWeeklyRunUtc(from, trigger.timezone, hourUtc, trigger.dayOfWeek ?? 1);
}

export function resolveNextRunAtForSettings(
  settings: GithubRepositoryAutomationSettings,
  from: Date = new Date(),
): Date | null {
  if (!hasEnabledGithubRepoAutomationWorkflow(settings)) {
    return null;
  }

  if (!settings.trigger || settings.trigger.mode !== "scheduled") {
    return null;
  }

  return computeNextScheduledRunAt(settings.trigger, from);
}

function globPatternToRegExp(pattern: string): RegExp {
  let regexSource = "^";

  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];

    if (character === "*" && pattern[index + 1] === "*") {
      regexSource += ".*";
      index += 1;
      continue;
    }

    if (character === "*") {
      regexSource += "[^/]*";
      continue;
    }

    if (character === "?") {
      regexSource += "[^/]";
      continue;
    }

    if (/[.+^${}()|[\]\\]/.test(character)) {
      regexSource += `\\${character}`;
      continue;
    }

    regexSource += character;
  }

  regexSource += "$";
  return new RegExp(regexSource);
}

export function branchMatchesAutomationPatterns(branch: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => globPatternToRegExp(pattern).test(branch));
}

export function shouldRunAutomationForPushBranch(
  settings: GithubRepositoryAutomationSettings,
  branch: string,
): boolean {
  if (!hasEnabledGithubRepoAutomationWorkflow(settings)) {
    return false;
  }

  if (!settings.trigger || settings.trigger.mode !== "push") {
    return false;
  }

  return branchMatchesAutomationPatterns(branch, settings.trigger.branches);
}

export type GithubRepoAutomationDispatchPayload = {
  configVersion: number;
  githubInstallationRepositoryId: string;
  organizationId: string;
  githubRepositoryId: string;
  githubInstallationId: string;
  triggerMode: "scheduled" | "push";
  workflows: {
    pushSource: boolean;
    pullTranslations: boolean;
    validation: boolean;
    validationBlockOnFailure: boolean;
  };
  pushBranch?: string;
};

export function buildGithubRepoAutomationDispatchPayload(input: {
  configVersion: number;
  githubInstallationRepositoryId: string;
  organizationId: string;
  githubRepositoryId: string;
  githubInstallationId: string;
  settings: GithubRepositoryAutomationSettings;
  pushBranch?: string;
}): GithubRepoAutomationDispatchPayload | null {
  if (!hasEnabledGithubRepoAutomationWorkflow(input.settings)) {
    return null;
  }

  if (!input.settings.trigger) {
    return null;
  }

  if (input.settings.trigger.mode === "push") {
    if (!input.pushBranch) {
      return null;
    }
    if (!shouldRunAutomationForPushBranch(input.settings, input.pushBranch)) {
      return null;
    }
  }

  return {
    configVersion: input.configVersion,
    githubInstallationRepositoryId: input.githubInstallationRepositoryId,
    organizationId: input.organizationId,
    githubRepositoryId: input.githubRepositoryId,
    githubInstallationId: input.githubInstallationId,
    triggerMode: input.settings.trigger.mode,
    workflows: {
      pushSource: input.settings.workflows.pushSource.enabled,
      pullTranslations: input.settings.workflows.pullTranslations.enabled,
      validation: input.settings.workflows.validation.enabled,
      validationBlockOnFailure: input.settings.workflows.validation.blockOnFailure,
    },
    pushBranch: input.pushBranch,
  };
}
