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
import { and, eq, gte, inArray, not, notExists, or, sql } from "drizzle-orm";

import { schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database/client";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const OPEN_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;
const MAX_OPEN_JOBS_PER_ORGANIZATION = 50;
const MAX_JOBS_CREATED_PER_HOUR = 120;

export type OrganizationOperationBudgetError = {
  code: "organization_job_budget_exceeded";
  message: string;
};

async function lockOrganizationJobBudget(tx: DatabaseTransaction, organizationId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${[
      "organization_job_budget",
      organizationId,
    ].join(":")}, 0))`,
  );
}

/**
 * A task for people: a job that starts no AI call and no sandbox while it is open, and can stay
 * open for days. That is a proofread or post-edit task, on a file or on chosen strings (nothing
 * starts a proofread job, also while it waits as `queued` for an earlier job), and a translate
 * task a person holds (`personTaskStep`). A translate task is stored like an AI translation job
 * with a step in its metadata, which any caller can set, so it only passes while it waits for
 * review: no AI translation job is ever in that status. A job given to an agent, or mirrored from
 * a provider (an agent run can start on it), is not one. The Go public API has the same rule in
 * `jobBudgetPersonTaskSQL` (`apps/public-api/jobs-create-store.go`): keep the two in step.
 */
function personTaskWhere(client: DatabaseClient) {
  return and(
    sql`${schema.jobs.assigneeType} is distinct from 'agent'`,
    notExists(
      client
        .select({ jobId: schema.externalJobDetails.jobId })
        .from(schema.externalJobDetails)
        .where(eq(schema.externalJobDetails.jobId, schema.jobs.id)),
    ),
    or(
      eq(schema.jobs.kind, "proofread"),
      and(
        eq(schema.jobs.kind, "translation"),
        eq(schema.jobs.status, "waiting_for_review"),
        sql`coalesce(${schema.jobs.inputPayload} -> 'metadata' ->> 'workflowTaskStep', '') = 'translate'`,
      ),
    ),
  )!;
}

async function countOrganizationJobBudgetUsage(client: DatabaseClient, organizationId: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [openJobsRow, recentJobsRow] = await Promise.all([
    client
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.organizationId, organizationId),
          inArray(schema.jobs.status, [...OPEN_JOB_STATUSES]),
          // Tasks for people don't hold back AI jobs. All jobs count towards the hourly rate.
          not(personTaskWhere(client)),
        ),
      ),
    client
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.organizationId, organizationId), gte(schema.jobs.createdAt, oneHourAgo)),
      ),
  ]);

  return {
    openJobs: openJobsRow[0]?.count ?? 0,
    recentJobs: recentJobsRow[0]?.count ?? 0,
  };
}

function evaluateOrganizationJobBudgetUsage(
  counts: {
    openJobs: number;
    recentJobs: number;
  },
  options: { checkOpenJobs: boolean } = { checkOpenJobs: true },
): Result<void, OrganizationOperationBudgetError> {
  if (options.checkOpenJobs && counts.openJobs >= MAX_OPEN_JOBS_PER_ORGANIZATION) {
    return err({
      code: "organization_job_budget_exceeded",
      message: `Organization has ${counts.openJobs} open jobs. Wait for jobs to finish before creating more.`,
    });
  }

  if (counts.recentJobs >= MAX_JOBS_CREATED_PER_HOUR) {
    return err({
      code: "organization_job_budget_exceeded",
      message: "Organization job creation rate limit exceeded. Try again later.",
    });
  }

  return ok(undefined);
}

export class OrganizationJobBudgetExceededError extends Error {
  constructor(readonly budgetError: OrganizationOperationBudgetError) {
    super(budgetError.message);
    this.name = "OrganizationJobBudgetExceededError";
  }
}

export async function assertOrganizationCanEnqueueTranslationJobInTransaction(
  tx: DatabaseTransaction,
  organizationId: string,
  options?: {
    /** A task for people (`personTaskWhere`) doesn't count as open, so other open jobs don't hold it back; the rate does. */
    isPersonTask?: boolean;
  },
): Promise<Result<void, OrganizationOperationBudgetError>> {
  await lockOrganizationJobBudget(tx, organizationId);
  const counts = await countOrganizationJobBudgetUsage(tx, organizationId);
  return evaluateOrganizationJobBudgetUsage(counts, { checkOpenJobs: !options?.isPersonTask });
}
