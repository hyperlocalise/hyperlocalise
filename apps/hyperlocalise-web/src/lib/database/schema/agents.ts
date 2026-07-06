import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  agentTaskRunEventTypeEnum,
  agentTaskRunKindEnum,
  agentTaskRunStatusEnum,
  agentTaskRunSurfaceEnum,
  agentRunKindEnum,
  agentRunStatusEnum,
  externalTmsProviderKindEnum,
  inboxStatusEnum,
  interactionSourceEnum,
  messageSenderTypeEnum,
  workspaceAutomationRunStatusEnum,
  workspaceAutomationRunTriggerSourceEnum,
  workspaceAutomationStatusEnum,
} from "./enums";
import { githubInstallationRepositories, githubRepositoryAutomationJobs } from "./github";
import { organizations, users } from "./organizations";
import { jobs } from "./jobs";

/**
 * Stores persisted workspace automation definitions, including the user-authored guidance, trigger settings, repository target, enabled tools, and scheduling state.
 */
export const workspaceAutomations = pgTable(
  "workspace_automations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    status: workspaceAutomationStatusEnum("status").notNull().default("active"),
    name: text("name").notNull(),
    instructions: text("instructions").notNull(),
    triggerConfig: jsonb("trigger_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    githubInstallationRepositoryId: uuid("github_installation_repository_id").references(
      () => githubInstallationRepositories.id,
      { onDelete: "set null" },
    ),
    repositoryTarget: jsonb("repository_target")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    toolConfig: jsonb("tool_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    configVersion: integer("config_version").notNull().default(1),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_workspace_automations_org_status").on(table.organizationId, table.status),
    index("idx_workspace_automations_org_next_run").on(table.organizationId, table.nextRunAt),
    index("idx_workspace_automations_github_repo").on(table.githubInstallationRepositoryId),
  ],
);

/**
 * Stores concrete workspace automation run history, including trigger context, input/output snapshots, errors, and optional linkage to deterministic GitHub repository automation jobs.
 */
export const workspaceAutomationRuns = pgTable(
  "workspace_automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => workspaceAutomations.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    triggerSource: workspaceAutomationRunTriggerSourceEnum("trigger_source").notNull(),
    status: workspaceAutomationRunStatusEnum("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key"),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputSummary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    githubRepositoryAutomationJobId: uuid("github_repository_automation_job_id").references(
      () => githubRepositoryAutomationJobs.id,
      { onDelete: "set null" },
    ),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_workspace_automation_runs_automation_created").on(
      table.automationId,
      table.createdAt,
    ),
    index("idx_workspace_automation_runs_org_status").on(table.organizationId, table.status),
    uniqueIndex("idx_workspace_automation_runs_idempotency_key")
      .on(table.organizationId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
    uniqueIndex("idx_workspace_automation_runs_github_job")
      .on(table.githubRepositoryAutomationJobId)
      .where(sql`${table.githubRepositoryAutomationJobId} IS NOT NULL`),
  ],
);

/**
 * Stores provider-facing agent executions, including target provider job or task, run kind, actor, input snapshot, output summary, changed items, warnings, status, and linked job.
 */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerKind: externalTmsProviderKindEnum("provider_kind").notNull(),
    externalJobId: text("external_job_id").notNull(),
    externalTaskId: text("external_task_id"),
    kind: agentRunKindEnum("kind").notNull(),
    status: agentRunStatusEnum("status").notNull().default("queued"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputSummary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    changedItems: jsonb("changed_items")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    warnings: jsonb("warnings")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    hyperlocaliseJobId: text("hyperlocalise_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_agent_runs_org_created").on(table.organizationId, table.createdAt),
    index("idx_agent_runs_org_provider_job").on(
      table.organizationId,
      table.providerKind,
      table.externalJobId,
    ),
    index("idx_agent_runs_org_provider_task").on(
      table.organizationId,
      table.providerKind,
      table.externalTaskId,
    ),
    index("idx_agent_runs_org_status").on(table.organizationId, table.status),
    index("idx_agent_runs_hyperlocalise_job").on(table.hyperlocaliseJobId),
    index("idx_agent_runs_org_actor").on(table.organizationId, table.actorUserId),
  ],
);

/**
 * Stores generic durable agent task executions across CAT, inbox, automation, provider, GitHub, and Contentful surfaces.
 */
export const agentTaskRuns = pgTable(
  "agent_task_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    surface: agentTaskRunSurfaceEnum("surface").notNull(),
    kind: agentTaskRunKindEnum("kind").notNull(),
    status: agentTaskRunStatusEnum("status").notNull().default("queued"),
    currentStage: text("current_stage"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    contextSnapshot: jsonb("context_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputSummary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    resultRef: jsonb("result_ref")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_agent_task_runs_org_created").on(table.organizationId, table.createdAt),
    index("idx_agent_task_runs_org_status").on(table.organizationId, table.status),
    index("idx_agent_task_runs_org_project").on(
      table.organizationId,
      table.projectId,
      table.createdAt,
    ),
    index("idx_agent_task_runs_org_actor").on(table.organizationId, table.actorUserId),
    uniqueIndex("idx_agent_task_runs_active_idempotency")
      .on(table.organizationId, table.idempotencyKey)
      .where(
        sql`${table.idempotencyKey} IS NOT NULL AND ${table.status} IN ('queued', 'running', 'waiting')`,
      ),
  ],
);

/**
 * Stores append-only progress, tool, warning, error, and result events for generic durable agent task runs.
 */
export const agentTaskRunEvents = pgTable(
  "agent_task_run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentTaskRuns.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    type: agentTaskRunEventTypeEnum("type").notNull(),
    stage: text("stage"),
    message: text("message").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_task_run_events_run_sequence").on(table.runId, table.sequence),
    index("idx_agent_task_run_events_org_run").on(
      table.organizationId,
      table.runId,
      table.sequence,
    ),
  ],
);

/**
 * Stores conversation or task threads created from chat, email, GitHub, or Slack. Interactions group messages, inbox items, files, jobs, and project context.
 */
export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    source: interactionSourceEnum("source").notNull(),
    title: text("title").notNull(),
    sourceThreadId: text("source_thread_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("interactions_id_organization_id_key").on(table.id, table.organizationId),
    uniqueIndex("interactions_org_source_thread_id_key")
      .on(table.organizationId, table.source, table.sourceThreadId)
      .where(sql`${table.sourceThreadId} IS NOT NULL`),
    index("idx_interactions_org_last_message").on(table.organizationId, table.lastMessageAt),
  ],
);

/**
 * Stores the inbox projection for interactions, tracking active or archived status and organization/project scope for operator work queues.
 */
export const inboxItems = pgTable(
  "inbox_items",
  {
    interactionId: uuid("interaction_id")
      .primaryKey()
      .references(() => interactions.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    status: inboxStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_inbox_items_org_status").on(table.organizationId, table.status),
    index("idx_inbox_items_org_updated").on(table.organizationId, table.updatedAt),
  ],
);

/**
 * Stores individual messages inside an interaction thread, including sender type, optional sender email, text content, attachments, and creation time.
 */
export const interactionMessages = pgTable(
  "interaction_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interactionId: uuid("interaction_id")
      .notNull()
      .references(() => interactions.id, { onDelete: "cascade" }),
    senderType: messageSenderTypeEnum("sender_type").notNull(),
    senderEmail: text("sender_email"),
    text: text("text").notNull(),
    attachments:
      jsonb("attachments").$type<
        Array<{ id: string; filename: string; contentType: string; url: string }>
      >(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_interaction_messages_interaction_created").on(table.interactionId, table.createdAt),
  ],
);
