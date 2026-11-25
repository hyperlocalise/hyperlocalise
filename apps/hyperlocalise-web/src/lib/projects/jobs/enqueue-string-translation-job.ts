/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import {
  enqueueJobCreatedActivity,
  enqueueJobFailedActivity,
} from "@/lib/activity-log/job-automation-events";
import { ensureAiFeaturesAllowed } from "@/lib/billing/ai-features";
import {
  formatUsageControlError,
  reserveUsageEvent,
  usageFeatureIds,
} from "@/lib/billing/usage-control";
import { db, schema } from "@/lib/database/client";
import { insertJobs, updateJobs } from "@/lib/job-change-events/job-writes";
import { validateJobLocalesAgainstProject } from "@/lib/i18n/project-job-locales";
import { isErr } from "@/lib/primitives/result/results";
import {
  assertOrganizationCanEnqueueTranslationJobInTransaction,
  OrganizationJobBudgetExceededError,
} from "@/lib/security/organization-operation-budget";
import type { JobQueue, TranslationJobEventData } from "@/lib/workflow/types";

export type EnqueueStringTranslationJobInput = {
  organizationId: string;
  projectId: string;
  sourceText: string;
  sourceLocale: string;
  targetLocales: string[];
  context?: string;
  metadata?: Record<string, string>;
  jobQueue: JobQueue<TranslationJobEventData>;
  idempotency?: { key: string; requestHash: string };
};

export type EnqueueStringTranslationJobResult =
  | { ok: true; jobId: string; createdAt: Date; status: string; replayed: boolean }
  | { ok: false; code: string; message: string };

/** Creates and enqueues an organization-scoped AI string translation job. */
export async function enqueueStringTranslationJob(
  input: EnqueueStringTranslationJobInput,
): Promise<EnqueueStringTranslationJobResult> {
  const enqueueReplay = async (jobId: string) => {
    try {
      await input.jobQueue.enqueue({
        kind: "translation",
        jobId,
        projectId: input.projectId,
        type: "string",
      });
      return true;
    } catch {
      return false;
    }
  };
  const findReplay = async () => {
    if (!input.idempotency) return null;
    const [row] = await db
      .select({
        jobId: schema.jobs.id,
        status: schema.jobs.status,
        createdAt: schema.jobs.createdAt,
        requestHash: schema.workflowTranslationJobIdempotencyKeys.requestHash,
      })
      .from(schema.workflowTranslationJobIdempotencyKeys)
      .innerJoin(
        schema.jobs,
        eq(schema.jobs.id, schema.workflowTranslationJobIdempotencyKeys.jobId),
      )
      .where(
        and(
          eq(schema.workflowTranslationJobIdempotencyKeys.organizationId, input.organizationId),
          eq(schema.workflowTranslationJobIdempotencyKeys.key, input.idempotency.key),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (row.requestHash !== input.idempotency.requestHash) {
      return { conflict: true as const };
    }
    return { conflict: false as const, ...row };
  };
  const replay = await findReplay();
  if (replay?.conflict) {
    return {
      ok: false,
      code: "translation_job_idempotency_conflict",
      message: "This workflow step key was already used with different translation inputs.",
    };
  }
  if (replay && !replay.conflict) {
    if (replay.status === "queued" && !(await enqueueReplay(replay.jobId))) {
      return {
        ok: false,
        code: "translation_job_enqueue_failed",
        message: "Unable to recover the translation job queue message.",
      };
    }
    return {
      ok: true,
      jobId: replay.jobId,
      createdAt: replay.createdAt,
      status: replay.status,
      replayed: true,
    };
  }
  const [project] = await db
    .select({
      id: schema.projects.id,
      source: schema.projects.source,
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, input.projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    return { ok: false, code: "project_not_found", message: "Project not found." };
  }

  const aiFeatures = await ensureAiFeaturesAllowed({ organizationId: input.organizationId });
  if (!aiFeatures.ok) {
    return { ok: false, code: aiFeatures.error.code, message: aiFeatures.error.message };
  }

  const localeValidation = validateJobLocalesAgainstProject(project, {
    sourceLocale: input.sourceLocale,
    targetLocales: input.targetLocales,
  });
  if (isErr(localeValidation)) return { ok: false, ...localeValidation.error };

  const jobId = `job_${randomUUID()}`;
  try {
    const created = await db.transaction(async (tx) => {
      const budget = await assertOrganizationCanEnqueueTranslationJobInTransaction(
        tx,
        input.organizationId,
      );
      if (isErr(budget)) throw new OrganizationJobBudgetExceededError(budget.error);

      const [job] = await insertJobs(tx, {
        values: {
          id: jobId,
          organizationId: input.organizationId,
          projectId: input.projectId,
          assigneeType: "agent",
          ownerUserId: null,
          kind: "translation",
          status: "queued",
          inputPayload: {
            sourceText: input.sourceText,
            sourceLocale: input.sourceLocale,
            targetLocales: input.targetLocales,
            ...(input.context ? { context: input.context } : {}),
            ...(input.metadata ? { metadata: input.metadata } : {}),
          },
        },
        returning: { id: schema.jobs.id, createdAt: schema.jobs.createdAt },
      });
      await tx.insert(schema.translationJobDetails).values({ jobId, type: "string" });
      if (input.idempotency) {
        const [claimed] = await tx
          .insert(schema.workflowTranslationJobIdempotencyKeys)
          .values({
            organizationId: input.organizationId,
            key: input.idempotency.key,
            requestHash: input.idempotency.requestHash,
            jobId,
          })
          .onConflictDoNothing()
          .returning({ jobId: schema.workflowTranslationJobIdempotencyKeys.jobId });
        if (!claimed) throw new WorkflowTranslationJobIdempotencyRaceError();
      }

      const usage = await reserveUsageEvent({
        db: tx,
        organizationId: input.organizationId,
        featureId: usageFeatureIds.translationJobs,
        operationKey: `job:${jobId}:translation_jobs`,
        source: "translation_job_create",
        jobId,
        quantity: 1,
      });
      if (isErr(usage)) throw new Error(formatUsageControlError(usage.error));
      return job!;
    });

    await enqueueJobCreatedActivity({
      actorCredentialId: null,
      actorKind: "agent",
      actorUserId: null,
      jobId: created.id,
      kind: "translation",
      organizationId: input.organizationId,
      projectId: input.projectId,
      status: "queued",
    });

    try {
      await input.jobQueue.enqueue({
        kind: "translation",
        jobId: created.id,
        projectId: input.projectId,
        type: "string",
      });
    } catch {
      await updateJobs(db, {
        set: { status: "failed", lastError: "Translation job queue unavailable." },
        where: and(
          eq(schema.jobs.id, created.id),
          eq(schema.jobs.organizationId, input.organizationId),
        ),
      });
      await enqueueJobFailedActivity({
        actorCredentialId: null,
        actorKind: "agent",
        actorUserId: null,
        errorCode: "translation_job_enqueue_failed",
        jobId: created.id,
        kind: "translation",
        organizationId: input.organizationId,
        projectId: input.projectId,
        status: "failed",
      });
      return {
        ok: false,
        code: "translation_job_enqueue_failed",
        message: "Unable to enqueue translation job.",
      };
    }

    return {
      ok: true,
      jobId: created.id,
      createdAt: created.createdAt,
      status: "queued",
      replayed: false,
    };
  } catch (error) {
    if (error instanceof WorkflowTranslationJobIdempotencyRaceError) {
      const concurrent = await findReplay();
      if (concurrent && !concurrent.conflict) {
        if (concurrent.status === "queued" && !(await enqueueReplay(concurrent.jobId))) {
          return {
            ok: false,
            code: "translation_job_enqueue_failed",
            message: "Unable to recover the translation job queue message.",
          };
        }
        return {
          ok: true,
          jobId: concurrent.jobId,
          createdAt: concurrent.createdAt,
          status: concurrent.status,
          replayed: true,
        };
      }
    }
    if (error instanceof OrganizationJobBudgetExceededError) {
      return { ok: false, ...error.budgetError };
    }
    return {
      ok: false,
      code: "translation_job_create_failed",
      message: "Unable to create translation job.",
    };
  }
}

class WorkflowTranslationJobIdempotencyRaceError extends Error {}
