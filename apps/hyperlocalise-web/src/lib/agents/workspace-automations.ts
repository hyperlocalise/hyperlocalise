import { and, desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema, type DatabaseClient } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

import {
  hasWorkspaceAutomationGithubAgentTool,
  hasWorkspaceAutomationGithubWorkflow,
} from "./workspace-automation-github-mapping";
import { resolveNextRunAtForWorkspaceAutomation } from "./workspace-automation-schedule";

export const workspaceAutomationStatusSchema = z.enum(["active", "paused", "archived"]);
export const workspaceAutomationRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);
export const workspaceAutomationRunTriggerSourceSchema = z.enum([
  "manual",
  "scheduled",
  "github",
  "contentful",
  "source_upload",
]);

const branchPatternSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._\-/*?]+$/, "invalid_branch_pattern");

const triggerConfigSchema = z
  .object({
    mode: z
      .enum(["manual", "scheduled", "github", "contentful", "source_upload"])
      .default("manual"),
    schedule: z
      .object({
        cadence: z.enum(["hourly", "daily", "weekly"]),
        hourUtc: z.number().int().min(0).max(23).optional(),
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        timezone: z.string().trim().min(1).max(64).default("UTC"),
      })
      .optional(),
    branches: z.array(branchPatternSchema).min(1).max(32).optional(),
  })
  .default({ mode: "manual" });

const repositoryTargetSchema = z
  .object({
    kind: z.enum(["none", "github"]).default("none"),
    githubInstallationRepositoryId: z.string().uuid().optional(),
  })
  .default({ kind: "none" });

const githubToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["agent", "sync"]).default("sync"),
    projectId: optionalProjectIdSchema,
    pushSource: z.boolean().default(false),
    pullTranslations: z.boolean().default(false),
    validation: z.boolean().default(false),
  })
  .default({
    enabled: false,
    mode: "sync",
    pushSource: false,
    pullTranslations: false,
    validation: false,
  });

export type WorkspaceAutomationGithubToolMode = z.infer<typeof githubToolConfigSchema>["mode"];

const slackToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    channelId: z.string().trim().min(1).max(64).optional(),
  })
  .default({ enabled: false });

const emailToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    recipients: z.array(z.string().email()).min(1).max(10).optional(),
  })
  .default({ enabled: false });

const contentfulToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    connectionId: z.string().uuid().optional(),
    projectId: optionalProjectIdSchema,
    sourceLocale: z.string().trim().min(1).max(32).default("en"),
    entryId: z.string().trim().min(1).max(256).optional(),
    contentTypeIds: z.array(z.string().trim().min(1).max(128)).max(50).default([]),
    targetLocales: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
    fieldMode: z.enum(["auto", "configured"]).default("auto"),
    overwriteDraftLocales: z.boolean().default(false),
    runQa: z.boolean().default(true),
    writeDrafts: z.boolean().default(true),
  })
  .default({
    enabled: false,
    sourceLocale: "en",
    contentTypeIds: [],
    targetLocales: [],
    fieldMode: "auto",
    overwriteDraftLocales: false,
    runQa: true,
    writeDrafts: true,
  });

const translationToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    projectId: optionalProjectIdSchema,
    useProjectTargetLocales: z.boolean().default(true),
    targetLocales: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  })
  .default({ enabled: false, useProjectTargetLocales: true, targetLocales: [] });

const toolConfigSchema = z
  .object({
    github: githubToolConfigSchema.optional(),
    slack: slackToolConfigSchema.optional(),
    email: emailToolConfigSchema.optional(),
    contentful: contentfulToolConfigSchema.optional(),
    translation: translationToolConfigSchema.optional(),
  })
  .default({});

export const workspaceAutomationConfigSchema = z.object({
  triggerConfig: triggerConfigSchema,
  repositoryTarget: repositoryTargetSchema,
  toolConfig: toolConfigSchema,
});

export type WorkspaceAutomationStatus = z.infer<typeof workspaceAutomationStatusSchema>;
export type WorkspaceAutomationRunStatus = z.infer<typeof workspaceAutomationRunStatusSchema>;
export type WorkspaceAutomationRunTriggerSource = z.infer<
  typeof workspaceAutomationRunTriggerSourceSchema
>;
export type WorkspaceAutomationTriggerConfig = z.infer<typeof triggerConfigSchema>;
export type WorkspaceAutomationRepositoryTarget = z.infer<typeof repositoryTargetSchema>;
export type WorkspaceAutomationSlackToolConfig = z.infer<typeof slackToolConfigSchema>;
export type WorkspaceAutomationEmailToolConfig = z.infer<typeof emailToolConfigSchema>;
export type WorkspaceAutomationContentfulToolConfig = z.infer<typeof contentfulToolConfigSchema>;
export type WorkspaceAutomationToolConfig = z.infer<typeof toolConfigSchema>;

export type WorkspaceAutomationConfigValidationError =
  | {
      code: "github_repository_target_required";
      message: "Enabled GitHub tools require a GitHub repository target.";
    }
  | { code: "github_project_required"; message: "Enabled GitHub tools require a project." }
  | {
      code: "github_trigger_required";
      message: "Enabled GitHub tools require a scheduled or GitHub push trigger.";
    }
  | {
      code: "github_agent_trigger_required";
      message: "GitHub repo agent automations support scheduled or manual triggers only.";
    }
  | {
      code: "github_push_branches_required";
      message: "GitHub push triggers require at least one branch pattern.";
    }
  | {
      code: "scheduled_workflow_required";
      message: "Scheduled automations require at least one GitHub or Contentful workflow.";
    }
  | {
      code: "contentful_connection_required";
      message: "Enabled Contentful tools require a Contentful connection.";
    }
  | {
      code: "contentful_project_required";
      message: "Enabled Contentful tools require a project.";
    }
  | {
      code: "contentful_target_locales_required";
      message: "Enabled Contentful tools require at least one target locale.";
    }
  | {
      code: "contentful_entry_id_required";
      message: "Scheduled Contentful automations require an entry ID.";
    }
  | {
      code: "slack_not_connected";
      message: "Enable the Slack integration before using Slack notifications.";
    }
  | {
      code: "slack_channel_required";
      message: "Choose a Slack channel for automation notifications.";
    }
  | {
      code: "email_not_connected";
      message: "Enable the email agent before using email notifications.";
    }
  | {
      code: "email_recipients_required";
      message: "Add at least one email recipient for automation notifications.";
    }
  | {
      code: "translation_project_required";
      message: "Enabled translation tools require a project.";
    }
  | {
      code: "translation_target_locales_required";
      message: "Enabled translation tools require at least one target locale.";
    }
  | {
      code: "source_upload_workflow_required";
      message: "Source upload triggers require translation jobs to be enabled.";
    };

type AutomationRow = typeof schema.workspaceAutomations.$inferSelect;
type AutomationRunRow = typeof schema.workspaceAutomationRuns.$inferSelect;

export function hasWorkspaceAutomationContentfulWorkflow(
  toolConfig: WorkspaceAutomationToolConfig,
) {
  return Boolean(toolConfig.contentful?.enabled);
}

export function hasWorkspaceAutomationTranslationWorkflow(
  toolConfig: WorkspaceAutomationToolConfig,
) {
  return Boolean(toolConfig.translation?.enabled);
}

export type WorkspaceAutomationRecord = {
  id: string;
  organizationId: string;
  authorUserId: string | null;
  status: WorkspaceAutomationStatus;
  name: string;
  instructions: string;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
  configVersion: number;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceAutomationRunRecord = {
  id: string;
  automationId: string;
  organizationId: string;
  triggerSource: WorkspaceAutomationRunTriggerSource;
  status: WorkspaceAutomationRunStatus;
  idempotencyKey: string | null;
  inputSnapshot: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  error: Record<string, unknown> | null;
  githubRepositoryAutomationJobId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function normalizeTriggerConfig(value: Record<string, unknown>): WorkspaceAutomationTriggerConfig {
  return triggerConfigSchema.parse(value);
}

function normalizeRepositoryTarget(
  value: Record<string, unknown>,
): WorkspaceAutomationRepositoryTarget {
  return repositoryTargetSchema.parse(value);
}

function normalizeToolConfig(value: Record<string, unknown>): WorkspaceAutomationToolConfig {
  return toolConfigSchema.parse(value);
}

function validateWorkspaceAutomationConfig(input: {
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
}): Result<void, WorkspaceAutomationConfigValidationError> {
  const githubTools = input.toolConfig.github;
  if (githubTools?.enabled) {
    if (
      input.repositoryTarget.kind !== "github" ||
      !input.repositoryTarget.githubInstallationRepositoryId
    ) {
      return err({
        code: "github_repository_target_required",
        message: "Enabled GitHub tools require a GitHub repository target.",
      });
    }

    const githubMode = githubTools.mode ?? "sync";

    if (githubMode === "agent") {
      if (input.triggerConfig.mode === "github") {
        return err({
          code: "github_agent_trigger_required",
          message: "GitHub repo agent automations support scheduled or manual triggers only.",
        });
      }
    } else {
      if (!githubTools.projectId) {
        return err({
          code: "github_project_required",
          message: "Enabled GitHub tools require a project.",
        });
      }

      if (
        input.triggerConfig.mode === "github" &&
        (!input.triggerConfig.branches || input.triggerConfig.branches.length === 0)
      ) {
        return err({
          code: "github_push_branches_required",
          message: "GitHub push triggers require at least one branch pattern.",
        });
      }
    }
  }

  if (
    input.triggerConfig.mode === "scheduled" &&
    !hasWorkspaceAutomationGithubAgentTool(input.toolConfig) &&
    !hasWorkspaceAutomationGithubWorkflow(input.toolConfig) &&
    !hasWorkspaceAutomationContentfulWorkflow(input.toolConfig)
  ) {
    return err({
      code: "scheduled_workflow_required",
      message: "Scheduled automations require at least one GitHub or Contentful workflow.",
    });
  }

  const contentfulTools = input.toolConfig.contentful;
  if (contentfulTools?.enabled) {
    if (!contentfulTools.connectionId) {
      return err({
        code: "contentful_connection_required",
        message: "Enabled Contentful tools require a Contentful connection.",
      });
    }
    if (!contentfulTools.projectId) {
      return err({
        code: "contentful_project_required",
        message: "Enabled Contentful tools require a project.",
      });
    }
    if (contentfulTools.targetLocales.length === 0) {
      return err({
        code: "contentful_target_locales_required",
        message: "Enabled Contentful tools require at least one target locale.",
      });
    }
    if (input.triggerConfig.mode === "scheduled" && !contentfulTools.entryId?.trim()) {
      return err({
        code: "contentful_entry_id_required",
        message: "Scheduled Contentful automations require an entry ID.",
      });
    }
  }

  const slackTools = input.toolConfig.slack;
  if (slackTools?.enabled && !slackTools.channelId) {
    return err({
      code: "slack_channel_required",
      message: "Choose a Slack channel for automation notifications.",
    });
  }

  const emailTools = input.toolConfig.email;
  if (emailTools?.enabled && (!emailTools.recipients || emailTools.recipients.length === 0)) {
    return err({
      code: "email_recipients_required",
      message: "Add at least one email recipient for automation notifications.",
    });
  }

  const translationTools = input.toolConfig.translation;
  if (translationTools?.enabled) {
    if (!translationTools.projectId) {
      return err({
        code: "translation_project_required",
        message: "Enabled translation tools require a project.",
      });
    }

    if (!translationTools.useProjectTargetLocales && translationTools.targetLocales.length === 0) {
      return err({
        code: "translation_target_locales_required",
        message: "Enabled translation tools require at least one target locale.",
      });
    }
  }

  if (
    input.triggerConfig.mode === "source_upload" &&
    !hasWorkspaceAutomationTranslationWorkflow(input.toolConfig)
  ) {
    return err({
      code: "source_upload_workflow_required",
      message: "Source upload triggers require translation jobs to be enabled.",
    });
  }

  return ok(undefined);
}

export async function validateWorkspaceAutomationIntegrations(input: {
  organizationId: string;
  toolConfig: WorkspaceAutomationToolConfig;
}): Promise<Result<void, WorkspaceAutomationConfigValidationError>> {
  if (input.toolConfig.slack?.enabled) {
    const [connector] = await db
      .select({ enabled: schema.connectors.enabled })
      .from(schema.connectors)
      .where(
        and(
          eq(schema.connectors.organizationId, input.organizationId),
          eq(schema.connectors.kind, "slack"),
        ),
      )
      .limit(1);

    if (!connector?.enabled) {
      return err({
        code: "slack_not_connected",
        message: "Enable the Slack integration before using Slack notifications.",
      });
    }
  }

  if (input.toolConfig.email?.enabled) {
    const [connector] = await db
      .select({ enabled: schema.connectors.enabled })
      .from(schema.connectors)
      .where(
        and(
          eq(schema.connectors.organizationId, input.organizationId),
          eq(schema.connectors.kind, "email"),
        ),
      )
      .limit(1);

    if (!connector?.enabled) {
      return err({
        code: "email_not_connected",
        message: "Enable the email agent before using email notifications.",
      });
    }
  }

  return ok(undefined);
}

function serializeAutomation(row: AutomationRow): WorkspaceAutomationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    authorUserId: row.authorUserId,
    status: row.status,
    name: row.name,
    instructions: row.instructions,
    triggerConfig: normalizeTriggerConfig(row.triggerConfig),
    repositoryTarget: normalizeRepositoryTarget(row.repositoryTarget),
    toolConfig: normalizeToolConfig(row.toolConfig),
    configVersion: row.configVersion,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeAutomationRun(row: AutomationRunRow): WorkspaceAutomationRunRecord {
  return {
    id: row.id,
    automationId: row.automationId,
    organizationId: row.organizationId,
    triggerSource: row.triggerSource,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    inputSnapshot: row.inputSnapshot,
    outputSummary: row.outputSummary,
    error: row.error ?? null,
    githubRepositoryAutomationJobId: row.githubRepositoryAutomationJobId,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createWorkspaceAutomation(input: {
  organizationId: string;
  authorUserId?: string | null;
  status?: WorkspaceAutomationStatus;
  name: string;
  instructions: string;
  triggerConfig?: WorkspaceAutomationTriggerConfig;
  repositoryTarget?: WorkspaceAutomationRepositoryTarget;
  toolConfig?: WorkspaceAutomationToolConfig;
  nextRunAt?: Date | null;
  db?: DatabaseClient;
}): Promise<Result<WorkspaceAutomationRecord, WorkspaceAutomationConfigValidationError>> {
  const config = workspaceAutomationConfigSchema.parse({
    triggerConfig: input.triggerConfig ?? {},
    repositoryTarget: input.repositoryTarget ?? {},
    toolConfig: input.toolConfig ?? {},
  });
  const validation = validateWorkspaceAutomationConfig({
    triggerConfig: config.triggerConfig,
    repositoryTarget: config.repositoryTarget,
    toolConfig: config.toolConfig,
  });
  if (isErr(validation)) {
    return err(validation.error);
  }

  const integrationValidation = await validateWorkspaceAutomationIntegrations({
    organizationId: input.organizationId,
    toolConfig: config.toolConfig,
  });
  if (isErr(integrationValidation)) {
    return err(integrationValidation.error);
  }

  const draftAutomation: WorkspaceAutomationRecord = {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    authorUserId: input.authorUserId ?? null,
    status: input.status ?? "active",
    name: input.name,
    instructions: input.instructions,
    triggerConfig: config.triggerConfig,
    repositoryTarget: config.repositoryTarget,
    toolConfig: config.toolConfig,
    configVersion: 1,
    nextRunAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const resolvedNextRunAt =
    input.nextRunAt !== undefined
      ? input.nextRunAt
      : resolveNextRunAtForWorkspaceAutomation(draftAutomation);

  const database = input.db ?? db;

  const [row] = await database
    .insert(schema.workspaceAutomations)
    .values({
      organizationId: input.organizationId,
      authorUserId: input.authorUserId ?? null,
      status: input.status ?? "active",
      name: input.name,
      instructions: input.instructions,
      triggerConfig: config.triggerConfig,
      githubInstallationRepositoryId:
        config.repositoryTarget.kind === "github"
          ? (config.repositoryTarget.githubInstallationRepositoryId ?? null)
          : null,
      repositoryTarget: config.repositoryTarget,
      toolConfig: config.toolConfig,
      nextRunAt: resolvedNextRunAt,
    })
    .returning();

  if (!row) {
    throw new Error("failed_to_create_workspace_automation");
  }

  return ok(serializeAutomation(row));
}

export async function updateWorkspaceAutomation(input: {
  automationId: string;
  organizationId: string;
  status?: WorkspaceAutomationStatus;
  name?: string;
  instructions?: string;
  triggerConfig?: WorkspaceAutomationTriggerConfig;
  repositoryTarget?: WorkspaceAutomationRepositoryTarget;
  toolConfig?: WorkspaceAutomationToolConfig;
  nextRunAt?: Date | null;
  db?: DatabaseClient;
}): Promise<Result<WorkspaceAutomationRecord | null, WorkspaceAutomationConfigValidationError>> {
  const existing = await getWorkspaceAutomationById({
    automationId: input.automationId,
    organizationId: input.organizationId,
  });
  if (!existing) {
    return ok(null);
  }

  const configChanged =
    input.instructions !== undefined ||
    input.triggerConfig !== undefined ||
    input.repositoryTarget !== undefined ||
    input.toolConfig !== undefined;

  const config = configChanged
    ? workspaceAutomationConfigSchema.parse({
        triggerConfig: input.triggerConfig ?? existing.triggerConfig,
        repositoryTarget: input.repositoryTarget ?? existing.repositoryTarget,
        toolConfig: input.toolConfig ?? existing.toolConfig,
      })
    : {
        triggerConfig: existing.triggerConfig,
        repositoryTarget: existing.repositoryTarget,
        toolConfig: existing.toolConfig,
      };

  if (configChanged) {
    const validation = validateWorkspaceAutomationConfig({
      triggerConfig: config.triggerConfig,
      repositoryTarget: config.repositoryTarget,
      toolConfig: config.toolConfig,
    });
    if (isErr(validation)) {
      return err(validation.error);
    }

    const integrationValidation = await validateWorkspaceAutomationIntegrations({
      organizationId: input.organizationId,
      toolConfig: config.toolConfig,
    });
    if (isErr(integrationValidation)) {
      return err(integrationValidation.error);
    }
  }

  const mergedAutomation: WorkspaceAutomationRecord = {
    ...existing,
    status: input.status ?? existing.status,
    name: input.name ?? existing.name,
    instructions: input.instructions ?? existing.instructions,
    triggerConfig: config.triggerConfig,
    repositoryTarget: config.repositoryTarget,
    toolConfig: config.toolConfig,
    configVersion: configChanged ? existing.configVersion + 1 : existing.configVersion,
  };
  const resolvedNextRunAt =
    input.nextRunAt !== undefined
      ? input.nextRunAt
      : configChanged || input.status !== undefined
        ? resolveNextRunAtForWorkspaceAutomation({
            ...mergedAutomation,
            status: input.status ?? existing.status,
          })
        : existing.nextRunAt
          ? new Date(existing.nextRunAt)
          : null;

  const updateConditions = [
    eq(schema.workspaceAutomations.id, input.automationId),
    eq(schema.workspaceAutomations.organizationId, input.organizationId),
  ];
  if (configChanged) {
    updateConditions.push(eq(schema.workspaceAutomations.configVersion, existing.configVersion));
  }

  const database = input.db ?? db;

  const [row] = await database
    .update(schema.workspaceAutomations)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.triggerConfig !== undefined ? { triggerConfig: config.triggerConfig } : {}),
      ...(input.repositoryTarget !== undefined
        ? {
            githubInstallationRepositoryId:
              config.repositoryTarget.kind === "github"
                ? (config.repositoryTarget.githubInstallationRepositoryId ?? null)
                : null,
            repositoryTarget: config.repositoryTarget,
          }
        : {}),
      ...(input.toolConfig !== undefined ? { toolConfig: config.toolConfig } : {}),
      ...(input.nextRunAt !== undefined || configChanged || input.status !== undefined
        ? { nextRunAt: resolvedNextRunAt }
        : {}),
      ...(configChanged
        ? { configVersion: sql`${schema.workspaceAutomations.configVersion} + 1` }
        : {}),
      updatedAt: new Date(),
    })
    .where(and(...updateConditions))
    .returning();

  return ok(row ? serializeAutomation(row) : null);
}

export async function pauseWorkspaceAutomation(input: {
  automationId: string;
  organizationId: string;
}): Promise<Result<WorkspaceAutomationRecord | null, WorkspaceAutomationConfigValidationError>> {
  const existing = await getWorkspaceAutomationById({
    automationId: input.automationId,
    organizationId: input.organizationId,
  });
  if (!existing) {
    return ok(null);
  }
  if (existing.status === "archived") {
    return ok(existing);
  }

  return updateWorkspaceAutomation({
    automationId: input.automationId,
    organizationId: input.organizationId,
    status: "paused",
    nextRunAt: null,
  });
}

export async function getWorkspaceAutomationById(input: {
  automationId: string;
  organizationId: string;
}): Promise<WorkspaceAutomationRecord | null> {
  const [row] = await db
    .select()
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.id, input.automationId),
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return row ? serializeAutomation(row) : null;
}

export async function listWorkspaceAutomations(input: {
  organizationId: string;
  status?: WorkspaceAutomationStatus;
  contentfulWebhookConnectionId?: string;
  contentfulWebhookContentTypeId?: string | null;
  limit?: number;
  offset?: number;
}): Promise<WorkspaceAutomationRecord[]> {
  const contentfulContentTypeIdsJson =
    input.contentfulWebhookContentTypeId != null && input.contentfulWebhookContentTypeId !== ""
      ? JSON.stringify([input.contentfulWebhookContentTypeId])
      : null;

  const conditions = [
    eq(schema.workspaceAutomations.organizationId, input.organizationId),
    ...(input.status ? [eq(schema.workspaceAutomations.status, input.status)] : []),
    ...(input.contentfulWebhookConnectionId
      ? [
          sql`${schema.workspaceAutomations.triggerConfig}->>'mode' = 'contentful'`,
          sql`${schema.workspaceAutomations.toolConfig}->'contentful'->>'enabled' = 'true'`,
          sql`${schema.workspaceAutomations.toolConfig}->'contentful'->>'connectionId' = ${input.contentfulWebhookConnectionId}`,
          ...(contentfulContentTypeIdsJson
            ? [
                sql`(
                  jsonb_array_length(
                    COALESCE(
                      ${schema.workspaceAutomations.toolConfig}->'contentful'->'contentTypeIds',
                      '[]'::jsonb
                    )
                  ) = 0
                  OR ${schema.workspaceAutomations.toolConfig}->'contentful'->'contentTypeIds' @> ${contentfulContentTypeIdsJson}::jsonb
                )`,
              ]
            : [
                sql`jsonb_array_length(
                  COALESCE(
                    ${schema.workspaceAutomations.toolConfig}->'contentful'->'contentTypeIds',
                    '[]'::jsonb
                  )
                ) = 0`,
              ]),
        ]
      : []),
  ];

  const rows = await db
    .select()
    .from(schema.workspaceAutomations)
    .where(and(...conditions))
    .orderBy(desc(schema.workspaceAutomations.createdAt))
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);

  return rows.map(serializeAutomation);
}

export async function listSourceUploadWorkspaceAutomations(input: {
  organizationId: string;
  projectId: string;
  limit?: number;
}): Promise<WorkspaceAutomationRecord[]> {
  const rows = await db
    .select()
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
        eq(schema.workspaceAutomations.status, "active"),
        sql`${schema.workspaceAutomations.triggerConfig}->>'mode' = 'source_upload'`,
        sql`${schema.workspaceAutomations.toolConfig}->'translation'->>'enabled' = 'true'`,
        sql`${schema.workspaceAutomations.toolConfig}->'translation'->>'projectId' = ${input.projectId}`,
      ),
    )
    .orderBy(desc(schema.workspaceAutomations.createdAt))
    .limit(input.limit ?? 20);

  return rows.map(serializeAutomation);
}

export type DueWorkspaceAutomation = {
  automation: WorkspaceAutomationRecord;
  repository: typeof schema.githubInstallationRepositories.$inferSelect;
};

export async function listDueWorkspaceAutomations(input: {
  now?: Date;
  limit?: number;
}): Promise<DueWorkspaceAutomation[]> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;

  const rows = await db
    .select({
      automation: schema.workspaceAutomations,
      repository: schema.githubInstallationRepositories,
    })
    .from(schema.workspaceAutomations)
    .innerJoin(
      schema.githubInstallationRepositories,
      eq(
        schema.workspaceAutomations.githubInstallationRepositoryId,
        schema.githubInstallationRepositories.id,
      ),
    )
    .where(
      and(
        eq(schema.workspaceAutomations.status, "active"),
        isNotNull(schema.workspaceAutomations.nextRunAt),
        lte(schema.workspaceAutomations.nextRunAt, now),
        eq(schema.githubInstallationRepositories.enabled, true),
        eq(schema.githubInstallationRepositories.archived, false),
      ),
    )
    .orderBy(schema.workspaceAutomations.nextRunAt)
    .limit(limit);

  return rows.map(({ automation, repository }) => ({
    automation: serializeAutomation(automation),
    repository,
  }));
}

export async function listDueContentfulWorkspaceAutomations(input: {
  now?: Date;
  limit?: number;
}): Promise<WorkspaceAutomationRecord[]> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;

  const rows = await db
    .select()
    .from(schema.workspaceAutomations)
    .where(
      and(
        eq(schema.workspaceAutomations.status, "active"),
        isNotNull(schema.workspaceAutomations.nextRunAt),
        lte(schema.workspaceAutomations.nextRunAt, now),
        sql`${schema.workspaceAutomations.triggerConfig}->>'mode' = 'scheduled'`,
        sql`${schema.workspaceAutomations.toolConfig}->'contentful'->>'enabled' = 'true'`,
      ),
    )
    .orderBy(schema.workspaceAutomations.nextRunAt)
    .limit(limit);

  return rows
    .map(serializeAutomation)
    .filter(
      (automation) =>
        automation.triggerConfig.mode === "scheduled" &&
        hasWorkspaceAutomationContentfulWorkflow(automation.toolConfig),
    );
}

export async function advanceWorkspaceAutomationNextRun(input: {
  automationId: string;
  organizationId: string;
  completedAt?: Date;
}) {
  const automation = await getWorkspaceAutomationById({
    automationId: input.automationId,
    organizationId: input.organizationId,
  });
  if (!automation) {
    return;
  }

  const nextRunAt = resolveNextRunAtForWorkspaceAutomation(
    automation,
    input.completedAt ?? new Date(),
  );

  await db
    .update(schema.workspaceAutomations)
    .set({
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.workspaceAutomations.id, input.automationId),
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
      ),
    );
}

export async function createWorkspaceAutomationRun(input: {
  automationId: string;
  organizationId: string;
  triggerSource: WorkspaceAutomationRunTriggerSource;
  status?: WorkspaceAutomationRunStatus;
  idempotencyKey?: string | null;
  inputSnapshot?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  githubRepositoryAutomationJobId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}): Promise<WorkspaceAutomationRunRecord> {
  const automation = await getWorkspaceAutomationById({
    automationId: input.automationId,
    organizationId: input.organizationId,
  });
  if (!automation) {
    throw new Error("workspace_automation_not_found");
  }

  if (input.idempotencyKey) {
    const existing = await getWorkspaceAutomationRunByIdempotencyKey({
      organizationId: input.organizationId,
      automationId: input.automationId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      return existing;
    }
  }

  const [row] = await db
    .insert(schema.workspaceAutomationRuns)
    .values({
      automationId: input.automationId,
      organizationId: input.organizationId,
      triggerSource: input.triggerSource,
      status: input.status ?? "queued",
      idempotencyKey: input.idempotencyKey ?? null,
      inputSnapshot: input.inputSnapshot ?? {},
      outputSummary: input.outputSummary ?? {},
      error: input.error ?? null,
      githubRepositoryAutomationJobId: input.githubRepositoryAutomationJobId ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
    })
    .onConflictDoNothing({
      target: [
        schema.workspaceAutomationRuns.organizationId,
        schema.workspaceAutomationRuns.idempotencyKey,
      ],
      where: sql`${schema.workspaceAutomationRuns.idempotencyKey} IS NOT NULL`,
    })
    .returning();

  if (!row && input.idempotencyKey) {
    const existing = await getWorkspaceAutomationRunByIdempotencyKey({
      organizationId: input.organizationId,
      automationId: input.automationId,
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      return existing;
    }
  }

  if (!row) {
    throw new Error("failed_to_create_workspace_automation_run");
  }

  return serializeAutomationRun(row);
}

export async function updateWorkspaceAutomationRun(input: {
  runId: string;
  organizationId: string;
  status?: WorkspaceAutomationRunStatus;
  outputSummary?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  githubRepositoryAutomationJobId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}): Promise<WorkspaceAutomationRunRecord | null> {
  const [row] = await db
    .update(schema.workspaceAutomationRuns)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.outputSummary !== undefined ? { outputSummary: input.outputSummary } : {}),
      ...(input.error !== undefined ? { error: input.error } : {}),
      ...(input.githubRepositoryAutomationJobId !== undefined
        ? { githubRepositoryAutomationJobId: input.githubRepositoryAutomationJobId }
        : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.workspaceAutomationRuns.id, input.runId),
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
      ),
    )
    .returning();

  return row ? serializeAutomationRun(row) : null;
}

export async function getWorkspaceAutomationRunByIdempotencyKey(input: {
  organizationId: string;
  automationId: string;
  idempotencyKey: string;
}): Promise<WorkspaceAutomationRunRecord | null> {
  const [row] = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(
      and(
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
        eq(schema.workspaceAutomationRuns.automationId, input.automationId),
        eq(schema.workspaceAutomationRuns.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);

  return row ? serializeAutomationRun(row) : null;
}

export async function getWorkspaceAutomationRunById(input: {
  runId: string;
  organizationId: string;
}): Promise<WorkspaceAutomationRunRecord | null> {
  const [row] = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(
      and(
        eq(schema.workspaceAutomationRuns.id, input.runId),
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return row ? serializeAutomationRun(row) : null;
}

export async function listWorkspaceAutomationRuns(input: {
  automationId: string;
  organizationId: string;
  limit?: number;
  offset?: number;
}): Promise<WorkspaceAutomationRunRecord[]> {
  const rows = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(
      and(
        eq(schema.workspaceAutomationRuns.automationId, input.automationId),
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
      ),
    )
    .orderBy(desc(schema.workspaceAutomationRuns.createdAt))
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);

  return rows.map(serializeAutomationRun);
}
