import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/database";

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
]);

const triggerConfigSchema = z
  .object({
    mode: z.enum(["manual", "scheduled", "github"]).default("manual"),
    schedule: z
      .object({
        cadence: z.enum(["hourly", "daily", "weekly"]),
        hourUtc: z.number().int().min(0).max(23).optional(),
        dayOfWeek: z.number().int().min(0).max(6).optional(),
        timezone: z.string().trim().min(1).max(64).default("UTC"),
      })
      .optional(),
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
    projectId: z.string().trim().min(1).optional(),
    pushSource: z.boolean().default(false),
    pullTranslations: z.boolean().default(false),
    validation: z.boolean().default(false),
  })
  .default({ enabled: false, pushSource: false, pullTranslations: false, validation: false });

const toolConfigSchema = z
  .object({
    github: githubToolConfigSchema.optional(),
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
export type WorkspaceAutomationToolConfig = z.infer<typeof toolConfigSchema>;

type AutomationRow = typeof schema.workspaceAutomations.$inferSelect;
type AutomationRunRow = typeof schema.workspaceAutomationRuns.$inferSelect;

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
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
}): void {
  const githubTools = input.toolConfig.github;
  if (!githubTools?.enabled) {
    return;
  }

  if (
    input.repositoryTarget.kind !== "github" ||
    !input.repositoryTarget.githubInstallationRepositoryId
  ) {
    throw new Error("github_repository_target_required");
  }

  if (!githubTools.projectId) {
    throw new Error("github_project_required");
  }
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
}): Promise<WorkspaceAutomationRecord> {
  const config = workspaceAutomationConfigSchema.parse({
    triggerConfig: input.triggerConfig ?? {},
    repositoryTarget: input.repositoryTarget ?? {},
    toolConfig: input.toolConfig ?? {},
  });
  validateWorkspaceAutomationConfig(config);

  const [row] = await db
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
      nextRunAt: input.nextRunAt ?? null,
    })
    .returning();

  if (!row) {
    throw new Error("failed_to_create_workspace_automation");
  }

  return serializeAutomation(row);
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
}): Promise<WorkspaceAutomationRecord | null> {
  const existing = await getWorkspaceAutomationById({
    automationId: input.automationId,
    organizationId: input.organizationId,
  });
  if (!existing) {
    return null;
  }

  const config = workspaceAutomationConfigSchema.parse({
    triggerConfig: input.triggerConfig ?? existing.triggerConfig,
    repositoryTarget: input.repositoryTarget ?? existing.repositoryTarget,
    toolConfig: input.toolConfig ?? existing.toolConfig,
  });
  validateWorkspaceAutomationConfig(config);

  const [row] = await db
    .update(schema.workspaceAutomations)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      triggerConfig: config.triggerConfig,
      githubInstallationRepositoryId:
        config.repositoryTarget.kind === "github"
          ? (config.repositoryTarget.githubInstallationRepositoryId ?? null)
          : null,
      repositoryTarget: config.repositoryTarget,
      toolConfig: config.toolConfig,
      ...(input.nextRunAt !== undefined ? { nextRunAt: input.nextRunAt } : {}),
      configVersion: sql`${schema.workspaceAutomations.configVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.workspaceAutomations.id, input.automationId),
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
      ),
    )
    .returning();

  return row ? serializeAutomation(row) : null;
}

export async function pauseWorkspaceAutomation(input: {
  automationId: string;
  organizationId: string;
}): Promise<WorkspaceAutomationRecord | null> {
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
  limit?: number;
}): Promise<WorkspaceAutomationRecord[]> {
  const rows = await db
    .select()
    .from(schema.workspaceAutomations)
    .where(
      input.status
        ? and(
            eq(schema.workspaceAutomations.organizationId, input.organizationId),
            eq(schema.workspaceAutomations.status, input.status),
          )
        : eq(schema.workspaceAutomations.organizationId, input.organizationId),
    )
    .orderBy(desc(schema.workspaceAutomations.createdAt))
    .limit(input.limit ?? 50);

  return rows.map(serializeAutomation);
}

export async function createWorkspaceAutomationRun(input: {
  automationId: string;
  organizationId: string;
  triggerSource: WorkspaceAutomationRunTriggerSource;
  status?: WorkspaceAutomationRunStatus;
  inputSnapshot?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  githubRepositoryAutomationJobId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}): Promise<WorkspaceAutomationRunRecord> {
  const [row] = await db
    .insert(schema.workspaceAutomationRuns)
    .values({
      automationId: input.automationId,
      organizationId: input.organizationId,
      triggerSource: input.triggerSource,
      status: input.status ?? "queued",
      inputSnapshot: input.inputSnapshot ?? {},
      outputSummary: input.outputSummary ?? {},
      error: input.error ?? null,
      githubRepositoryAutomationJobId: input.githubRepositoryAutomationJobId ?? null,
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
    })
    .returning();

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

export async function listWorkspaceAutomationRuns(input: {
  automationId: string;
  organizationId: string;
  limit?: number;
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
    .limit(input.limit ?? 50);

  return rows.map(serializeAutomationRun);
}
