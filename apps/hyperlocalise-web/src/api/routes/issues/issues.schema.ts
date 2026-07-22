/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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
  issueSheetSortDirSchema,
  issueSheetSortSchema,
} from "@/api/routes/project/issue-sheet.schema";

export const organizationIssuesQuerySchema = z.object({
  view: z.enum(["my_work", "qa_triage", "source_context", "all_open"]).optional(),
  status: issueSheetIssueStatusSchema.or(z.literal("all")).optional(),
  issueType: issueSheetIssueTypeSchema.or(z.literal("all")).optional(),
  priority: issueSheetPrioritySchema.optional(),
  locale: z.string().trim().min(1).max(32).optional(),
  assignee: z.string().uuid().or(z.literal("me")).or(z.literal("unassigned")).optional(),
  projectId: z.string().trim().min(1).max(128).optional(),
  search: z.string().trim().max(200).optional(),
  sort: issueSheetSortSchema.default("updated_at"),
  sortDir: issueSheetSortDirSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type OrganizationIssuesQuery = z.infer<typeof organizationIssuesQuerySchema>;
