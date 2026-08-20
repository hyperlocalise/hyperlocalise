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
import { z } from "zod";

import {
  issueSheetIssueStatusSchema,
  issueSheetIssueTypeSchema,
  issueSheetPrioritySchema,
} from "@/api/routes/project/issue-sheet.schema";

export const ISSUE_BULK_ACTION_MAX_ITEMS = 100;

const issueBulkTargetSchema = z.object({
  issueId: z.string().uuid(),
  projectId: z.string().trim().min(1).max(128),
});

const issueBulkActionBaseSchema = z.object({
  issues: z.array(issueBulkTargetSchema).min(1).max(ISSUE_BULK_ACTION_MAX_ITEMS),
});

export const issueBulkAssignBodySchema = issueBulkActionBaseSchema.extend({
  action: z.literal("assign"),
  assigneeUserId: z.string().uuid(),
});

export const issueBulkUnassignBodySchema = issueBulkActionBaseSchema.extend({
  action: z.literal("unassign"),
});

export const issueBulkSetStatusBodySchema = issueBulkActionBaseSchema.extend({
  action: z.literal("set_status"),
  status: issueSheetIssueStatusSchema,
});

export const issueBulkSetPriorityBodySchema = issueBulkActionBaseSchema.extend({
  action: z.literal("set_priority"),
  priority: issueSheetPrioritySchema,
});

export const issueBulkSetIssueTypeBodySchema = issueBulkActionBaseSchema.extend({
  action: z.literal("set_issue_type"),
  issueType: issueSheetIssueTypeSchema,
});

export const issueBulkActionBodySchema = z.discriminatedUnion("action", [
  issueBulkAssignBodySchema,
  issueBulkUnassignBodySchema,
  issueBulkSetStatusBodySchema,
  issueBulkSetPriorityBodySchema,
  issueBulkSetIssueTypeBodySchema,
]);

export type IssueBulkActionBody = z.infer<typeof issueBulkActionBodySchema>;

export const issueBulkResultOutcomeSchema = z.enum(["updated", "unchanged", "failed"]);

export type IssueBulkActionBodyInput = z.input<typeof issueBulkActionBodySchema>;
