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

import { projectIdParamsSchema } from "./project.schema";

export const issueSheetCommentParamsSchema = projectIdParamsSchema.extend({
  issueId: z.uuid(),
});

export const issueSheetCommentIdParamsSchema = issueSheetCommentParamsSchema.extend({
  commentId: z.uuid(),
});

export const issueSheetCommentSortSchema = z.enum(["thread", "created_at"]);

export const issueSheetCommentListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  cursor: z.string().trim().min(1).max(512).optional(),
  sort: issueSheetCommentSortSchema.default("thread"),
  parentId: z.uuid().optional(),
});

export const issueSheetCommentCreateBodySchema = z.object({
  body: z.string().trim().min(1).max(32_000),
  parentId: z.uuid().optional(),
  mentionedUserIds: z.array(z.uuid()).max(50).optional(),
  mentionedIssueIds: z.array(z.uuid()).max(50).optional(),
});

export const issueSheetCommentUpdateBodySchema = z.object({
  body: z.string().trim().min(1).max(32_000),
  mentionedUserIds: z.array(z.uuid()).max(50).optional(),
  mentionedIssueIds: z.array(z.uuid()).max(50).optional(),
});

export type IssueSheetCommentListQuery = z.infer<typeof issueSheetCommentListQuerySchema>;
export type IssueSheetCommentCreateBody = z.infer<typeof issueSheetCommentCreateBodySchema>;
export type IssueSheetCommentUpdateBody = z.infer<typeof issueSheetCommentUpdateBodySchema>;
