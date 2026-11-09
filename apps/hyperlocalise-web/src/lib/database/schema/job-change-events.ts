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
import { sql } from "drizzle-orm";
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { JobChangeEventType } from "@/lib/job-change-events/job-change-events-contract";

import { jobAssigneeTypeEnum, jobKindEnum, jobStatusEnum } from "./enums";
import { organizations } from "./organizations";

/**
 * Outbox of job changes. Rows are written by `insertJobs` and `updateJobs` in
 * `lib/job-change-events/job-writes.ts`, and by the Go public API's job update, in the same
 * transaction as the change. The dispatcher claims undispatched rows and fans them out to visual
 * workflows and outbound webhooks.
 */
export const jobChangeEvents = pgTable(
  "job_change_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // No foreign key: the event outlives a deleted job until it has been dispatched.
    jobId: text("job_id").notNull(),
    projectId: text("project_id"),
    kind: jobKindEnum("kind").notNull(),
    type: text("type").$type<JobChangeEventType>().notNull(),
    fromStatus: jobStatusEnum("from_status"),
    toStatus: jobStatusEnum("to_status").notNull(),
    assigneeType: jobAssigneeTypeEnum("assignee_type"),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
    // Lease held by the dispatcher working on this row; another tick may take it once it lapses.
    claimedUntil: timestamp("claimed_until", { withTimezone: true }),
    claimAttempts: integer("claim_attempts").notNull().default(0),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    // Set with dispatchedAt when fan-out is given up, so the row stays queryable until prune.
    abandonedAt: timestamp("abandoned_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_job_change_events_pending")
      .on(table.occurredAt)
      .where(sql`${table.dispatchedAt} IS NULL`),
    index("idx_job_change_events_org_occurred_at").on(table.organizationId, table.occurredAt),
    index("idx_job_change_events_job").on(table.jobId, table.occurredAt),
  ],
);
