import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleJobsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";
import type { JobAssigneeRole } from "@/lib/database/types";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

type JobAssignmentError =
  | { code: "job_not_found" }
  | { code: "assignee_not_found" }
  | { code: "assignee_role_required" }
  | { code: "invalid_assignee_role" };

async function resolveAssigneeUserId(input: {
  organizationId: string;
  assigneeWorkosUserId: string | null;
}): Promise<Result<string | null, JobAssignmentError>> {
  if (!input.assigneeWorkosUserId) {
    return ok(null);
  }

  const [member] = await db
    .select({ userId: schema.users.id })
    .from(schema.organizationMemberships)
    .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, input.organizationId),
        eq(schema.users.workosUserId, input.assigneeWorkosUserId),
      ),
    )
    .limit(1);

  if (!member) {
    return err({ code: "assignee_not_found" });
  }

  return ok(member.userId);
}

export async function updateJobAssignment(input: {
  auth: ApiAuthContext;
  jobId: string;
  assigneeWorkosUserId: string | null;
  assigneeRole: JobAssigneeRole | null;
}): Promise<Result<typeof schema.jobs.$inferSelect, JobAssignmentError>> {
  if (input.assigneeWorkosUserId && !input.assigneeRole) {
    return err({ code: "assignee_role_required" });
  }

  if (!input.assigneeWorkosUserId && input.assigneeRole) {
    return err({ code: "assignee_role_required" });
  }

  const assigneeResult = await resolveAssigneeUserId({
    organizationId: input.auth.organization.localOrganizationId,
    assigneeWorkosUserId: input.assigneeWorkosUserId,
  });
  if (isErr(assigneeResult)) {
    return assigneeResult;
  }

  const ownerUserId = assigneeResult.value;
  const assigneeRole = ownerUserId ? input.assigneeRole : null;

  const [updatedJob] = await db
    .update(schema.jobs)
    .set({
      ownerUserId,
      assigneeRole,
    })
    .where(and(eq(schema.jobs.id, input.jobId), await buildAccessibleJobsWhere(input.auth)))
    .returning();

  if (!updatedJob) {
    return err({ code: "job_not_found" });
  }

  return ok(updatedJob);
}

export async function resolveDefaultJobAssignee(input: {
  organizationId: string;
  projectId: string;
  role: JobAssigneeRole;
  targetLocales: string[];
}): Promise<{ userId: string; locale: string } | null> {
  if (input.targetLocales.length === 0) {
    return null;
  }

  const assignments = await db
    .select({
      locale: schema.projectLocaleAssignments.locale,
      userId: schema.projectLocaleAssignments.userId,
    })
    .from(schema.projectLocaleAssignments)
    .where(
      and(
        eq(schema.projectLocaleAssignments.organizationId, input.organizationId),
        eq(schema.projectLocaleAssignments.projectId, input.projectId),
        eq(schema.projectLocaleAssignments.role, input.role),
      ),
    );

  const assignmentByLocale = new Map(assignments.map((row) => [row.locale, row.userId]));

  for (const locale of input.targetLocales) {
    const userId = assignmentByLocale.get(locale);
    if (userId) {
      return { userId, locale };
    }
  }

  return null;
}
