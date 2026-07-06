import { z } from "zod";

import * as schema from "@/lib/database/schema";
import { providerQaFindingSchema } from "@/api/routes/project/job-qa.schema";
import {
  jobProviderActionDefinitions,
  type JobProviderActionId,
} from "@/lib/providers/jobs/job-provider-actions";

export const supportedJobProviderActionIds = jobProviderActionDefinitions.map(
  (action) => action.id,
) as [JobProviderActionId, ...JobProviderActionId[]];

export const jobProviderActionIdSchema = z.enum(supportedJobProviderActionIds);

export const createJobAgentRunBodySchema = z.object({
  action: jobProviderActionIdSchema,
  selectedFindings: z.array(providerQaFindingSchema).max(500).optional(),
});

export const agentRunProposalReviewStateSchema = z.enum(["pending", "accepted", "rejected"]);

export const agentRunProposalWarningKindSchema = z.enum([
  "glossary",
  "placeholder",
  "format",
  "confidence",
]);

export const agentRunProposalWarningsSchema = z.object({
  glossary: z.boolean().optional(),
  placeholder: z.boolean().optional(),
  format: z.boolean().optional(),
  confidence: z.boolean().optional(),
});

export const translationMemoryMatchSourceSchema = z.enum(["synced_database", "live_provider"]);

export const agentRunTranslationMemoryMatchUsageSchema = z.object({
  memoryId: z.string(),
  memoryName: z.string(),
  sourceText: z.string(),
  targetText: z.string(),
  targetLocale: z.string(),
  matchScore: z.number().nullable(),
  matchSource: translationMemoryMatchSourceSchema,
  providerKind: z.enum(schema.externalTmsProviderKindEnum.enumValues).nullable(),
  resourceId: z.string(),
  externalResourceId: z.string().nullable(),
});

export const agentRunTranslationMemoryUsageEntrySchema = z.object({
  externalStringId: z.string(),
  key: z.string(),
  matches: z.array(agentRunTranslationMemoryMatchUsageSchema),
});

export const glossaryMatchSourceSchema = z.enum(["synced_database", "live_provider"]);

export const agentRunGlossaryMatchUsageSchema = z.object({
  glossaryId: z.string(),
  glossaryName: z.string(),
  sourceTerm: z.string(),
  targetTerm: z.string(),
  targetLocale: z.string(),
  forbidden: z.boolean(),
  preferred: z.boolean(),
  matchSource: glossaryMatchSourceSchema,
  providerKind: z.enum(schema.externalTmsProviderKindEnum.enumValues).nullable(),
  resourceId: z.string(),
  externalResourceId: z.string().nullable(),
});

export const agentRunGlossaryUsageEntrySchema = z.object({
  externalStringId: z.string(),
  key: z.string(),
  matches: z.array(agentRunGlossaryMatchUsageSchema),
});

export const agentRunProposalItemSchema = z.object({
  itemId: z.string(),
  externalStringId: z.string(),
  key: z.string(),
  locale: z.string(),
  sourceText: z.string(),
  from: z.string(),
  to: z.string(),
  reviewState: agentRunProposalReviewStateSchema,
  changedFields: z.array(z.string()),
  warnings: agentRunProposalWarningsSchema,
  translationMemoryMatchesUsed: z.array(agentRunTranslationMemoryMatchUsageSchema).optional(),
  glossaryMatchesUsed: z.array(agentRunGlossaryMatchUsageSchema).optional(),
});

export const workspaceAgentRunParamsSchema = z.object({
  jobId: z.string().trim().min(1).max(128),
  agentRunId: z.string().uuid(),
});

export const updateAgentRunProposalReviewBodySchema = z
  .object({
    updates: z
      .array(
        z.object({
          itemId: z.string().trim().min(1).max(256),
          reviewState: z.enum(["accepted", "rejected"]),
        }),
      )
      .max(500)
      .optional(),
    bulk: z
      .object({
        reviewState: z.enum(["accepted", "rejected"]),
        itemIds: z.array(z.string().trim().min(1).max(256)).max(500).optional(),
        scope: z.enum(["pending", "all", "filtered"]).optional(),
        itemIdsFilter: z.array(z.string().trim().min(1).max(256)).max(500).optional(),
      })
      .optional(),
  })
  .refine((body) => (body.updates?.length ?? 0) > 0 || body.bulk, {
    message: "Provide updates or bulk review instructions",
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
  changedItems: z.array(agentRunProposalItemSchema.or(z.record(z.string(), z.unknown()))),
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
