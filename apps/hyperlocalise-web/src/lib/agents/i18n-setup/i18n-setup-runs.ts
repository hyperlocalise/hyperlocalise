import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { I18nSetupRunStatus } from "@/lib/agents/i18n-setup/i18n-setup-task";

export type I18nSetupRunRecord = {
  id: string;
  organizationId: string;
  actorUserId: string;
  githubRepositoryId: string;
  repositoryFullName: string;
  baseBranch: string;
  status: I18nSetupRunStatus;
  errorCode: string | null;
  errorMessage: string | null;
  pullRequestUrl: string | null;
  pullRequestNumber: number | null;
  detectedLocaleCount: number | null;
  workflowRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeI18nSetupRun(
  run: typeof schema.githubI18nSetupRuns.$inferSelect,
): I18nSetupRunRecord {
  return {
    id: run.id,
    organizationId: run.organizationId,
    actorUserId: run.actorUserId,
    githubRepositoryId: run.githubRepositoryId,
    repositoryFullName: run.repositoryFullName,
    baseBranch: run.baseBranch,
    status: run.status as I18nSetupRunStatus,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    pullRequestUrl: run.pullRequestUrl,
    pullRequestNumber: run.pullRequestNumber,
    detectedLocaleCount: run.detectedLocaleCount,
    workflowRunId: run.workflowRunId,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export async function getI18nSetupRun(input: {
  organizationId: string;
  runId: string;
}): Promise<I18nSetupRunRecord | null> {
  const [run] = await db
    .select()
    .from(schema.githubI18nSetupRuns)
    .where(
      and(
        eq(schema.githubI18nSetupRuns.id, input.runId),
        eq(schema.githubI18nSetupRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return run ? serializeI18nSetupRun(run) : null;
}

export async function findActiveI18nSetupRun(input: {
  organizationId: string;
  githubRepositoryId: string;
}): Promise<I18nSetupRunRecord | null> {
  const [run] = await db
    .select()
    .from(schema.githubI18nSetupRuns)
    .where(
      and(
        eq(schema.githubI18nSetupRuns.organizationId, input.organizationId),
        eq(schema.githubI18nSetupRuns.githubRepositoryId, input.githubRepositoryId),
        inArray(schema.githubI18nSetupRuns.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(schema.githubI18nSetupRuns.createdAt))
    .limit(1);

  return run ? serializeI18nSetupRun(run) : null;
}

export async function getLatestI18nSetupRun(input: {
  organizationId: string;
  githubRepositoryId: string;
}): Promise<I18nSetupRunRecord | null> {
  const [run] = await db
    .select()
    .from(schema.githubI18nSetupRuns)
    .where(
      and(
        eq(schema.githubI18nSetupRuns.organizationId, input.organizationId),
        eq(schema.githubI18nSetupRuns.githubRepositoryId, input.githubRepositoryId),
      ),
    )
    .orderBy(desc(schema.githubI18nSetupRuns.createdAt))
    .limit(1);

  return run ? serializeI18nSetupRun(run) : null;
}
