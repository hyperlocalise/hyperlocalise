import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { tool } from "ai";
import { z } from "zod";

import { schema } from "@/lib/database";
import { createTranslationJobQueue } from "@/workflows/adapters";

import type { ToolContext } from "./types";

const jobKinds = ["translation", "research", "review", "sync", "asset_management"] as const;
type JobKind = (typeof jobKinds)[number];

const translationJobQueue = createTranslationJobQueue();

const baseJobSelect = {
  id: schema.jobs.id,
  organizationId: schema.jobs.organizationId,
  projectId: schema.jobs.projectId,
  kind: schema.jobs.kind,
  status: schema.jobs.status,
  inputPayload: schema.jobs.inputPayload,
  outcomePayload: schema.jobs.outcomePayload,
  lastError: schema.jobs.lastError,
  workflowRunId: schema.jobs.workflowRunId,
  interactionId: schema.jobs.interactionId,
  contextSnapshot: schema.jobs.contextSnapshot,
  createdAt: schema.jobs.createdAt,
  updatedAt: schema.jobs.updatedAt,
  completedAt: schema.jobs.completedAt,
};

function createJobId() {
  return `job_${randomUUID()}`;
}

function getJobProjectId(ctx: ToolContext, projectId?: string | null) {
  return projectId ?? ctx.projectId;
}

async function getJobDetails(ctx: ToolContext, jobId: string) {
  const [job] = await ctx.db
    .select({
      ...baseJobSelect,
      translationType: schema.translationJobDetails.type,
      translationOutcomeKind: schema.translationJobDetails.outcomeKind,
      reviewCriteria: schema.reviewJobDetails.criteria,
      reviewTargetLocale: schema.reviewJobDetails.targetLocale,
      reviewConfig: schema.reviewJobDetails.config,
      syncConnectorKind: schema.syncJobDetails.connectorKind,
      syncDirection: schema.syncJobDetails.direction,
      syncExternalIdentifiers: schema.syncJobDetails.externalIdentifiers,
      assetType: schema.assetManagementJobDetails.assetType,
      assetOperation: schema.assetManagementJobDetails.operation,
      assetConfig: schema.assetManagementJobDetails.config,
    })
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
    .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
    .leftJoin(
      schema.assetManagementJobDetails,
      eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
    )
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.organizationId, ctx.organizationId)))
    .limit(1);

  if (!job) {
    return null;
  }

  return {
    id: job.id,
    organizationId: job.organizationId,
    projectId: job.projectId,
    kind: job.kind,
    status: job.status,
    inputPayload: job.inputPayload,
    outcomePayload: job.outcomePayload,
    lastError: job.lastError,
    workflowRunId: job.workflowRunId,
    interactionId: job.interactionId,
    contextSnapshot: job.contextSnapshot,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    details:
      job.kind === "translation"
        ? { type: job.translationType, outcomeKind: job.translationOutcomeKind }
        : job.kind === "review"
          ? {
              criteria: job.reviewCriteria,
              targetLocale: job.reviewTargetLocale,
              config: job.reviewConfig,
            }
          : job.kind === "sync"
            ? {
                connectorKind: job.syncConnectorKind,
                direction: job.syncDirection,
                externalIdentifiers: job.syncExternalIdentifiers,
              }
            : job.kind === "asset_management"
              ? {
                  assetType: job.assetType,
                  operation: job.assetOperation,
                  config: job.assetConfig,
                }
              : null,
  };
}

function queuedJobValues(
  ctx: ToolContext,
  input: {
    kind: JobKind;
    projectId?: string | null;
    inputPayload: unknown;
  },
) {
  return {
    id: createJobId(),
    organizationId: ctx.organizationId,
    projectId: getJobProjectId(ctx, input.projectId),
    kind: input.kind,
    status: "queued" as const,
    inputPayload: input.inputPayload,
    interactionId: ctx.conversationId,
  };
}

async function createQueuedJob(ctx: ToolContext, input: Parameters<typeof queuedJobValues>[1]) {
  const [job] = await ctx.db.insert(schema.jobs).values(queuedJobValues(ctx, input)).returning();

  if (!job) {
    throw new Error("Failed to create job: no row returned.");
  }

  return job;
}

/**
 * Create a translation job and link it to the interaction.
 *
 * PRODUCT.md requirement: "The agent creates one or more jobs when durable work is required."
 *
 * Implementation plan:
 * 1. Accept the same payload shape as `createJobBodySchema` in `job.schema.ts`:
 *    - `type`: "string" | "file"
 *    - For string: `sourceText`, `sourceLocale`, `targetLocales`, optional `context`, `metadata`, `maxLength`
 *    - For file: `sourceFileId`, `fileFormat`, `sourceLocale`, `targetLocales`, `metadata`
 * 2. Generate a job ID using the same pattern as `job.route.ts` (`job_${randomUUID()}`).
 * 3. Insert into `jobs` table with `kind = "translation"`, `status = "queued"`,
 *    `interactionId` set to the current conversation, `projectId` if available.
 * 4. Insert into `translationJobDetails` with the appropriate `type`.
 * 5. Enqueue the job via the `TranslationJobQueue` adapter (see `job.route.ts`).
 * 6. Return the created job ID and status.
 *
 * Example usage: user says "Please translate these release notes into Japanese and Vietnamese."
 */
export function createTranslationJobTool(ctx: ToolContext) {
  return tool({
    description: "Create a durable translation job (string or file) and enqueue it for execution.",
    inputSchema: z.object({
      type: z.enum(["string", "file"]).describe("Translation job type."),
      sourceText: z.string().optional().describe("Source text for string jobs."),
      sourceFileId: z.string().optional().describe("Source file ID for file jobs."),
      fileFormat: z
        .enum(["xliff", "json", "po", "csv"])
        .optional()
        .describe("File format for file jobs."),
      sourceLocale: z.string().describe("BCP-47 source locale tag."),
      targetLocales: z.array(z.string()).min(1).describe("List of BCP-47 target locale tags."),
      context: z.string().optional().describe("Optional job-level translation context."),
      metadata: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional key-value metadata."),
      maxLength: z
        .number()
        .positive()
        .optional()
        .describe("Optional maximum string length for string jobs."),
    }),
    execute: async (input) => {
      if (!ctx.projectId) {
        return {
          success: false,
          error:
            "No project is attached to this conversation. Attach a project before creating a translation job.",
        };
      }

      if (input.type === "file") {
        return {
          success: false,
          error: "File translation jobs are not supported yet.",
        };
      }

      if (!input.sourceText?.trim()) {
        return { success: false, error: "sourceText is required for string translation jobs." };
      }

      const inputPayload = {
        sourceText: input.sourceText,
        sourceLocale: input.sourceLocale,
        targetLocales: input.targetLocales,
        metadata: input.metadata,
        context: input.context,
        maxLength: input.maxLength,
      };

      const job = await ctx.db.transaction(async (tx) => {
        const [createdJob] = await tx
          .insert(schema.jobs)
          .values(
            queuedJobValues(ctx, {
              kind: "translation",
              inputPayload,
            }),
          )
          .returning();

        if (!createdJob) {
          throw new Error("Failed to create job: no row returned.");
        }

        await tx.insert(schema.translationJobDetails).values({
          jobId: createdJob.id,
          type: input.type,
        });

        return createdJob;
      });

      try {
        const result = await translationJobQueue.enqueue({
          jobId: job.id,
          projectId: ctx.projectId,
          type: input.type,
        });

        await ctx.db
          .update(schema.jobs)
          .set({ workflowRunId: result.ids[0] ?? null })
          .where(
            and(eq(schema.jobs.id, job.id), eq(schema.jobs.organizationId, ctx.organizationId)),
          );

        return {
          success: true,
          jobId: job.id,
          status: "enqueued",
          workflowRunIds: result.ids,
        };
      } catch (error) {
        await ctx.db
          .update(schema.jobs)
          .set({
            status: "failed",
            lastError: error instanceof Error ? error.message : "translation job queue unavailable",
          })
          .where(
            and(eq(schema.jobs.id, job.id), eq(schema.jobs.organizationId, ctx.organizationId)),
          );

        return {
          success: false,
          jobId: job.id,
          status: "failed",
          error: "Translation job queue unavailable.",
        };
      }
    },
  });
}

/**
 * Create a review job for quality inspection.
 *
 * PRODUCT.md requirement: Review jobs should support "human review, agent review, and TMS review loops."
 *
 * Implementation plan:
 * 1. Accept `criteria` (what to review for), optional `targetLocale`, optional `translationJobId`.
 * 2. Insert into `jobs` with `kind = "review"`, `status = "queued"`, linked to the interaction.
 * 3. Insert into `reviewJobDetails` with `criteria`, `targetLocale`, and any config.
 * 4. Enqueue via a review job queue (new queue type may be needed).
 * 5. Return the created job ID.
 *
 * Example usage: user asks "Can you review the Japanese translations for tone and consistency?"
 */
export function createReviewJobTool(ctx: ToolContext) {
  return tool({
    description:
      "Create a review job to inspect translations for quality, consistency, terminology, tone, or release readiness.",
    inputSchema: z.object({
      criteria: z
        .string()
        .describe("Review criteria, e.g. 'tone and consistency' or 'terminology compliance'."),
      targetLocale: z
        .string()
        .optional()
        .describe("Optional target locale to focus the review on."),
      translationJobId: z
        .string()
        .optional()
        .describe("Optional linked translation job ID to review."),
    }),
    execute: async (input) => {
      const job = await ctx.db.transaction(async (tx) => {
        const [createdJob] = await tx
          .insert(schema.jobs)
          .values(
            queuedJobValues(ctx, {
              kind: "review",
              inputPayload: input,
            }),
          )
          .returning();

        if (!createdJob) {
          throw new Error("Failed to create job: no row returned.");
        }

        await tx.insert(schema.reviewJobDetails).values({
          jobId: createdJob.id,
          criteria: input.criteria,
          targetLocale: input.targetLocale,
          config: {
            translationJobId: input.translationJobId,
          },
        });

        return createdJob;
      });

      return { success: true, jobId: job.id, status: job.status };
    },
  });
}

/**
 * Create a research job for cultural or market evidence gathering.
 *
 * PRODUCT.md requirement: "Research jobs should collect localisation context, market context,
 * cultural-reference evidence, or terminology evidence."
 *
 * Implementation plan:
 * 1. Accept `scope` (what to research), `targetLocales`, optional `sourceText` or `assetId`.
 * 2. Insert into `jobs` with `kind = "research"`, `status = "queued"`, linked to the interaction.
 * 3. No dedicated detail table exists yet for research jobs; add one or store scope in `inputPayload`.
 * 4. Enqueue via a research job worker that gathers evidence and writes results back to `outcomePayload`.
 * 5. Return the created job ID.
 *
 * Example usage: user asks "Will this campaign line work in Brazil and Japan?"
 */
export function createResearchJobTool(ctx: ToolContext) {
  return tool({
    description:
      "Create a research job to gather cultural context, market guidance, or terminology evidence for target locales.",
    inputSchema: z.object({
      scope: z
        .string()
        .describe("Research scope, e.g. 'cultural reference viability' or 'competitor wording'."),
      targetLocales: z.array(z.string()).min(1).describe("Locales to research."),
      sourceText: z.string().optional().describe("Optional source text or claim to research."),
      assetId: z.string().optional().describe("Optional localization asset ID to research."),
    }),
    execute: async (input) => {
      const job = await createQueuedJob(ctx, {
        kind: "research",
        inputPayload: input,
      });

      return { success: true, jobId: job.id, status: job.status };
    },
  });
}

/**
 * Create a sync job for pulling or pushing data to external systems.
 *
 * PRODUCT.md requirement: Sync jobs should "pull from or push to repositories, TMS platforms, and other systems."
 *
 * Implementation plan:
 * 1. Accept `connectorKind`, `direction` ("pull" | "push"), `externalIdentifiers`.
 * 2. Insert into `jobs` with `kind = "sync"`, `status = "queued"`, linked to the interaction.
 * 3. Insert into `syncJobDetails` with connectorKind, direction, externalIdentifiers.
 * 4. Enqueue via a sync job worker.
 * 5. Return the created job ID.
 *
 * Example usage: user asks "Sync the latest strings from our TMS project."
 */
export function createSyncJobTool(ctx: ToolContext) {
  return tool({
    description:
      "Create a sync job to pull from or push to repositories, TMS platforms, or other connected systems.",
    inputSchema: z.object({
      connectorKind: z.string().describe("Connector kind, e.g. 'github', 'tms', 'slack'."),
      direction: z.enum(["pull", "push"]).describe("Sync direction."),
      externalIdentifiers: z
        .record(z.string(), z.unknown())
        .describe(
          "External system identifiers, e.g. { repository: 'owner/repo', branch: 'main' }.",
        ),
    }),
    execute: async (input) => {
      const job = await ctx.db.transaction(async (tx) => {
        const [createdJob] = await tx
          .insert(schema.jobs)
          .values(
            queuedJobValues(ctx, {
              kind: "sync",
              inputPayload: input,
            }),
          )
          .returning();

        if (!createdJob) {
          throw new Error("Failed to create job: no row returned.");
        }

        await tx.insert(schema.syncJobDetails).values({
          jobId: createdJob.id,
          connectorKind: input.connectorKind,
          direction: input.direction,
          externalIdentifiers: input.externalIdentifiers,
        });

        return createdJob;
      });

      return { success: true, jobId: job.id, status: job.status };
    },
  });
}

/**
 * Create an asset-management job for TM/glossary/asset updates.
 *
 * PRODUCT.md requirement: Asset management jobs should "create, import, export, dedupe, or update
 * TMs, glossaries, and localisation assets."
 *
 * Implementation plan:
 * 1. Accept `assetType` ("tm" | "glossary" | "localisation_asset"), `operation` ("create" | "import" | "export" | "dedupe" | "update").
 * 2. Insert into `jobs` with `kind = "asset_management"`, `status = "queued"`, linked to the interaction.
 * 3. Insert into `assetManagementJobDetails` with assetType, operation, and config.
 * 4. Enqueue via an asset-management worker.
 * 5. Return the created job ID.
 *
 * Example usage: user asks "Import the approved translations into the project glossary."
 */
export function createAssetManagementJobTool(ctx: ToolContext) {
  return tool({
    description:
      "Create an asset-management job to create, import, export, deduplicate, or update translation memories, glossaries, or localization assets.",
    inputSchema: z.object({
      assetType: z
        .enum(["tm", "glossary", "localisation_asset"])
        .describe("Type of asset to manage."),
      operation: z
        .enum(["create", "import", "export", "dedupe", "update"])
        .describe("Management operation."),
      config: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Operation-specific configuration."),
    }),
    execute: async (input) => {
      const job = await ctx.db.transaction(async (tx) => {
        const [createdJob] = await tx
          .insert(schema.jobs)
          .values(
            queuedJobValues(ctx, {
              kind: "asset_management",
              inputPayload: input,
            }),
          )
          .returning();

        if (!createdJob) {
          throw new Error("Failed to create job: no row returned.");
        }

        await tx.insert(schema.assetManagementJobDetails).values({
          jobId: createdJob.id,
          assetType: input.assetType,
          operation: input.operation,
          config: input.config ?? {},
        });

        return createdJob;
      });

      return { success: true, jobId: job.id, status: job.status };
    },
  });
}

/**
 * List jobs linked to this interaction or a project.
 *
 * PRODUCT.md requirement: "The jobs list should be the source of truth for 'what work is running or complete'."
 *
 * Implementation plan:
 * 1. Accept optional `interactionId` and optional `projectId`.
 * 2. Query `jobs` filtered by `organizationId`, `interactionId`, or `projectId`.
 * 3. Join `translationJobDetails` for translation jobs to get `type` and `outcomeKind`.
 * 4. Return a list with id, kind, status, createdAt, completedAt.
 *
 * Example usage: user asks "What jobs did we create from this conversation?"
 */
export function createListJobsTool(ctx: ToolContext) {
  return tool({
    description:
      "List jobs associated with an interaction or project, showing their kind, status, and timestamps.",
    inputSchema: z.object({
      interactionId: z.string().optional().describe("Filter by interaction (conversation) ID."),
      projectId: z.string().optional().describe("Filter by project ID."),
      kind: z.enum(jobKinds).optional().describe("Filter by job kind."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Maximum number of jobs to return."),
    }),
    execute: async (input) => {
      const filters = [eq(schema.jobs.organizationId, ctx.organizationId)];

      if (input.interactionId) {
        filters.push(eq(schema.jobs.interactionId, input.interactionId));
      }

      if (input.projectId) {
        filters.push(eq(schema.jobs.projectId, input.projectId));
      }

      if (input.kind) {
        filters.push(eq(schema.jobs.kind, input.kind));
      }

      const jobs = await ctx.db
        .select({
          id: schema.jobs.id,
          projectId: schema.jobs.projectId,
          kind: schema.jobs.kind,
          status: schema.jobs.status,
          translationType: schema.translationJobDetails.type,
          translationOutcomeKind: schema.translationJobDetails.outcomeKind,
          createdAt: schema.jobs.createdAt,
          updatedAt: schema.jobs.updatedAt,
          completedAt: schema.jobs.completedAt,
        })
        .from(schema.jobs)
        .leftJoin(
          schema.translationJobDetails,
          eq(schema.translationJobDetails.jobId, schema.jobs.id),
        )
        .where(and(...filters))
        .orderBy(desc(schema.jobs.createdAt))
        .limit(input.limit);

      return {
        jobs: jobs.map((job) => {
          const baseJob = {
            id: job.id,
            projectId: job.projectId,
            kind: job.kind,
            status: job.status,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt,
            completedAt: job.completedAt,
          };

          if (job.kind !== "translation") {
            return baseJob;
          }

          return {
            ...baseJob,
            details: {
              type: job.translationType,
              outcomeKind: job.translationOutcomeKind,
            },
          };
        }),
      };
    },
  });
}

/**
 * Get detailed status of a specific job.
 *
 * PRODUCT.md requirement: "Users should be able to inspect job inputs, context, output, and errors."
 *
 * Implementation plan:
 * 1. Accept `jobId`.
 * 2. Query `jobs` by ID and organization.
 * 3. Join the kind-specific detail table to get type-specific data.
 * 4. Return full job record including `inputPayload`, `outcomePayload`, `lastError`, `contextSnapshot`.
 *
 * Example usage: user asks "Is the Japanese translation job done yet?"
 */
export function createGetJobStatusTool(ctx: ToolContext) {
  return tool({
    description:
      "Get detailed status and results for a specific job, including inputs, outputs, and errors.",
    inputSchema: z.object({
      jobId: z.string().describe("The job ID to look up."),
    }),
    execute: async ({ jobId }) => {
      const job = await getJobDetails(ctx, jobId);

      if (!job) {
        return { job: null, error: `Job ${jobId} not found.` };
      }

      return { job };
    },
  });
}
