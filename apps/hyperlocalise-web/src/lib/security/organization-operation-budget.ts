import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient, type DatabaseTransaction } from "@/lib/database";
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

function evaluateOrganizationJobBudgetUsage(counts: {
  openJobs: number;
  recentJobs: number;
}): Result<void, OrganizationOperationBudgetError> {
  if (counts.openJobs >= MAX_OPEN_JOBS_PER_ORGANIZATION) {
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

export async function assertOrganizationCanEnqueueTranslationJob(
  organizationId: string,
): Promise<Result<void, OrganizationOperationBudgetError>> {
  const counts = await countOrganizationJobBudgetUsage(db, organizationId);
  return evaluateOrganizationJobBudgetUsage(counts);
}

export async function assertOrganizationCanEnqueueTranslationJobInTransaction(
  tx: DatabaseTransaction,
  organizationId: string,
): Promise<Result<void, OrganizationOperationBudgetError>> {
  await lockOrganizationJobBudget(tx, organizationId);
  const counts = await countOrganizationJobBudgetUsage(tx, organizationId);
  return evaluateOrganizationJobBudgetUsage(counts);
}
