import { z } from "zod";

import { schema } from "@/lib/database";

export const agentTaskRunParamsSchema = z.object({
  runId: z.string().uuid(),
});

export const agentTaskRunEventsQuerySchema = z.object({
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
});

export const agentTaskRunRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  projectId: z.string().nullable(),
  surface: z.enum(schema.agentTaskRunSurfaceEnum.enumValues),
  kind: z.enum(schema.agentTaskRunKindEnum.enumValues),
  status: z.enum(schema.agentTaskRunStatusEnum.enumValues),
  currentStage: z.string().nullable(),
  actorUserId: z.string().nullable(),
  inputSnapshot: z.record(z.string(), z.unknown()),
  contextSnapshot: z.record(z.string(), z.unknown()),
  outputSummary: z.record(z.string(), z.unknown()),
  resultRef: z.record(z.string(), z.unknown()),
  error: z.record(z.string(), z.unknown()).nullable(),
  idempotencyKey: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const agentTaskRunEventRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  organizationId: z.string(),
  sequence: z.number(),
  type: z.enum(schema.agentTaskRunEventTypeEnum.enumValues),
  stage: z.string().nullable(),
  message: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const agentTaskRunResponseSchema = z.object({
  run: agentTaskRunRecordSchema,
});

export const agentTaskRunEventsResponseSchema = z.object({
  events: z.array(agentTaskRunEventRecordSchema),
});
