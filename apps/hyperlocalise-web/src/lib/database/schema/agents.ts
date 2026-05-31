import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  agentRunKindEnum,
  agentRunStatusEnum,
  externalTmsProviderKindEnum,
  inboxStatusEnum,
  interactionSourceEnum,
  messageSenderTypeEnum,
} from "./enums";
import { organizations, users } from "./organizations";
import { projects } from "./projects";
import { jobs } from "./jobs";

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
 * Stores conversation or task threads created from chat, email, GitHub, or Slack. Interactions group messages, inbox items, files, jobs, and project context.
 */
export const interactions = pgTable(
  "interactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
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
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
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
