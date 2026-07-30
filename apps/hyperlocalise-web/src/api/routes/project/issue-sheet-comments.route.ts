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
import { Hono } from "hono";

import { createZodValidator } from "@/api/errors";
import type { AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { IssueSheetCommentService } from "@/lib/projects/issue-sheet/issue-sheet-comment-service";

import {
  issueSheetCommentCreateBodySchema,
  issueSheetCommentIdParamsSchema,
  issueSheetCommentParamsSchema,
  issueSheetCommentUpdateBodySchema,
} from "./issue-sheet-comments.schema";
import { getOwnedProject, projectNotFoundResponse } from "./project.shared";

const service = new IssueSheetCommentService();

const validateCommentParams = createZodValidator(
  "param",
  issueSheetCommentParamsSchema,
  "invalid_issue_comment_params",
);
const validateCommentIdParams = createZodValidator(
  "param",
  issueSheetCommentIdParamsSchema,
  "invalid_issue_comment_params",
);
const validateCreateBody = createZodValidator(
  "json",
  issueSheetCommentCreateBodySchema,
  "invalid_issue_comment_payload",
);
const validateUpdateBody = createZodValidator(
  "json",
  issueSheetCommentUpdateBodySchema,
  "invalid_issue_comment_payload",
);

function mapCommentError(
  c: Parameters<typeof notFoundResponse>[0],
  code:
    | "issue_not_found"
    | "comment_not_found"
    | "parent_not_found"
    | "forbidden"
    | "invalid_mentioned_users"
    | "invalid_mentioned_issues",
) {
  switch (code) {
    case "issue_not_found":
      return notFoundResponse(c, "issue_not_found", "Issue not found");
    case "comment_not_found":
      return notFoundResponse(c, "comment_not_found", "Comment not found");
    case "parent_not_found":
      return badRequestResponse(c, "parent_not_found", "Parent comment not found");
    case "forbidden":
      return forbiddenResponse(c, "forbidden", "Not allowed to modify this comment");
    case "invalid_mentioned_users":
      return badRequestResponse(
        c,
        "invalid_mentioned_users",
        "One or more mentioned users are not organization members",
      );
    case "invalid_mentioned_issues":
      return badRequestResponse(
        c,
        "invalid_mentioned_issues",
        "One or more mentioned issues were not found",
      );
  }
}

export function createIssueSheetCommentRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .post("/", validateCommentParams, validateCreateBody, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const result = await service.create({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        issueId: params.issueId,
        actorUserId: c.var.auth.user.localUserId,
        role: c.var.auth.membership.role,
        auth: c.var.auth,
        body: c.req.valid("json"),
      });
      if (!result.ok) {
        return mapCommentError(c, result.error.code);
      }
      return c.json({ issueComment: result.value }, 201);
    })
    .patch("/:commentId", validateCommentIdParams, validateUpdateBody, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const result = await service.update({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        issueId: params.issueId,
        commentId: params.commentId,
        actorUserId: c.var.auth.user.localUserId,
        role: c.var.auth.membership.role,
        auth: c.var.auth,
        body: c.req.valid("json"),
      });
      if (!result.ok) {
        return mapCommentError(c, result.error.code);
      }
      return c.json({ issueComment: result.value }, 200);
    })
    .delete("/:commentId", validateCommentIdParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const result = await service.delete({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        issueId: params.issueId,
        commentId: params.commentId,
        actorUserId: c.var.auth.user.localUserId,
        role: c.var.auth.membership.role,
      });
      if (!result.ok) {
        return mapCommentError(c, result.error.code);
      }
      return c.body(null, 204);
    });
}
