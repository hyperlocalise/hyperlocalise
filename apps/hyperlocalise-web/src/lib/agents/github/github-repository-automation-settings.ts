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

export const githubRepoAutomationWorkflowsSchema = z.object({
  pushSource: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  pullTranslations: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
  validation: z.object({ enabled: z.boolean().default(false) }).default({ enabled: false }),
});

export const githubRepositoryAutomationSettingsSchema = z.object({
  workflows: githubRepoAutomationWorkflowsSchema.default({
    pushSource: { enabled: false },
    pullTranslations: { enabled: false },
    validation: { enabled: false },
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
    validation?: { enabled?: boolean };
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
      validation: z.object({ enabled: z.boolean().optional() }).optional(),
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
  }

  return null;
}

export function computeNextScheduledRunAt(
  trigger: Extract<GithubRepositoryAutomationSettings["trigger"], { mode: "scheduled" }>,
  from: Date = new Date(),
): Date {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);

  if (trigger.cadence === "hourly") {
    next.setUTCMinutes(0);
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }

  const hourUtc = trigger.hourUtc;
  if (trigger.cadence === "daily") {
    next.setUTCHours(hourUtc, 0, 0, 0);
    if (next.getTime() <= from.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  const dayOfWeek = trigger.dayOfWeek ?? 1;
  next.setUTCHours(hourUtc, 0, 0, 0);
  const currentDay = next.getUTCDay();
  let daysUntil = (dayOfWeek - currentDay + 7) % 7;
  if (daysUntil === 0 && next.getTime() <= from.getTime()) {
    daysUntil = 7;
  }
  next.setUTCDate(next.getUTCDate() + daysUntil);
  return next;
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
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexSource = `^${escaped.replace(/\*/g, ".*").replace(/\?/g, ".")}$`;
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
    },
    pushBranch: input.pushBranch,
  };
}
