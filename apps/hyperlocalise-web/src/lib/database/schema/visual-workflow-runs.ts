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
  visualWorkflowNodeRunStatusEnum,
  visualWorkflowRunStatusEnum,
  visualWorkflowRunTriggerSourceEnum,
} from "./enums";
import { organizations } from "./organizations";
import { visualWorkflows } from "./visual-workflows";

/**
 * Stores visual workflow execution runs triggered manually or by future dispatchers.
 */
export const visualWorkflowRuns = pgTable(
  "visual_workflow_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    visualWorkflowId: uuid("visual_workflow_id")
      .notNull()
      .references(() => visualWorkflows.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    triggerSource: visualWorkflowRunTriggerSourceEnum("trigger_source").notNull(),
    status: visualWorkflowRunStatusEnum("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key"),
    definitionVersion: integer("definition_version").notNull().default(1),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputSummary: jsonb("output_summary")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_visual_workflow_runs_workflow_created").on(table.visualWorkflowId, table.createdAt),
    index("idx_visual_workflow_runs_org_status").on(table.organizationId, table.status),
    uniqueIndex("idx_visual_workflow_runs_idempotency_key")
      .on(table.organizationId, table.visualWorkflowId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} IS NOT NULL`),
  ],
);

/**
 * Stores per-node execution records for a visual workflow run.
 */
export const visualWorkflowNodeRuns = pgTable(
  "visual_workflow_node_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => visualWorkflowRuns.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: visualWorkflowNodeRunStatusEnum("status").notNull().default("queued"),
    inputSnapshot: jsonb("input_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    outputSnapshot: jsonb("output_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    error: jsonb("error").$type<Record<string, unknown>>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_visual_workflow_node_runs_run").on(table.runId, table.createdAt),
    uniqueIndex("idx_visual_workflow_node_runs_run_node").on(table.runId, table.nodeId),
  ],
);
