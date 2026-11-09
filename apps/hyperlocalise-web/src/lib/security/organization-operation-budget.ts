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
import { and, eq, gte, inArray, notExists, sql } from "drizzle-orm";

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
          // Key jobs for people stay open for days and run nothing, so they don't hold back AI
          // jobs; key jobs for AI translation count like any other. All count towards the
          // hourly rate.
          notExists(
            client
              .select({ jobId: schema.translationJobDetails.jobId })
              .from(schema.translationJobDetails)
              .where(
                and(
                  eq(schema.translationJobDetails.jobId, schema.jobs.id),
                  eq(schema.translationJobDetails.type, "keys"),
                  eq(schema.jobs.kind, "proofread"),
                ),
              ),
          ),
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
    /** A key job for people doesn't count as open, so other open jobs don't hold it back; the rate does. */
    isKeyJob?: boolean;
  },
): Promise<Result<void, OrganizationOperationBudgetError>> {
  await lockOrganizationJobBudget(tx, organizationId);
  const counts = await countOrganizationJobBudgetUsage(tx, organizationId);
  return evaluateOrganizationJobBudgetUsage(counts, { checkOpenJobs: !options?.isKeyJob });
}
