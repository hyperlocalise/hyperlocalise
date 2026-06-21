import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/database";
import type { JobAssigneeRole } from "@/lib/database/types";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type ProjectLocaleAssignmentRow = {
  locale: string;
  role: JobAssigneeRole;
  userId: string;
  workosUserId: string;
  email: string;
  displayName: string;
};

type LocaleAssignmentError =
  | { code: "assignee_not_found" }
  | { code: "invalid_locale" }
  | { code: "duplicate_locale_role" };

export async function listProjectLocaleAssignments(input: {
  organizationId: string;
  projectId: string;
}): Promise<ProjectLocaleAssignmentRow[]> {
  const rows = await db
    .select({
      locale: schema.projectLocaleAssignments.locale,
      role: schema.projectLocaleAssignments.role,
      userId: schema.projectLocaleAssignments.userId,
      workosUserId: schema.users.workosUserId,
      email: schema.users.email,
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
    })
    .from(schema.projectLocaleAssignments)
    .innerJoin(schema.users, eq(schema.projectLocaleAssignments.userId, schema.users.id))
    .where(
      and(
        eq(schema.projectLocaleAssignments.organizationId, input.organizationId),
        eq(schema.projectLocaleAssignments.projectId, input.projectId),
      ),
    )
    .orderBy(schema.projectLocaleAssignments.locale, schema.projectLocaleAssignments.role);

  return rows.map((row) => ({
    locale: row.locale,
    role: row.role,
    userId: row.userId,
    workosUserId: row.workosUserId,
    email: row.email,
    displayName: formatDisplayName(row),
  }));
}

function formatDisplayName(input: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const parts = [input.firstName, input.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : input.email;
}

export async function replaceProjectLocaleAssignments(input: {
  organizationId: string;
  projectId: string;
  assignments: Array<{
    locale: string;
    role: JobAssigneeRole;
    assigneeWorkosUserId: string;
  }>;
}): Promise<Result<ProjectLocaleAssignmentRow[], LocaleAssignmentError>> {
  const seen = new Set<string>();
  for (const assignment of input.assignments) {
    const locale = assignment.locale.trim();
    if (!locale) {
      return err({ code: "invalid_locale" });
    }

    const key = `${locale}:${assignment.role}`;
    if (seen.has(key)) {
      return err({ code: "duplicate_locale_role" });
    }
    seen.add(key);
  }

  const resolvedAssignments: Array<{
    locale: string;
    role: JobAssigneeRole;
    userId: string;
  }> = [];

  for (const assignment of input.assignments) {
    const [member] = await db
      .select({ userId: schema.users.id })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.organizationMemberships.userId, schema.users.id))
      .where(
        and(
          eq(schema.organizationMemberships.organizationId, input.organizationId),
          eq(schema.users.workosUserId, assignment.assigneeWorkosUserId),
        ),
      )
      .limit(1);

    if (!member) {
      return err({ code: "assignee_not_found" });
    }

    resolvedAssignments.push({
      locale: assignment.locale.trim(),
      role: assignment.role,
      userId: member.userId,
    });
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.projectLocaleAssignments)
      .where(
        and(
          eq(schema.projectLocaleAssignments.organizationId, input.organizationId),
          eq(schema.projectLocaleAssignments.projectId, input.projectId),
        ),
      );

    if (resolvedAssignments.length > 0) {
      await tx.insert(schema.projectLocaleAssignments).values(
        resolvedAssignments.map((assignment) => ({
          organizationId: input.organizationId,
          projectId: input.projectId,
          locale: assignment.locale,
          role: assignment.role,
          userId: assignment.userId,
        })),
      );
    }
  });

  return ok(
    await listProjectLocaleAssignments({
      organizationId: input.organizationId,
      projectId: input.projectId,
    }),
  );
}
