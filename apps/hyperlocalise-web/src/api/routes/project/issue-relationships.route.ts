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

import { isWriteBackTranslationAllowed } from "@/api/auth/capability-guards";
import { createZodValidator } from "@/api/errors";
import { badRequestResponse, conflictResponse, notFoundResponse } from "@/api/response.schema";
import type { AuthVariables } from "@/api/auth/workos";
import { issueRelationshipService } from "@/lib/projects/issue-sheet/issue-relationship-service";
import type { IssueRelationshipError } from "@/lib/projects/issue-sheet/issue-relationship-service";
import { isErr } from "@/lib/primitives/result/results";

import {
  issueRelationshipCreateBodySchema,
  issueRelationshipIdParamsSchema,
  issueRelationshipParamsSchema,
} from "./issue-relationships.schema";
import { forbiddenResponse } from "@/api/response.schema";
import { getOwnedProject, projectNotFoundResponse } from "./project.shared";

const validateRelationshipParams = createZodValidator(
  "param",
  issueRelationshipParamsSchema,
  "invalid_issue_relationship_params",
);
const validateRelationshipIdParams = createZodValidator(
  "param",
  issueRelationshipIdParamsSchema,
  "invalid_issue_relationship_params",
);
const validateCreateBody = createZodValidator(
  "json",
  issueRelationshipCreateBodySchema,
  "invalid_issue_relationship_payload",
);

function mapRelationshipError(
  c: Parameters<typeof notFoundResponse>[0],
  code: IssueRelationshipError["code"],
) {
  switch (code) {
    case "issue_not_found":
      return notFoundResponse(c, "issue_not_found", "Issue not found");
    case "relationship_target_is_self":
      return badRequestResponse(
        c,
        "relationship_target_is_self",
        "An issue cannot be related to itself",
      );
    case "related_issue_not_found":
      return notFoundResponse(c, "related_issue_not_found", "Issue not found");
    case "relationship_not_found":
      return notFoundResponse(c, "relationship_not_found", "Relationship not found");
    case "issue_already_marked_duplicate":
      return conflictResponse(
        c,
        "issue_already_marked_duplicate",
        "This issue is already marked as a duplicate of another issue",
      );
    case "relationship_already_exists":
      return conflictResponse(c, "relationship_already_exists", "This relationship already exists");
    case "blocking_relationship_cycle":
      return badRequestResponse(
        c,
        "blocking_relationship_cycle",
        "This would create a circular blocking relationship",
      );
    case "duplicate_relationship_cycle":
      return badRequestResponse(
        c,
        "duplicate_relationship_cycle",
        "This would create a circular duplicate chain",
      );
  }
}

export function createIssueRelationshipRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/", validateRelationshipParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const result = await issueRelationshipService.listRelationships({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        issueId: params.issueId,
        auth: c.var.auth,
      });
      if (isErr(result)) {
        return mapRelationshipError(c, result.error.code);
      }
      return c.json({ relationships: result.value }, 200);
    })
    .post("/", validateRelationshipParams, validateCreateBody, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const body = c.req.valid("json");
      const result = await issueRelationshipService.createRelationship({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        issueId: params.issueId,
        actorUserId: c.var.auth.user.localUserId,
        relatedIssueId: body.relatedIssueId,
        kind: body.kind,
        auth: c.var.auth,
      });
      if (isErr(result)) {
        return mapRelationshipError(c, result.error.code);
      }
      return c.json({ relationship: result.value }, 201);
    })
    .delete("/:relationshipId", validateRelationshipIdParams, async (c) => {
      if (!isWriteBackTranslationAllowed(c.var.auth.membership.role)) {
        return forbiddenResponse(c, "forbidden");
      }

      const params = c.req.valid("param");
      const project = await getOwnedProject(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }

      const result = await issueRelationshipService.deleteRelationship({
        organizationId: c.var.auth.organization.localOrganizationId,
        projectId: project.id,
        issueId: params.issueId,
        relationshipId: params.relationshipId,
        actorUserId: c.var.auth.user.localUserId,
      });
      if (isErr(result)) {
        return mapRelationshipError(c, result.error.code);
      }
      return c.body(null, 204);
    });
}
