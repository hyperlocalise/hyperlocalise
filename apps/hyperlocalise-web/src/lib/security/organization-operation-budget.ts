import { and, eq, gte, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import { err, ok, type Result } from "@/lib/primitives/result/results";

const OPEN_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;
const MAX_OPEN_JOBS_PER_ORGANIZATION = 50;
const MAX_JOBS_CREATED_PER_HOUR = 120;

export type OrganizationOperationBudgetError = {
  code: "organization_job_budget_exceeded";
  message: string;
};

export async function assertOrganizationCanEnqueueTranslationJob(
  organizationId: string,
): Promise<Result<void, OrganizationOperationBudgetError>> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [openJobsRow, recentJobsRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.organizationId, organizationId),
          inArray(schema.jobs.status, [...OPEN_JOB_STATUSES]),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.jobs)
      .where(
        and(eq(schema.jobs.organizationId, organizationId), gte(schema.jobs.createdAt, oneHourAgo)),
      ),
  ]);

  const openJobs = openJobsRow[0]?.count ?? 0;
  if (openJobs >= MAX_OPEN_JOBS_PER_ORGANIZATION) {
    return err({
      code: "organization_job_budget_exceeded",
      message: `Organization has ${openJobs} open jobs. Wait for jobs to finish before creating more.`,
    });
  }

  const recentJobs = recentJobsRow[0]?.count ?? 0;
  if (recentJobs >= MAX_JOBS_CREATED_PER_HOUR) {
    return err({
      code: "organization_job_budget_exceeded",
      message: "Organization job creation rate limit exceeded. Try again later.",
    });
  }

  return ok(undefined);
}
