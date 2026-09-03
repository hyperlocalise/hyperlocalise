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
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { visualWorkflowStatusEnum } from "./enums";
import { organizations, users } from "./organizations";
import { projects } from "./projects";

/**
 * Stores persisted visual workflow graphs for advanced deterministic automations.
 */
export const visualWorkflows = pgTable(
  "visual_workflows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: visualWorkflowStatusEnum("status").notNull().default("draft"),
    name: text("name").notNull(),
    definition: jsonb("definition")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    definitionVersion: integer("definition_version").notNull().default(1),
    triggerFingerprint: text("trigger_fingerprint"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("idx_visual_workflows_org_status").on(table.organizationId, table.status),
    index("idx_visual_workflows_org_project").on(table.organizationId, table.projectId),
    index("idx_visual_workflows_org_next_run_at").on(table.organizationId, table.nextRunAt),
    index("idx_visual_workflows_org_trigger_fingerprint").on(
      table.organizationId,
      table.triggerFingerprint,
    ),
  ],
);
