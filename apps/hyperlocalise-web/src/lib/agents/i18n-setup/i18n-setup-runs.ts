import { and, desc, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type {
  I18nSetupRunStatus,
  I18nSetupWorkflowResult,
} from "@/lib/agents/i18n-setup/i18n-setup-task";

type I18nSetupRunRow = typeof schema.githubI18nSetupRuns.$inferSelect;

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

export function serializeI18nSetupRun(run: I18nSetupRunRow): I18nSetupRunRecord {
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

function isActiveI18nSetupStatus(status: I18nSetupRunStatus): boolean {
  return status === "queued" || status === "running";
}

async function markI18nSetupRunFailed(
  run: I18nSetupRunRow,
  input: { errorCode: string; errorMessage: string },
): Promise<I18nSetupRunRow> {
  const [updatedRun] = await db
    .update(schema.githubI18nSetupRuns)
    .set({
      status: "failed",
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(schema.githubI18nSetupRuns.id, run.id))
    .returning();

  return updatedRun ?? run;
}

async function syncI18nSetupRunWithWorkflowStatus(run: I18nSetupRunRow): Promise<I18nSetupRunRow> {
  const appStatus = run.status as I18nSetupRunStatus;
  if (!isActiveI18nSetupStatus(appStatus) || !run.workflowRunId) {
    return run;
  }

  try {
    const { getRun } = await import("workflow/api");
    const workflowRun = getRun<I18nSetupWorkflowResult>(run.workflowRunId);
    const workflowStatus = await workflowRun.status;

    if (workflowStatus === "cancelled") {
      return markI18nSetupRunFailed(run, {
        errorCode: "i18n_setup_cancelled",
        errorMessage: "The i18n setup wizard was cancelled.",
      });
    }

    if (workflowStatus === "failed") {
      return markI18nSetupRunFailed(run, {
        errorCode: "i18n_setup_runtime_failed",
        errorMessage: "The i18n setup workflow failed before it could report progress.",
      });
    }

    if (workflowStatus !== "completed") {
      return run;
    }

    const result = await workflowRun.returnValue;
    const [updatedRun] = await db
      .update(schema.githubI18nSetupRuns)
      .set({
        status: result.status,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        pullRequestUrl: result.pullRequestUrl ?? null,
        pullRequestNumber: result.pullRequestNumber ?? null,
        detectedLocaleCount: result.detectedLocaleCount ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.githubI18nSetupRuns.id, run.id))
      .returning();

    return updatedRun ?? run;
  } catch {
    return run;
  }
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

  if (!run) {
    return null;
  }

  return serializeI18nSetupRun(await syncI18nSetupRunWithWorkflowStatus(run));
}

export async function cancelI18nSetupRun(input: {
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

  if (!run) {
    return null;
  }

  const status = run.status as I18nSetupRunStatus;
  if (!isActiveI18nSetupStatus(status)) {
    return serializeI18nSetupRun(run);
  }

  if (run.workflowRunId) {
    try {
      const { getRun } = await import("workflow/api");
      await getRun(run.workflowRunId).cancel();
    } catch {
      // Best-effort only. The app status below is what unblocks the user.
    }
  }

  const [updatedRun] = await db
    .update(schema.githubI18nSetupRuns)
    .set({
      status: "failed",
      errorCode: "i18n_setup_cancelled",
      errorMessage: "The i18n setup wizard was cancelled.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.githubI18nSetupRuns.id, run.id),
        inArray(schema.githubI18nSetupRuns.status, ["queued", "running"]),
      ),
    )
    .returning();

  if (updatedRun) {
    return serializeI18nSetupRun(updatedRun);
  }

  const [currentRun] = await db
    .select()
    .from(schema.githubI18nSetupRuns)
    .where(eq(schema.githubI18nSetupRuns.id, run.id))
    .limit(1);

  return serializeI18nSetupRun(currentRun ?? run);
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

  if (!run) {
    return null;
  }

  const syncedRun = await syncI18nSetupRunWithWorkflowStatus(run);
  const syncedStatus = syncedRun.status as I18nSetupRunStatus;

  return isActiveI18nSetupStatus(syncedStatus) ? serializeI18nSetupRun(syncedRun) : null;
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

  if (!run) {
    return null;
  }

  return serializeI18nSetupRun(await syncI18nSetupRunWithWorkflowStatus(run));
}
