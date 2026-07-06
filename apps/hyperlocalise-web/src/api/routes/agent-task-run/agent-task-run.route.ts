import { Hono } from "hono";
import { validator } from "hono/validator";

import { workosAuthMiddleware, type AuthVariables } from "@/api/auth/workos";
import { notFoundResponse, validationErrorResponse } from "@/api/errors";
import {
  getAgentTaskRun,
  listAgentTaskRunEvents,
} from "@/lib/agent-runtime/task-runs/agent-task-runs";
import type { AgentTaskRun, AgentTaskRunEvent } from "@/lib/database/types";

import { agentTaskRunEventsQuerySchema, agentTaskRunParamsSchema } from "./agent-task-run.schema";

function validateAgentTaskRunParams() {
  return validator("param", (value, c) => {
    const parsed = agentTaskRunParamsSchema.safeParse(value);
    if (!parsed.success) {
      return validationErrorResponse(
        c,
        "invalid_agent_task_run_params",
        "Invalid agent task run parameters",
        parsed.error.issues,
      );
    }
    return parsed.data;
  });
}

const validateAgentTaskRunEventsQuery = validator("query", (value, c) => {
  const parsed = agentTaskRunEventsQuerySchema.safeParse(value);
  if (!parsed.success) {
    return validationErrorResponse(
      c,
      "invalid_agent_task_run_events_query",
      "Invalid agent task run events query",
      parsed.error.issues,
    );
  }
  return parsed.data;
});

function serializeDate(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function serializeAgentTaskRun(run: AgentTaskRun) {
  return {
    id: run.id,
    organizationId: run.organizationId,
    projectId: run.projectId,
    surface: run.surface,
    kind: run.kind,
    status: run.status,
    currentStage: run.currentStage,
    actorUserId: run.actorUserId,
    inputSnapshot: run.inputSnapshot,
    contextSnapshot: run.contextSnapshot,
    outputSummary: run.outputSummary,
    resultRef: run.resultRef,
    error: run.error ?? null,
    idempotencyKey: run.idempotencyKey,
    startedAt: serializeDate(run.startedAt),
    completedAt: serializeDate(run.completedAt),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

function serializeAgentTaskRunEvent(event: AgentTaskRunEvent) {
  return {
    id: event.id,
    runId: event.runId,
    organizationId: event.organizationId,
    sequence: event.sequence,
    type: event.type,
    stage: event.stage,
    message: event.message,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}

export function createAgentTaskRunRoutes() {
  return new Hono<{ Variables: AuthVariables }>()
    .use("*", workosAuthMiddleware)
    .get("/:runId", validateAgentTaskRunParams(), async (c) => {
      const params = c.req.valid("param");
      const organizationId = c.var.auth.organization.localOrganizationId;
      const run = await getAgentTaskRun({
        organizationId,
        runId: params.runId,
      });

      if (!run) {
        return notFoundResponse(c, "agent_task_run_not_found", "Agent task run not found");
      }

      return c.json({ run: serializeAgentTaskRun(run) }, 200);
    })
    .get(
      "/:runId/events",
      validateAgentTaskRunParams(),
      validateAgentTaskRunEventsQuery,
      async (c) => {
        const params = c.req.valid("param");
        const query = c.req.valid("query");
        const organizationId = c.var.auth.organization.localOrganizationId;
        const run = await getAgentTaskRun({
          organizationId,
          runId: params.runId,
        });

        if (!run) {
          return notFoundResponse(c, "agent_task_run_not_found", "Agent task run not found");
        }

        const events = await listAgentTaskRunEvents({
          organizationId,
          runId: params.runId,
          afterSequence: query.after,
          limit: query.limit,
        });

        return c.json({ events: events.map(serializeAgentTaskRunEvent) }, 200);
      },
    );
}
