import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const translationJobTypeEnum = pgEnum("translation_job_type", ["string", "file"]);
export const translationJobStatusEnum = pgEnum("translation_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);
export const translationJobOutcomeKindEnum = pgEnum("translation_job_outcome_kind", [
  "string_result",
  "file_result",
  "error",
]);

export const translationProjects = pgTable(
  "translation_projects",
  {
    // Stable project identifier used by jobs and future translation assets.
    id: text("id").primaryKey(),
    // Human-readable project name shown in app lists and settings.
    name: text("name").notNull(),
    // Optional long-form description for operator context.
    description: text("description").notNull().default(""),
    // Shared project-level translation guidance injected into job execution.
    translationContext: text("translation_context").notNull().default(""),
    // When the project record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When project metadata was last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [index("idx_translation_projects_created_at").on(table.createdAt)],
);

export const translationJobs = pgTable(
  "translation_jobs",
  {
    // Stable job identifier returned to clients and used for status lookups.
    id: text("id").primaryKey(),
    // Parent project that owns the translation request.
    projectId: text("project_id")
      .notNull()
      .references(() => translationProjects.id, { onDelete: "cascade" }),
    // High-level job category; currently string and file jobs are supported.
    type: translationJobTypeEnum("type").notNull(),
    // App-level lifecycle state mirrored into Postgres for UI/API reads.
    status: translationJobStatusEnum("status").notNull(),
    // Canonical job input stored as domain data, not workflow engine state.
    inputPayload: jsonb("input_payload").$type<unknown>().notNull(),
    // Describes the shape of a successful result or terminal error payload.
    outcomeKind: translationJobOutcomeKindEnum("outcome_kind"),
    // Terminal job output persisted for retrieval after execution completes.
    outcomePayload: jsonb("outcome_payload").$type<unknown | null>(),
    // Last human-readable failure message captured for debugging and UI display.
    lastError: text("last_error"),
    // External workflow execution reference for tracing across orchestration systems.
    workflowRunId: text("workflow_run_id"),
    // When the job record was first created.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // When job state last changed.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
    // When the job entered a terminal state, if it has completed.
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_translation_jobs_project_created_at").on(table.projectId, table.createdAt),
    index("idx_translation_jobs_workflow_run_id").on(table.workflowRunId),
  ],
);
