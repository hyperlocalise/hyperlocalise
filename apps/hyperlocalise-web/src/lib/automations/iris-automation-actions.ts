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
import { sessionActivityActor } from "@/lib/activity-log/file-segment-events";
import { enqueueVisualWorkflowPublishedActivity } from "@/lib/activity-log/visual-workflow-events";
import { dispatchManualWorkspaceAutomationRun } from "@/lib/agents/workspace-automation-dispatcher";
import {
  getWorkspaceAutomationById,
  getWorkspaceAutomationRunById,
} from "@/lib/agents/workspace-automations";
import { isErr } from "@/lib/primitives/result/results";
import { stampEmailNodePipesUsersOnDefinition } from "@/lib/visual-workflows/stamp-email-node-pipes-users";
import { validateVisualWorkflowV3Definition } from "@/lib/visual-workflows/validation/validate-workflow-v3";
import {
  createVisualWorkflowRun,
  dispatchManualVisualWorkflowRun,
  enqueueVisualWorkflowRunOnce,
  getVisualWorkflowRunById,
} from "@/lib/visual-workflows/visual-workflow-runs";
import type { VisualWorkflowValidationError } from "@/lib/visual-workflows/visual-workflow-types";
import {
  getVisualWorkflowById,
  publishVisualWorkflow,
} from "@/lib/visual-workflows/visual-workflows";
import { createVisualWorkflowExecutionQueue } from "@/workflows/adapters";

import {
  createVisualWorkflowRunBodySchema,
  workflowPublishSchema,
  workflowTestSchema,
} from "@/api/routes/visual-workflow/visual-workflow.schema";
import { createWorkspaceAutomationRunBodySchema } from "@/api/routes/workspace-automation/workspace-automation.schema";

type ActionResult = { status: number; body: Record<string, unknown> };

function fail(status: number, code: string, message: string, details?: unknown): ActionResult {
  return {
    status,
    body: details === undefined ? { error: code, message } : { error: code, message, details },
  };
}

function ok(body: Record<string, unknown>, status = 200): ActionResult {
  return { status, body: { result: body } };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function visualWorkflowError(
  error: VisualWorkflowValidationError | { code: "visual_workflow_not_found" },
): ActionResult {
  if (error.code === "visual_workflow_not_found") {
    return fail(404, error.code, "Visual workflow not found");
  }
  if (error.code === "version_conflict") {
    return fail(409, error.code, error.message);
  }
  if (error.code === "invalid_graph") {
    return fail(400, error.code, "Workflow graph is invalid.", { issues: error.issues });
  }
  if (error.code === "invalid_active_trigger") {
    return fail(400, error.code, error.message);
  }
  return fail(400, error.code, error.message);
}

export async function runIrisAutomationAction(
  action: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const organizationId = asString(payload.organizationId);
  const userId = asString(payload.userId);
  if (!organizationId || !userId) {
    return fail(400, "invalid_request_body", "organization and user are required");
  }

  switch (action) {
    case "run_workspace_automation":
      return runWorkspaceAutomation(organizationId, userId, payload);
    case "publish_visual_workflow":
      return publishWorkflow(organizationId, userId, payload);
    case "test_visual_workflow":
      return testWorkflow(organizationId, payload);
    case "run_visual_workflow":
      return runPublishedWorkflow(organizationId, userId, payload);
    default:
      return fail(400, "unknown_automation_action", "Unknown automation action");
  }
}

async function runWorkspaceAutomation(
  organizationId: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const automationId = asString(payload.automationId);
  const parsed = createWorkspaceAutomationRunBodySchema.safeParse({
    idempotencyKey: payload.idempotencyKey,
    ...(payload.inputSnapshot === undefined ? {} : { inputSnapshot: payload.inputSnapshot }),
  });
  if (!automationId || !parsed.success) {
    return fail(400, "invalid_workspace_automation_run", "Invalid automation run payload");
  }

  const automation = await getWorkspaceAutomationById({ automationId, organizationId });
  if (!automation) {
    return fail(404, "workspace_automation_not_found", "Automation not found");
  }
  if (automation.status === "archived") {
    return fail(400, "workspace_automation_archived", "Archived automations cannot be run.");
  }

  const result = await dispatchManualWorkspaceAutomationRun({
    automation,
    idempotencyKey: parsed.data.idempotencyKey,
    inputSnapshot: parsed.data.inputSnapshot,
    actorKind: "user",
    actorUserId: userId,
  });
  if (!result) {
    return fail(
      400,
      "manual_run_not_supported",
      "Manual runs require at least one enabled workflow or notification tool.",
    );
  }

  const automationRun = await getWorkspaceAutomationRunById({
    runId: result.runId,
    organizationId,
  });
  if (!automationRun) {
    return fail(500, "workspace_automation_run_not_found", "Automation run was not created");
  }
  return ok({ automationRun, dispatch: result }, 202);
}

async function publishWorkflow(
  organizationId: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const visualWorkflowId = asString(payload.visualWorkflowId);
  const parsed = workflowPublishSchema.safeParse({
    expectedRevision: payload.expectedRevision,
  });
  if (!visualWorkflowId || !parsed.success) {
    return fail(400, "invalid_publish_payload", "Invalid publish payload");
  }

  const result = await publishVisualWorkflow({
    organizationId,
    visualWorkflowId,
    expectedRevision: parsed.data.expectedRevision,
  });
  if (isErr(result)) {
    return visualWorkflowError(result.error);
  }

  await enqueueVisualWorkflowPublishedActivity({
    ...sessionActivityActor(userId),
    name: result.value.name,
    organizationId,
    publishedVersion: result.value.publishedVersion ?? result.value.definitionVersion,
    visualWorkflowId: result.value.id,
  });
  return ok({ visualWorkflow: result.value });
}

async function testWorkflow(
  organizationId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const visualWorkflowId = asString(payload.visualWorkflowId);
  const parsed = workflowTestSchema.safeParse({
    idempotencyKey: payload.idempotencyKey,
    definition: payload.definition,
    mode: payload.mode,
    inputSnapshot: payload.inputSnapshot,
    mockOutputs: payload.mockOutputs,
    realNodeIds: payload.realNodeIds,
    mockFailures: payload.mockFailures,
  });
  if (!visualWorkflowId || !parsed.success) {
    return fail(400, "invalid_test_payload", "Invalid test payload");
  }

  const workflow = await getVisualWorkflowById({ organizationId, visualWorkflowId });
  if (!workflow || workflow.status === "archived") {
    return fail(404, "visual_workflow_not_found", "Visual workflow not found");
  }

  const definition = stampEmailNodePipesUsersOnDefinition({
    definition: parsed.data.definition,
    previousDefinition: workflow.definition,
    actorWorkosUserId: asString(payload.workosUserId) || null,
  });
  const issues = validateVisualWorkflowV3Definition(definition);
  if (issues.length) {
    return fail(400, "invalid_graph", "Fix workflow validation issues before testing.", { issues });
  }

  const run = await createVisualWorkflowRun({
    organizationId,
    visualWorkflowId,
    triggerSource: "manual",
    testDefinition: definition,
    mode: parsed.data.mode,
    mockOutputs: parsed.data.mockOutputs,
    realNodeIds: parsed.data.realNodeIds,
    mockFailures: parsed.data.mockFailures,
    inputSnapshot: parsed.data.inputSnapshot,
    idempotencyKey: `test:${parsed.data.idempotencyKey}`,
  });
  const queue = createVisualWorkflowExecutionQueue();
  const dispatch = await enqueueVisualWorkflowRunOnce({
    runId: run.id,
    organizationId,
    enqueue: () =>
      queue
        .enqueue({ visualWorkflowRunId: run.id, visualWorkflowId, organizationId })
        .then(() => undefined),
  });
  return ok({ run, dispatch: { runId: run.id, enqueued: dispatch.enqueuedNow } }, 202);
}

async function runPublishedWorkflow(
  organizationId: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const visualWorkflowId = asString(payload.visualWorkflowId);
  const parsed = createVisualWorkflowRunBodySchema.safeParse({
    idempotencyKey: payload.idempotencyKey,
    ...(payload.inputSnapshot === undefined ? {} : { inputSnapshot: payload.inputSnapshot }),
  });
  if (!visualWorkflowId || !parsed.success) {
    return fail(400, "invalid_visual_workflow_run", "Invalid visual workflow run payload");
  }

  const workflow = await getVisualWorkflowById({ organizationId, visualWorkflowId });
  if (!workflow || workflow.status === "archived") {
    return fail(404, "visual_workflow_not_found", "Visual workflow not found");
  }
  if (!workflow.publishedDefinition) {
    return fail(400, "workflow_not_published", "Publish a version before running.");
  }

  const result = await dispatchManualVisualWorkflowRun({
    organizationId,
    visualWorkflowId,
    activityActor: sessionActivityActor(userId),
    idempotencyKey: parsed.data.idempotencyKey,
    inputSnapshot: parsed.data.inputSnapshot,
  });
  if (!result) {
    return fail(404, "visual_workflow_not_found", "Visual workflow not found");
  }

  const run = await getVisualWorkflowRunById({
    organizationId,
    visualWorkflowId,
    runId: result.runId,
    includeNodeRuns: true,
  });
  if (!run) {
    return fail(500, "visual_workflow_run_not_found", "Visual workflow run was not created");
  }
  return ok({ run, dispatch: result }, 202);
}
