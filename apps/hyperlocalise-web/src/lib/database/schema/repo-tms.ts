import { sql } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organizations } from "./organizations";
import { projects } from "./projects";

/**
 * Classifies repository-to-TMS mutation actions such as source upload, fix application, commits, pushes, and provider mutation calls.
 */
export const repoTmsMutationLogActionEnum = pgEnum("repo_tms_mutation_log_action", [
  "upload_sources",
  "apply_fixes",
  "commit_changes",
  "push_to_branch",
  "tms_mutate",
]);

/**
 * Tracks review and execution state for repository-to-TMS mutation requests from pending approval through completion or failure.
 */
export const repoTmsMutationLogStatusEnum = pgEnum("repo_tms_mutation_log_status", [
  "pending",
  "approved",
  "denied",
  "completed",
  "failed",
]);

/**
 * Stores audit records for repository-to-TMS mutation workflows, including actor metadata, action, approval/execution status, task/workflow identifiers, provider, and structured details.
 */
export const repoTmsMutationLogs = pgTable(
  "repo_tms_mutation_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    workflowRunId: text("workflow_run_id"),
    taskId: text("task_id").notNull(),
    actor: jsonb("actor")
      .$type<{
        sourceUserId: string;
        userId?: string;
        email?: string;
        displayName?: string;
        role?: string;
      }>()
      .notNull(),
    action: repoTmsMutationLogActionEnum("action").notNull(),
    source: text("source").notNull(),
    provider: text("provider"),
    status: repoTmsMutationLogStatusEnum("status").notNull().default("pending"),
    details: jsonb("details")
      .$type<{
        changedPaths?: string[];
        commands?: string[];
        error?: string;
        reason?: string;
      }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_repo_tms_mutation_logs_org").on(table.organizationId),
    index("idx_repo_tms_mutation_logs_task").on(table.taskId),
    index("idx_repo_tms_mutation_logs_workflow_run").on(table.workflowRunId),
    index("idx_repo_tms_mutation_logs_created_at").on(table.createdAt),
  ],
);
