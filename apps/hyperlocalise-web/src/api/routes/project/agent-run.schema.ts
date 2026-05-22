import { z } from "zod";

import * as schema from "@/lib/database/schema";
import { jobProviderActionDefinitions } from "@/lib/providers/job-provider-actions";

export const jobProviderActionIdSchema = z.enum([
  "translate_with_agent",
  "review_with_agent",
  "fix_qa_issues",
  "leave_provider_comment",
  "push_approved_changes",
]);

export const createJobAgentRunBodySchema = z.object({
  action: jobProviderActionIdSchema,
});

export const agentRunRecordSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  providerKind: z.enum(schema.externalTmsProviderKindEnum.enumValues),
  externalJobId: z.string(),
  externalTaskId: z.string().nullable(),
  kind: z.enum(schema.agentRunKindEnum.enumValues),
  status: z.enum(schema.agentRunStatusEnum.enumValues),
  actorUserId: z.string().uuid().nullable(),
  inputSnapshot: z.record(z.string(), z.unknown()),
  outputSummary: z.record(z.string(), z.unknown()),
  changedItems: z.array(z.record(z.string(), z.unknown())),
  warnings: z.array(z.string()),
  hyperlocaliseJobId: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const providerSourceFileRecordSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  sourcePath: z.string().nullable(),
  resourceType: z.enum(schema.externalTmsResourceTypeEnum.enumValues).nullable(),
  externalUrl: z.string().nullable(),
});

export const jobProviderActionAvailabilitySchema = z.object({
  id: jobProviderActionIdSchema,
  label: z.string(),
  agentRunKind: z.enum(schema.agentRunKindEnum.enumValues),
  visible: z.boolean(),
  enabled: z.boolean(),
  disabledReason: z.string().optional(),
});

export const workspaceJobDetailRecordSchema = z
  .object({
    providerSourceFiles: z.array(providerSourceFileRecordSchema).optional(),
    providerActions: z.array(jobProviderActionAvailabilitySchema).optional(),
  })
  .passthrough();

export const agentRunResponseSchema = z.object({
  agentRun: agentRunRecordSchema,
});

export const agentRunsResponseSchema = z.object({
  agentRuns: z.array(agentRunRecordSchema),
});

export const jobProviderActionsResponseSchema = z.object({
  actions: z.array(jobProviderActionAvailabilitySchema),
});

export type CreateJobAgentRunBody = z.infer<typeof createJobAgentRunBodySchema>;
export type AgentRunRecord = z.infer<typeof agentRunRecordSchema>;
export type JobProviderActionAvailabilityRecord = z.infer<
  typeof jobProviderActionAvailabilitySchema
>;

export const supportedJobProviderActionIds = jobProviderActionDefinitions.map(
  (action) => action.id,
);
