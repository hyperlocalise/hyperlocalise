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

import { db, schema } from "@/lib/database/client";

/**
 * A post-edit or proofread task on a file, for a person, that is still open: the one rule for
 * "someone has this file's review work". Used for what a task's owner may reach (`task-access.ts`)
 * and for what a workflow should not hand out a second time (the List work to review step, which
 * adds one exception of its own: a task waiting behind a failed job).
 *
 * The Go service keeps the same rule in apps/go-svc/vendor-access.go. Keep them in step.
 */
export function openFileTaskWhere(input: {
  organizationId: string;
  /** Also match a task that has not opened yet, because it comes after an unfinished job. */
  includeWaiting?: boolean;
}): SQL {
  const open = eq(schema.jobs.status, "waiting_for_review");
  return and(
    eq(schema.jobs.organizationId, input.organizationId),
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
