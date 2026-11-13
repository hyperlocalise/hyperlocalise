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
import { and, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";

import { hasCapability } from "@/api/auth/policy";
import { db, schema, type DatabaseClient } from "@/lib/database/client";
import { listAssignableIssueMembers } from "@/lib/projects/issue-sheet/issue-sheet-assignee";
import {
  ISSUE_NOTIFICATION_QA_ERRORS_INCREASED,
  ISSUE_NOTIFICATION_QA_SCAN_FAILED,
  issueNotificationService,
} from "@/lib/projects/issue-sheet/issue-notification-service";

/** Returns how many more errors a scan found than the previous successful scan, if any. */
export function qaErrorsIncrease(errorCount: number, previousErrorCount: number | null): number {
  return Math.max(0, errorCount - (previousErrorCount ?? 0));
}

async function loadRun(runId: string, database: DatabaseClient) {
  const [run] = await database
    .select({
      id: schema.translationQaRuns.id,
      organizationId: schema.translationQaRuns.organizationId,
      projectId: schema.translationQaRuns.projectId,
      projectName: schema.projects.name,
      createdByUserId: schema.translationQaRuns.createdByUserId,
      createdAt: schema.translationQaRuns.createdAt,
      errorCount: schema.translationQaRuns.errorCount,
      errorCode: schema.translationQaRuns.errorCode,
    })
    .from(schema.translationQaRuns)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.translationQaRuns.projectId))
    .where(eq(schema.translationQaRuns.id, runId))
    .limit(1);
  return run ?? null;
}

type QaRun = NonNullable<Awaited<ReturnType<typeof loadRun>>>;

async function previousSuccessfulErrorCount(
  run: QaRun,
  database: DatabaseClient,
): Promise<number | null> {
  const [previous] = await database
    .select({ errorCount: schema.translationQaRuns.errorCount })
    .from(schema.translationQaRuns)
    .where(
      and(
        eq(schema.translationQaRuns.organizationId, run.organizationId),
        eq(schema.translationQaRuns.projectId, run.projectId),
        eq(schema.translationQaRuns.status, "succeeded"),
        ne(schema.translationQaRuns.id, run.id),
        lt(schema.translationQaRuns.createdAt, run.createdAt),
      ),
    )
    .orderBy(
      sql`${schema.translationQaRuns.completedAt} desc nulls last`,
      desc(schema.translationQaRuns.createdAt),
    )
    .limit(1);
  return previous?.errorCount ?? null;
}

/**
 * QA alerts go to project members who can manage QA settings, plus whoever
 * started the scan if they can still access the project.
 */
async function resolveQaRecipients(run: QaRun, database: DatabaseClient): Promise<string[]> {
  const members = await listAssignableIssueMembers({
    organizationId: run.organizationId,
    projectId: run.projectId,
    database,
  });
  if (members.length === 0) {
    return [];
  }

  const memberships = await database
    .select({
      userId: schema.organizationMemberships.userId,
      role: schema.organizationMemberships.role,
    })
    .from(schema.organizationMemberships)
    .where(
      and(
        eq(schema.organizationMemberships.organizationId, run.organizationId),
        inArray(
          schema.organizationMemberships.userId,
          members.map((member) => member.userId),
        ),
      ),
    );

  const recipients = new Set(
    memberships
      .filter((membership) => hasCapability(membership.role, "projects:write"))
      .map((membership) => membership.userId),
  );
  if (run.createdByUserId && members.some((member) => member.userId === run.createdByUserId)) {
    recipients.add(run.createdByUserId);
  }
  return [...recipients];
}

export async function notifyQaScanSucceeded(
  runId: string,
  database: DatabaseClient = db,
): Promise<void> {
  await issueNotificationService.safeFanOut("qa_errors_increased", async () => {
    const run = await loadRun(runId, database);
    if (!run) {
      return;
    }
    const errorsChange = qaErrorsIncrease(
      run.errorCount,
      await previousSuccessfulErrorCount(run, database),
    );
    if (errorsChange === 0) {
      return;
    }
    await issueNotificationService.notifyQaRun({
      organizationId: run.organizationId,
      projectId: run.projectId,
      qaRunId: run.id,
      type: ISSUE_NOTIFICATION_QA_ERRORS_INCREASED,
      recipientUserIds: await resolveQaRecipients(run, database),
      payload: {
        issueTitle: run.projectName,
        projectId: run.projectId,
        errorCount: run.errorCount,
        errorsChange,
      },
      database,
    });
  });
}

export async function notifyQaScanFailed(
  runId: string,
  database: DatabaseClient = db,
): Promise<void> {
  await issueNotificationService.safeFanOut("qa_scan_failed", async () => {
    const run = await loadRun(runId, database);
    if (!run) {
      return;
    }
    await issueNotificationService.notifyQaRun({
      organizationId: run.organizationId,
      projectId: run.projectId,
      qaRunId: run.id,
      type: ISSUE_NOTIFICATION_QA_SCAN_FAILED,
      recipientUserIds: await resolveQaRecipients(run, database),
      payload: {
        issueTitle: run.projectName,
        projectId: run.projectId,
        errorCode: run.errorCode,
      },
      database,
    });
  });
}
