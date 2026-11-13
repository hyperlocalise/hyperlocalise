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
import { validator } from "hono/validator";

import { isProjectMutationAllowed } from "@/api/auth/capability-guards";
import type { AuthVariables } from "@/api/auth/workos";
import { validationErrorResponse } from "@/api/errors";
import {
  badRequestResponse,
  conflictResponse,
  notFoundResponse,
  type JsonContext,
} from "@/api/response.schema";
import {
  getOwnedProjectRecord,
  projectForbiddenResponse,
  projectNotFoundResponse,
} from "@/api/routes/project/project.shared";
import {
  projectBranchService,
  type ProjectBranchErrorCode,
  type ProjectBranchRecord,
} from "@/lib/projects/branches/project-branch-service";

import {
  createProjectBranchBodySchema,
  mergeProjectBranchBodySchema,
  mergeProjectBranchQuerySchema,
  projectBranchNameParamsSchema,
  projectBranchParamsSchema,
  syncProjectBranchBodySchema,
  updateProjectBranchBodySchema,
} from "./project-branches.schema";

const validateParams = validator("param", (value, c) => {
  const parsed = projectBranchParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_params",
      "Invalid project",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateNamedParams = validator("param", (value, c) => {
  const parsed = projectBranchNameParamsSchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_branch_params",
      "Invalid project branch",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createProjectBranchBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_branch_payload",
      "Invalid branch",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateProjectBranchBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_branch_payload",
      "Invalid branch update",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateMergeQuery = validator("query", (value, c) => {
  const parsed = mergeProjectBranchQuerySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_branch_query",
      "Invalid merge preview",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateMergeBody = validator("json", (value, c) => {
  const parsed = mergeProjectBranchBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_branch_payload",
      "Invalid merge",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

const validateSyncBody = validator("json", (value, c) => {
  const parsed = syncProjectBranchBodySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_project_branch_payload",
      "Invalid sync",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function branchErrorResponse(c: JsonContext, code: ProjectBranchErrorCode) {
  switch (code) {
    case "invalid_branch_name":
      return badRequestResponse(c, code, "Enter a valid branch name.");
    case "branch_not_found":
      return notFoundResponse(c, code, "Branch not found.");
    case "branch_name_taken":
      return conflictResponse(c, code, "A branch with this name already exists.");
    case "default_branch_required":
      return badRequestResponse(c, code, "The default branch is required.");
    case "protected_branch":
      return conflictResponse(c, code, "This branch is protected.");
    case "cannot_delete_default":
      return conflictResponse(c, code, "The default branch cannot be deleted.");
    case "cannot_delete_with_children":
      return conflictResponse(c, code, "Delete or merge child branches first.");
    case "cannot_merge_into_self":
      return badRequestResponse(c, code, "Choose a different branch to merge into.");
    case "cannot_merge_merged_branch":
      return conflictResponse(c, code, "This branch is already merged.");
    case "has_child_branches":
      return conflictResponse(c, code, "Merge or delete child branches first.");
  }
}

function branchResponse(branch: ProjectBranchRecord) {
  return { branch };
}

export function createProjectBranchRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .get("/", validateParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }

      await projectBranchService.ensureDefaultBranch({
        organizationId: project.organizationId,
        projectId: project.id,
        createdByUserId: project.createdByUserId,
      });
      const branches = await projectBranchService.list(project.id);
      return c.json({ branches }, 200);
    })
    .post("/", validateParams, validateCreateBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }

      await projectBranchService.ensureDefaultBranch({
        organizationId: project.organizationId,
        projectId: project.id,
        createdByUserId: project.createdByUserId,
      });
      const created = await projectBranchService.create({
        organizationId: project.organizationId,
        projectId: project.id,
        name: body.name,
        title: body.title,
        baseBranchName: body.baseBranchName,
        createdByUserId: c.var.auth.user.localUserId,
        clone: body.clone,
      });
      if (!created.ok) {
        return branchErrorResponse(c, created.error);
      }
      return c.json(branchResponse(created.value), 201);
    })
    .get("/:branchName", validateNamedParams, async (c) => {
      const params = c.req.valid("param");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }
      const branch = await projectBranchService.getByName(project.id, params.branchName);
      if (!branch.ok) {
        return branchErrorResponse(c, branch.error);
      }
      return c.json(branchResponse(branch.value), 200);
    })
    .patch("/:branchName", validateNamedParams, validateUpdateBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }
      const updated = await projectBranchService.update({
        projectId: project.id,
        name: params.branchName,
        title: body.title,
        isProtected: body.isProtected,
      });
      if (!updated.ok) {
        return branchErrorResponse(c, updated.error);
      }
      return c.json(branchResponse(updated.value), 200);
    })
    .delete("/:branchName", validateNamedParams, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const params = c.req.valid("param");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }
      const removed = await projectBranchService.remove({
        projectId: project.id,
        name: params.branchName,
      });
      if (!removed.ok) {
        return branchErrorResponse(c, removed.error);
      }
      return c.body(null, 204);
    })
    .get("/:branchName/merge", validateNamedParams, validateMergeQuery, async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }
      const preview = await projectBranchService.previewMerge({
        projectId: project.id,
        sourceName: params.branchName,
        targetName: query.targetName,
      });
      if (!preview.ok) {
        return branchErrorResponse(c, preview.error);
      }
      return c.json(preview.value, 200);
    })
    .post("/:branchName/merge", validateNamedParams, validateMergeBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }
      const merged = await projectBranchService.merge({
        projectId: project.id,
        sourceName: params.branchName,
        targetName: body.targetName,
        strategy: body.strategy,
        deleteAfter: body.deleteAfter,
      });
      if (!merged.ok) {
        return branchErrorResponse(c, merged.error);
      }
      return c.json(branchResponse(merged.value), 200);
    })
    .post("/:branchName/sync", validateNamedParams, validateSyncBody, async (c) => {
      if (!isProjectMutationAllowed(c.var.auth.membership.role)) {
        return projectForbiddenResponse(c);
      }
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      const project = await getOwnedProjectRecord(c.var.auth, params.projectId);
      if (!project) {
        return projectNotFoundResponse(c);
      }
      if (project.source !== "native") {
        return badRequestResponse(
          c,
          "native_project_required",
          "Version branches are available on native projects.",
        );
      }
      const synced = await projectBranchService.sync({
        projectId: project.id,
        name: params.branchName,
        strategy: body.strategy,
      });
      if (!synced.ok) {
        return branchErrorResponse(c, synced.error);
      }
      return c.json(branchResponse(synced.value), 200);
    });
}
