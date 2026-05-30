import { z } from "zod";

export const i18nSetupRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);

export type I18nSetupRunStatus = z.infer<typeof i18nSetupRunStatusSchema>;

export const i18nSetupRequestedEventSchema = z.object({
  runId: z.string().uuid(),
  organizationId: z.string().uuid(),
  actorUserId: z.string().uuid(),
  installationId: z.number(),
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  repositoryFullName: z.string(),
  githubRepositoryId: z.string(),
  baseBranch: z.string(),
});

export type I18nSetupRequestedEventData = z.infer<typeof i18nSetupRequestedEventSchema>;

export type I18nSetupWorkflowResult = {
  ok: boolean;
  runId: string;
  status: I18nSetupRunStatus;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  errorCode?: string;
  errorMessage?: string;
  detectedLocaleCount?: number;
};
