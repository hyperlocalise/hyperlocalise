import { z } from "zod";

export const localOrgWorkspaceMigrationSummarySchema = z.object({
  migrated: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export const workspaceUpgradeResponseSchema = z.object({
  status: z.enum(["complete", "onboarding"]),
  redirectTo: z.string(),
  migration: localOrgWorkspaceMigrationSummarySchema,
});
