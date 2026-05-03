import { tool } from "ai";
import { z } from "zod";

import type { ToolContext } from "./types";

/**
 * TODO: Create a translation job (string or file) and link it to the interaction.
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
export function createTranslationJobTool(_ctx: ToolContext) {
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
    execute: async () => {
      // TODO: implement job creation using the same logic as `job.route.ts`.
      // Needs access to the job queue adapter. For now, return a stub.
      return { jobId: null, status: "not_implemented" };
    },
  });
}

/**
 * TODO: Create a review job for quality inspection.
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
export function createReviewJobTool(_ctx: ToolContext) {
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
    execute: async () => {
      // TODO: implement review job creation.
      // Schema: `jobs` (kind = "review"), `reviewJobDetails`.
      return { jobId: null, status: "not_implemented" };
    },
  });
}

/**
 * TODO: Create a research job for cultural or market evidence gathering.
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
export function createResearchJobTool(_ctx: ToolContext) {
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
    execute: async () => {
      // TODO: implement research job creation.
      // Schema: `jobs` (kind = "research"). Consider adding a `research_job_details` table.
      return { jobId: null, status: "not_implemented" };
    },
  });
}

/**
 * TODO: Create a sync job for pulling or pushing data to external systems.
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
export function createSyncJobTool(_ctx: ToolContext) {
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
    execute: async () => {
      // TODO: implement sync job creation.
      // Schema: `jobs` (kind = "sync"), `syncJobDetails`.
      return { jobId: null, status: "not_implemented" };
    },
  });
}

/**
 * TODO: Create an asset-management job for TM/glossary/asset updates.
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
export function createAssetManagementJobTool(_ctx: ToolContext) {
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
    execute: async () => {
      // TODO: implement asset-management job creation.
      // Schema: `jobs` (kind = "asset_management"), `assetManagementJobDetails`.
      return { jobId: null, status: "not_implemented" };
    },
  });
}

/**
 * TODO: List jobs linked to this interaction or a project.
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
export function createListJobsTool(_ctx: ToolContext) {
  return tool({
    description:
      "List jobs associated with an interaction or project, showing their kind, status, and timestamps.",
    inputSchema: z.object({
      interactionId: z.string().optional().describe("Filter by interaction (conversation) ID."),
      projectId: z.string().optional().describe("Filter by project ID."),
      kind: z
        .enum(["translation", "research", "review", "sync", "asset_management"])
        .optional()
        .describe("Filter by job kind."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Maximum number of jobs to return."),
    }),
    execute: async () => {
      // TODO: implement job listing query.
      // Schema: `jobs`, `translationJobDetails`, `reviewJobDetails`, `syncJobDetails`, `assetManagementJobDetails`.
      return { jobs: [] };
    },
  });
}

/**
 * TODO: Get detailed status of a specific job.
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
export function createGetJobStatusTool(_ctx: ToolContext) {
  return tool({
    description:
      "Get detailed status and results for a specific job, including inputs, outputs, and errors.",
    inputSchema: z.object({
      jobId: z.string().describe("The job ID to look up."),
    }),
    execute: async () => {
      // TODO: implement job status lookup.
      // Schema: `jobs` joined with kind-specific detail tables.
      return { job: null };
    },
  });
}
