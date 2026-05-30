import { z } from "zod";

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
