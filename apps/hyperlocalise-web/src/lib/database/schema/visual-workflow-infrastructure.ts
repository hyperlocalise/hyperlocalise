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
import {
  pgTable,
  primaryKey,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { visualWorkflows } from "./visual-workflows";
import { visualWorkflowRuns } from "./visual-workflow-runs";
export const visualWorkflowVersions = pgTable(
  "visual_workflow_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => visualWorkflows.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("visual_workflow_version_unique").on(table.workflowId, table.version)],
);
export const visualWorkflowCredentials = pgTable("visual_workflow_credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  encryptedValue: jsonb("encrypted_value").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const visualWorkflowOutbox = pgTable("visual_workflow_outbox", {
  runId: uuid("run_id")
    .primaryKey()
    .references(() => visualWorkflowRuns.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  workflowId: uuid("workflow_id")
    .notNull()
    .references(() => visualWorkflows.id, { onDelete: "cascade" }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
/**
 * Who a round-robin Pick assignee step chose last, per rule, so the next run picks the person
 * after them even when the rule's people change in between.
 */
export const visualWorkflowAssignmentCursors = pgTable(
  "visual_workflow_assignment_cursors",
  {
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => visualWorkflows.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    // The rule's id, or "fallback" for the people used when no rule matches.
    ruleId: text("rule_id").notNull(),
    // A WorkOS user ID or a Crowdin user ID, by where the step's people come from.
    lastAssigneeId: text("last_assignee_id"),
    // The step run that made the last pick, so a retry of that run gets the same person.
    lastStepKey: text("last_step_key"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.workflowId, table.nodeId, table.ruleId] })],
);
