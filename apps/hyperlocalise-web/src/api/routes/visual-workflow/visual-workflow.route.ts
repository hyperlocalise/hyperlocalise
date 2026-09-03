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

import { isWorkspaceOperatorRole } from "@/api/auth/roles";
import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "@/api/response.schema";
import { workspaceVisualWorkflowsFlag } from "@/lib/flags/workspace-flags";
import { isErr } from "@/lib/primitives/result/results";
import {
  createVisualWorkflow,
  getVisualWorkflowById,
  listVisualWorkflows,
  updateVisualWorkflow,
} from "@/lib/visual-workflows/visual-workflows";
import {
  dispatchManualVisualWorkflowRun,
  getVisualWorkflowRunById,
  listVisualWorkflowRuns,
} from "@/lib/visual-workflows/visual-workflow-runs";
import type { VisualWorkflowValidationError } from "@/lib/visual-workflows/visual-workflow-types";

import {
  createVisualWorkflowBodySchema,
  createVisualWorkflowRunBodySchema,
  listVisualWorkflowRunsQuerySchema,
  listVisualWorkflowsQuerySchema,
  updateVisualWorkflowBodySchema,
  visualWorkflowIdParamSchema,
  visualWorkflowRunIdParamSchema,
} from "./visual-workflow.schema";

const validateListQuery = validator("query", (value, c) => {
  const parsed = listVisualWorkflowsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_query_params",
      "Query parameters are invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateVisualWorkflowParams = validator("param", (value, c) => {
  const parsed = visualWorkflowIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_visual_workflow_id");
  }
  return parsed.data;
});

const validateCreateBody = validator("json", (value, c) => {
  const parsed = createVisualWorkflowBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_visual_workflow_payload",
      "Visual workflow payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateUpdateBody = validator("json", (value, c) => {
  const parsed = updateVisualWorkflowBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_visual_workflow_payload",
      "Visual workflow payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateVisualWorkflowRunParams = validator("param", (value, c) => {
  const parsed = visualWorkflowRunIdParamSchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(c, "invalid_visual_workflow_run_id");
  }
  return parsed.data;
});

const validateListRunsQuery = validator("query", (value, c) => {
  const parsed = listVisualWorkflowRunsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_query_params",
      "Query parameters are invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

const validateCreateRunBody = validator("json", (value, c) => {
  const parsed = createVisualWorkflowRunBodySchema.safeParse(value);
  if (!parsed.success) {
    return badRequestResponse(
      c,
      "invalid_visual_workflow_run_payload",
      "Visual workflow run payload is invalid.",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
});

async function isVisualWorkflowsFeatureEnabled(auth: AuthVariables["auth"]) {
  try {
    return (
      (await workspaceVisualWorkflowsFlag.run({
        identify: () => ({
          organization: { id: auth.organization.workosOrganizationId },
          user: { id: auth.user.workosUserId },
        }),
      })) === true
    );
  } catch {
    return false;
  }
}

function mapVisualWorkflowValidationError(
  c: Parameters<typeof badRequestResponse>[0],
  error: VisualWorkflowValidationError,
) {
  if (error.code === "invalid_graph") {
    return badRequestResponse(c, error.code, "Workflow graph is invalid.", {
      issues: error.issues,
    });
  }

  return badRequestResponse(c, error.code, error.message);
}

export function createVisualWorkflowRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .use("*", async (c, next) => {
      if (!isWorkspaceOperatorRole(c.var.auth.membership.role)) {
        return forbiddenResponse(c);
      }
      if (!(await isVisualWorkflowsFeatureEnabled(c.var.auth))) {
        return forbiddenResponse(c, "visual_workflows_feature_disabled");
      }
      return next();
    })
    .get("/", validateListQuery, async (c) => {
      const query = c.req.valid("query");
      const visualWorkflows = await listVisualWorkflows({
        organizationId: c.var.auth.organization.localOrganizationId,
        status: query.status,
        projectId: query.projectId,
        limit: query.limit,
        offset: query.offset,
      });

      return c.json({ visualWorkflows }, 200);
    })
    .post("/", validateCreateBody, async (c) => {
      const body = c.req.valid("json");
      const result = await createVisualWorkflow({
        organizationId: c.var.auth.organization.localOrganizationId,
        authorUserId: c.var.auth.user.localUserId,
        projectId: body.projectId,
        name: body.name,
        definition: body.definition,
        status: body.status,
      });

      if (isErr(result)) {
        if (result.error.code === "project_not_found") {
          return notFoundResponse(c, result.error.code);
        }
        return mapVisualWorkflowValidationError(c, result.error);
      }

      return c.json({ visualWorkflow: result.value }, 201);
    })
    .get("/:visualWorkflowId", validateVisualWorkflowParams, async (c) => {
      const { visualWorkflowId } = c.req.valid("param");
      const visualWorkflow = await getVisualWorkflowById({
        organizationId: c.var.auth.organization.localOrganizationId,
        visualWorkflowId,
      });

      if (!visualWorkflow) {
        return notFoundResponse(c, "visual_workflow_not_found");
      }

      return c.json({ visualWorkflow }, 200);
    })
    .patch("/:visualWorkflowId", validateVisualWorkflowParams, validateUpdateBody, async (c) => {
      const { visualWorkflowId } = c.req.valid("param");
      const body = c.req.valid("json");
      const result = await updateVisualWorkflow({
        organizationId: c.var.auth.organization.localOrganizationId,
        visualWorkflowId,
        name: body.name,
        definition: body.definition,
        status: body.status,
        projectId: body.projectId,
      });

      if (isErr(result)) {
        if (result.error.code === "visual_workflow_not_found") {
          return notFoundResponse(c, result.error.code);
        }
        if (result.error.code === "project_not_found") {
          return notFoundResponse(c, result.error.code);
        }
        return mapVisualWorkflowValidationError(c, result.error);
      }

      return c.json({ visualWorkflow: result.value }, 200);
    })
    .get(
      "/:visualWorkflowId/runs",
      validateVisualWorkflowParams,
      validateListRunsQuery,
      async (c) => {
        const { visualWorkflowId } = c.req.valid("param");
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const workflow = await getVisualWorkflowById({ organizationId, visualWorkflowId });
        if (!workflow) {
          return notFoundResponse(c, "visual_workflow_not_found");
        }

        const runs = await listVisualWorkflowRuns({
          organizationId,
          visualWorkflowId,
          limit: query.limit,
          offset: query.offset,
        });

        return c.json({ runs }, 200);
      },
    )
    .post(
      "/:visualWorkflowId/runs",
      validateVisualWorkflowParams,
      validateCreateRunBody,
      async (c) => {
        const { visualWorkflowId } = c.req.valid("param");
        const body = c.req.valid("json");
        const organizationId = c.var.auth.organization.localOrganizationId;

        const result = await dispatchManualVisualWorkflowRun({
          organizationId,
          visualWorkflowId,
          idempotencyKey: body.idempotencyKey,
          inputSnapshot: body.inputSnapshot,
        });

        if (!result) {
          return notFoundResponse(c, "visual_workflow_not_found");
        }

        const run = await getVisualWorkflowRunById({
          organizationId,
          visualWorkflowId,
          runId: result.runId,
          includeNodeRuns: true,
        });
        if (!run) {
          throw new Error("visual_workflow_run_not_found");
        }

        return c.json({ run, dispatch: result }, 202);
      },
    )
    .get("/:visualWorkflowId/runs/:runId", validateVisualWorkflowRunParams, async (c) => {
      const { visualWorkflowId, runId } = c.req.valid("param");
      const run = await getVisualWorkflowRunById({
        organizationId: c.var.auth.organization.localOrganizationId,
        visualWorkflowId,
        runId,
        includeNodeRuns: true,
      });

      if (!run) {
        return notFoundResponse(c, "visual_workflow_run_not_found");
      }

      return c.json({ run }, 200);
    });
}
