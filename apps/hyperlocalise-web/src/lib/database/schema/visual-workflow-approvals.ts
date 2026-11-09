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
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { interactions } from "./agents";
import { visualWorkflowApprovalReviewerTypeEnum, visualWorkflowApprovalStatusEnum } from "./enums";
import { organizations, users } from "./organizations";
import { visualWorkflowNodeRuns, visualWorkflowRuns } from "./visual-workflow-runs";

/**
 * Durable state for a Human Approval node.
 *
 * Protected prompt and artifact context remain encrypted. Inbox rows provide
 * the operator-facing source of truth for requests that require attention.
 */
export const visualWorkflowApprovalRequests = pgTable(
  "visual_workflow_approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => visualWorkflowRuns.id, { onDelete: "cascade" }),
    nodeRunId: uuid("node_run_id")
      .notNull()
      .references(() => visualWorkflowNodeRuns.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    reviewerType: visualWorkflowApprovalReviewerTypeEnum("reviewer_type").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    status: visualWorkflowApprovalStatusEnum("status").notNull().default("pending"),

    /**
     * Set after the request owns an Inbox interaction. Nullable only so the
     * request row can win its idempotency race before creating the interaction.
     * Both writes occur inside one transaction.
     */
    interactionId: uuid("interaction_id").references(() => interactions.id, {
      onDelete: "set null",
    }),

    encryptedContext: jsonb("encrypted_context").$type<Record<string, unknown>>().notNull(),

    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    commentReference: text("comment_reference"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("visual_workflow_approval_requests_node_run_key").on(table.nodeRunId),
    uniqueIndex("visual_workflow_approval_requests_interaction_key")
      .on(table.interactionId)
      .where(sql`${table.interactionId} IS NOT NULL`),
    index("idx_visual_workflow_approval_requests_run").on(table.runId),
    index("idx_visual_workflow_approval_requests_org_status").on(
      table.organizationId,
      table.status,
    ),
    index("idx_visual_workflow_approval_requests_reviewer").on(
      table.organizationId,
      table.reviewerType,
      table.reviewerId,
      table.status,
    ),
    index("idx_visual_workflow_approval_requests_expiry").on(table.status, table.expiresAt),
  ],
);
