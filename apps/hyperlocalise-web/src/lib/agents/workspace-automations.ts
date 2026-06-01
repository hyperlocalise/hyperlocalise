import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";

export const workspaceAutomationStatusSchema = z.enum(["active", "paused", "archived"]);
export const workspaceAutomationRunStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
]);
export const workspaceAutomationRunTriggerSourceSchema = z.enum(["manual", "scheduled", "github"]);

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

export type WorkspaceAutomationConfigValidationError =
  | {
      code: "github_repository_target_required";
      message: "Enabled GitHub tools require a GitHub repository target.";
    }
  | { code: "github_project_required"; message: "Enabled GitHub tools require a project." };

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
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
}): Result<void, WorkspaceAutomationConfigValidationError> {
  const githubTools = input.toolConfig.github;
  if (!githubTools?.enabled) {
    return ok(undefined);
  }

  if (
    input.repositoryTarget.kind !== "github" ||
    !input.repositoryTarget.githubInstallationRepositoryId
  ) {
    return err({
      code: "github_repository_target_required",
      message: "Enabled GitHub tools require a GitHub repository target.",
    });
  }

  if (!githubTools.projectId) {
    return err({
      code: "github_project_required",
      message: "Enabled GitHub tools require a project.",
    });
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
}): Promise<Result<WorkspaceAutomationRecord, WorkspaceAutomationConfigValidationError>> {
  const config = workspaceAutomationConfigSchema.parse({
    triggerConfig: input.triggerConfig ?? {},
    repositoryTarget: input.repositoryTarget ?? {},
    toolConfig: input.toolConfig ?? {},
  });
  const validation = validateWorkspaceAutomationConfig(config);
  if (isErr(validation)) {
    return err(validation.error);
  }

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
  const config = workspaceAutomationConfigSchema.parse({
    triggerConfig: input.triggerConfig ?? existing.triggerConfig,
    repositoryTarget: input.repositoryTarget ?? existing.repositoryTarget,
    toolConfig: input.toolConfig ?? existing.toolConfig,
  });
  const validation = validateWorkspaceAutomationConfig(config);
  if (isErr(validation)) {
    return err(validation.error);
  }

  const updateConditions = [
    eq(schema.workspaceAutomations.id, input.automationId),
    eq(schema.workspaceAutomations.organizationId, input.organizationId),
  ];
  if (configChanged) {
    updateConditions.push(eq(schema.workspaceAutomations.configVersion, existing.configVersion));
  }

  const [row] = await db
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
      ...(input.nextRunAt !== undefined ? { nextRunAt: input.nextRunAt } : {}),
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
  limit?: number;
  offset?: number;
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
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);

  return rows.map(serializeAutomation);
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
  idempotencyKey: string;
}): Promise<WorkspaceAutomationRunRecord | null> {
  const [row] = await db
    .select()
    .from(schema.workspaceAutomationRuns)
    .where(
      and(
        eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
        eq(schema.workspaceAutomationRuns.idempotencyKey, input.idempotencyKey),
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
