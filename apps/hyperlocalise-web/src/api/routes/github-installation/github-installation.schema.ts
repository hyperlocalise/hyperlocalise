import { z } from "zod";

import { githubRepositoryAutomationSettingsSchema } from "@/lib/agents/github/github-repository-automation-settings";

export const updateRepositoriesSchema = z.object({
  enabledRepositoryIds: z.array(z.string().regex(/^\d+$/)).default([]),
});

export const searchRepositoriesSchema = z.object({
  q: z.string().max(512).optional(),
});

export const githubRepositoryIdParamSchema = z.object({
  githubRepositoryId: z.string().regex(/^\d+$/),
});

export const i18nSetupRunIdParamSchema = z.object({
  runId: z.string().uuid(),
});

const githubRepositoryAutomationSettingsPartialSchema = z.object({
  workflows: z
    .object({
      pushSource: z.object({ enabled: z.boolean().optional() }).optional(),
      pullTranslations: z.object({ enabled: z.boolean().optional() }).optional(),
      validation: z.object({ enabled: z.boolean().optional() }).optional(),
    })
    .optional(),
  trigger: z
    .discriminatedUnion("mode", [
      z.object({
        mode: z.literal("scheduled"),
        cadence: z.enum(["hourly", "daily", "weekly"]),
        hourUtc: z.number().int().min(0).max(23).optional(),
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        timezone: z.string().trim().min(1).max(64).optional(),
      }),
      z.object({
        mode: z.literal("push"),
        branches: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(255)
              .regex(/^[A-Za-z0-9._\-/*?]+$/),
          )
          .min(1)
          .max(32),
      }),
    ])
    .nullable()
    .optional(),
});

export const upsertGithubRepositoryAutomationSettingsBodySchema = z.object({
  settings: githubRepositoryAutomationSettingsPartialSchema,
});

export const githubRepositoryAutomationSettingsResponseSchema = z.object({
  githubRepositoryId: z.string(),
  githubInstallationRepositoryId: z.string().uuid(),
  settings: githubRepositoryAutomationSettingsSchema,
  configVersion: z.number().int().nonnegative(),
  nextRunAt: z.string().datetime().nullable(),
  stored: z
    .object({
      id: z.string().uuid(),
      updatedAt: z.string(),
    })
    .nullable(),
});
