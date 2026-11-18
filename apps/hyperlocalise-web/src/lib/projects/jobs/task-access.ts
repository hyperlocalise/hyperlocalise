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
import { and, eq, isNotNull, isNull, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { canAccessProject } from "@/api/auth/team-access";
import { isVendorRole } from "@/api/auth/vendor-access";
import type { ApiAuthContext } from "@/api/auth/workos";
import { db, schema, type DatabaseClient } from "@/lib/database/client";

import { POST_EDIT_WORKFLOW_TASK_STEP } from "./person-task";

/**
 * Access through a task: the owner of a post-edit or proofread task on a file reaches that task
 * whatever team its project is in. It is the only access a vendor has (`vendor-access.ts`), and
 * it also lets any other member open a task they were given outside their teams.
 *
 * An open task gives its page, the editor for its file and languages, and Mark done. A task
 * still waiting for an earlier job gives its page only. A finished task, or one given to
 * someone else, gives nothing.
 *
 * The Go service keeps the same rule in apps/go-svc/vendor-access.go. Keep them in step.
 */
export function ownedFileTaskWhere(input: {
  organizationId: string;
  userId: string;
  /** Also match a task that has not opened yet. */
  includeWaiting?: boolean;
}): SQL {
  const open = eq(schema.jobs.status, "waiting_for_review");
  return and(
    eq(schema.jobs.organizationId, input.organizationId),
    eq(schema.jobs.ownerUserId, input.userId),
    // Post-edit and proofread tasks are both stored as proofread jobs.
    eq(schema.jobs.kind, "proofread"),
    or(isNull(schema.jobs.assigneeType), ne(schema.jobs.assigneeType, "agent")),
    sql`coalesce(${schema.jobs.inputPayload}->>'sourceFileId', '') <> ''`,
    notExists(
      db
        .select({ jobId: schema.externalJobDetails.jobId })
        .from(schema.externalJobDetails)
        .where(eq(schema.externalJobDetails.jobId, schema.jobs.id)),
    ),
    input.includeWaiting
      ? or(open, and(eq(schema.jobs.status, "queued"), isNotNull(schema.jobs.afterJobId)))
      : open,
  )!;
}

export type OwnedFileTask = {
  jobId: string;
  projectId: string;
  status: string;
  sourceFileId: string;
  targetLocales: string[];
  /** A proofread task may approve and reject; a post-edit task may only edit. */
  step: "edit" | "proofread";
};

function readTargetLocales(inputPayload: unknown): string[] {
  if (!inputPayload || typeof inputPayload !== "object" || Array.isArray(inputPayload)) {
    return [];
  }
  const locales = (inputPayload as Record<string, unknown>).targetLocales;
  return Array.isArray(locales)
    ? locales.filter((locale): locale is string => typeof locale === "string")
    : [];
}

function readTaskStep(inputPayload: unknown): OwnedFileTask["step"] {
  const metadata =
    inputPayload && typeof inputPayload === "object" && !Array.isArray(inputPayload)
      ? (inputPayload as Record<string, unknown>).metadata
      : null;
  const step =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).workflowTaskStep
      : null;
  return step === POST_EDIT_WORKFLOW_TASK_STEP ? "edit" : "proofread";
}

/** The person's own task with this id, or null when it is not theirs, finished or not a task. */
export async function findOwnedFileTask(input: {
  organizationId: string;
  userId: string;
  jobId: string;
  includeWaiting?: boolean;
  database?: DatabaseClient;
}): Promise<OwnedFileTask | null> {
  const [job] = await (input.database ?? db)
    .select({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      status: schema.jobs.status,
      inputPayload: schema.jobs.inputPayload,
    })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, input.jobId), ownedFileTaskWhere(input)))
    .limit(1);
  if (!job?.projectId) {
    return null;
  }
  const sourceFileId = (job.inputPayload as Record<string, unknown> | null)?.sourceFileId;
  if (typeof sourceFileId !== "string" || sourceFileId.length === 0) {
    return null;
  }
  return {
    jobId: job.id,
    projectId: job.projectId,
    status: job.status,
    sourceFileId,
    targetLocales: readTargetLocales(job.inputPayload),
    step: readTaskStep(job.inputPayload),
  };
}

/** One file a person reaches through open tasks they own, with the languages those tasks cover. */
export type OwnedTaskFile = {
  sourceFileId: string;
  sourcePath: string;
  targetLocales: string[];
};

/**
 * How a person may use a project on a route opened to task owners: through its team, as before,
 * or only through open tasks they own there, which limits them to those tasks' files and
 * languages. Null when neither holds. A vendor is never given the team rule.
 */
export type TaskRouteProjectAccess = { kind: "team" } | { kind: "task"; files: OwnedTaskFile[] };

export async function resolveTaskRouteProjectAccess(
  auth: ApiAuthContext,
  projectId: string,
): Promise<TaskRouteProjectAccess | null> {
  if (!isVendorRole(auth.membership.role) && (await canAccessProject(auth, projectId))) {
    return { kind: "team" };
  }

  // The task names one upload of its file; every upload of that same file counts, since the
  // editor always works on the file's latest one.
  const taskVersion = alias(schema.repositorySourceFileVersions, "task_version");
  const rows = await db
    .select({
      inputPayload: schema.jobs.inputPayload,
      storedFileId: schema.repositorySourceFileVersions.storedFileId,
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
    })
    .from(schema.jobs)
    .innerJoin(
      taskVersion,
      and(
        sql`${taskVersion.storedFileId} = ${schema.jobs.inputPayload}->>'sourceFileId'`,
        eq(taskVersion.organizationId, schema.jobs.organizationId),
        eq(taskVersion.projectId, schema.jobs.projectId),
      ),
    )
    .innerJoin(
      schema.repositorySourceFileVersions,
      eq(
        schema.repositorySourceFileVersions.repositorySourceFileId,
        taskVersion.repositorySourceFileId,
      ),
    )
    .where(
      and(
        eq(schema.jobs.projectId, projectId),
        ownedFileTaskWhere({
          organizationId: auth.organization.localOrganizationId,
          userId: auth.user.localUserId,
        }),
      ),
    );

  const files = rows.flatMap((row) =>
    row.storedFileId
      ? [
          {
            sourceFileId: row.storedFileId,
            sourcePath: row.sourcePath,
            targetLocales: readTargetLocales(row.inputPayload),
          },
        ]
      : [],
  );
  return files.length > 0 ? { kind: "task", files } : null;
}

/** Whether the access covers the file (by path or stored file id) and, when given, the language. */
export function taskRouteAccessCovers(
  access: TaskRouteProjectAccess,
  target: { sourcePath?: string; sourceFileId?: string; locale?: string },
): boolean {
  if (access.kind === "team") {
    return true;
  }
  return access.files.some(
    (file) =>
      (target.sourcePath === undefined || file.sourcePath === target.sourcePath) &&
      (target.sourceFileId === undefined || file.sourceFileId === target.sourceFileId) &&
      (target.locale === undefined || file.targetLocales.includes(target.locale)),
  );
}
