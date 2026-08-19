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
import "server-only";

import { and, asc, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db, schema, type DatabaseClient } from "@/lib/database";
import { err, isErr, ok, type Result } from "@/lib/primitives/result/results";
import { lockAhrefsConnectionForUpdate } from "@/lib/ahrefs/connections";
import { lockSemrushConnectionForUpdate } from "@/lib/semrush/connections";
import { crowdinAuth } from "@/lib/providers/adapters/crowdin/crowdin-auth";
import { parseProviderProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import {
  hasWorkspaceAutomationGithubAgentTool,
  hasWorkspaceAutomationGithubWorkflow,
} from "./workspace-automation-github-mapping";
import { resolveNextRunAtForWorkspaceAutomation } from "./workspace-automation-schedule";
import {
  formatWorkspaceAutomationAuthorName,
  hasWorkspaceAutomationAssignTranslateWithAgentTool,
  hasWorkspaceAutomationContentfulWorkflow,
  hasWorkspaceAutomationCreateIssueTool,
  hasWorkspaceAutomationCreateNativeTmsJobTool,
  hasWorkspaceAutomationCrowdinTool,
  hasWorkspaceAutomationListIssuesTool,
  hasWorkspaceAutomationWebSearchTool,
  hoistLegacyWorkspaceAutomationProjectId,
  normalizeRepositoryTarget,
  normalizeToolConfig,
  normalizeTriggerConfig,
  readOptionalProjectId,
  workspaceAutomationConfigSchema,
  type WorkspaceAutomationConfigValidationError,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationRepositoryTarget,
  type WorkspaceAutomationRunRecord,
  type WorkspaceAutomationRunStatus,
  type WorkspaceAutomationRunTriggerSource,
  type WorkspaceAutomationStatus,
  type WorkspaceAutomationToolConfig,
  type WorkspaceAutomationTriggerConfig,
} from "./workspace-automation-types";

export * from "./workspace-automation-types";

type AutomationRow = typeof schema.workspaceAutomations.$inferSelect;
type AutomationRunRow = typeof schema.workspaceAutomationRuns.$inferSelect;

type AutomationAuthor = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export function workspaceAutomationNeedsProject(input: {
  triggerConfig: WorkspaceAutomationTriggerConfig;
  toolConfig: WorkspaceAutomationToolConfig;
}): boolean {
  if (input.triggerConfig.mode === "source_upload") {
    return true;
  }
  if (hasWorkspaceAutomationContentfulWorkflow(input.toolConfig)) {
    return true;
  }
  if (
    hasWorkspaceAutomationCreateNativeTmsJobTool(input.toolConfig) ||
    hasWorkspaceAutomationAssignTranslateWithAgentTool(input.toolConfig)
  ) {
    return true;
  }
  if (
    hasWorkspaceAutomationListIssuesTool(input.toolConfig) ||
    hasWorkspaceAutomationCreateIssueTool(input.toolConfig)
  ) {
    return true;
  }
  return hasWorkspaceAutomationGithubWorkflow(input.toolConfig);
}

function validateWorkspaceAutomationConfig(input: {
  projectId?: string | null;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
}): Result<void, WorkspaceAutomationConfigValidationError> {
  const projectId = readOptionalProjectId(input.projectId);
  if (
    workspaceAutomationNeedsProject({
      triggerConfig: input.triggerConfig,
      toolConfig: input.toolConfig,
    }) &&
    !projectId
  ) {
    return err({
      code: "project_required",
      message: "Choose a Hyperlocalise project for this automation.",
    });
  }

  const githubTools = input.toolConfig.github;
  const githubCommentEnabled = Boolean(input.toolConfig.githubComment?.enabled);
  if (githubTools?.enabled || githubCommentEnabled) {
    if (
      input.repositoryTarget.kind !== "github" ||
      !input.repositoryTarget.githubInstallationRepositoryId
    ) {
      return err({
        code: "github_repository_target_required",
        message: "Enabled GitHub tools require a GitHub repository target.",
      });
    }
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

  if (
    input.triggerConfig.mode === "scheduled" &&
    !hasWorkspaceAutomationGithubAgentTool(input.toolConfig) &&
    !hasWorkspaceAutomationGithubWorkflow(input.toolConfig) &&
    !hasWorkspaceAutomationContentfulWorkflow(input.toolConfig) &&
    !hasWorkspaceAutomationListIssuesTool(input.toolConfig) &&
    !hasWorkspaceAutomationCreateIssueTool(input.toolConfig) &&
    !hasWorkspaceAutomationWebSearchTool(input.toolConfig) &&
    !hasWorkspaceAutomationCrowdinTool(input.toolConfig)
  ) {
    return err({
      code: "scheduled_workflow_required",
      message:
        "Scheduled automations require at least one GitHub, Contentful, Issues, Web Search, or Crowdin workflow tool.",
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

  const createNativeTmsJob = input.toolConfig.createNativeTmsJob;
  if (createNativeTmsJob?.enabled) {
    if (
      !createNativeTmsJob.useProjectTargetLocales &&
      createNativeTmsJob.targetLocales.length === 0
    ) {
      return err({
        code: "create_native_tms_job_target_locales_required",
        message: "Create job requires at least one target locale.",
      });
    }
  }

  if (
    hasWorkspaceAutomationAssignTranslateWithAgentTool(input.toolConfig) &&
    !hasWorkspaceAutomationCreateNativeTmsJobTool(input.toolConfig)
  ) {
    return err({
      code: "assign_translate_with_agent_requires_create_job",
      message: "Translate with agent requires Create job to be enabled.",
    });
  }

  if (
    input.triggerConfig.mode === "source_upload" &&
    !hasWorkspaceAutomationCreateNativeTmsJobTool(input.toolConfig)
  ) {
    return err({
      code: "source_upload_workflow_required",
      message: "Source upload triggers require Create job to be enabled.",
    });
  }

  const mcpTools = input.toolConfig.mcp;
  if (mcpTools?.enabled && !mcpTools.connectionId) {
    return err({
      code: "mcp_connection_required",
      message: "Enabled MCP Server tools require an MCP server connection.",
    });
  }

  const semrushTools = input.toolConfig.semrush;
  if (semrushTools?.enabled && !semrushTools.connectionId) {
    return err({
      code: "semrush_connection_required",
      message: "Enabled Semrush tools require a Semrush connection.",
    });
  }

  const ahrefsTools = input.toolConfig.ahrefs;
  if (ahrefsTools?.enabled && !ahrefsTools.connectionId) {
    return err({
      code: "ahrefs_connection_required",
      message: "Enabled Ahrefs tools require an Ahrefs connection.",
    });
  }

  const crowdinTools = input.toolConfig.crowdin;
  if (crowdinTools?.enabled && !readOptionalProjectId(crowdinTools.projectId)) {
    return err({
      code: "crowdin_project_required",
      message: "Enabled Crowdin tools require a Crowdin-linked project.",
    });
  }

  return ok(undefined);
}

export async function validateWorkspaceAutomationIntegrations(input: {
  organizationId: string;
  toolConfig: WorkspaceAutomationToolConfig;
  db?: DatabaseClient;
  /**
   * When true, locks the selected Semrush connection row for update so a
   * concurrent delete cannot remove it before the automation write commits.
   * Requires `db` to be a transaction client.
   */
  lockSemrushConnection?: boolean;
  /**
   * When true, locks the selected Ahrefs connection row for update so a
   * concurrent delete cannot remove it before the automation write commits.
   * Requires `db` to be a transaction client.
   */
  lockAhrefsConnection?: boolean;
}): Promise<Result<void, WorkspaceAutomationConfigValidationError>> {
  const database = input.db ?? db;

  if (input.toolConfig.slack?.enabled) {
    const [connector] = await database
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
    const [connector] = await database
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

  if (input.toolConfig.mcp?.enabled) {
    const connectionId = input.toolConfig.mcp.connectionId;
    if (!connectionId) {
      return err({
        code: "mcp_connection_required",
        message: "Enabled MCP Server tools require an MCP server connection.",
      });
    }

    const [connection] = await database
      .select({
        id: schema.mcpServerConnections.id,
        enabled: schema.mcpServerConnections.enabled,
      })
      .from(schema.mcpServerConnections)
      .where(
        and(
          eq(schema.mcpServerConnections.organizationId, input.organizationId),
          eq(schema.mcpServerConnections.id, connectionId),
        ),
      )
      .limit(1);

    if (!connection) {
      return err({
        code: "mcp_connection_not_found",
        message: "The selected MCP server connection was not found. Choose another connection.",
      });
    }

    if (!connection.enabled) {
      return err({
        code: "mcp_not_connected",
        message: "Enable the selected MCP server connection in Integrations before using it.",
      });
    }
  }

  if (input.toolConfig.semrush?.enabled) {
    const connectionId = input.toolConfig.semrush.connectionId;
    if (!connectionId) {
      return err({
        code: "semrush_connection_required",
        message: "Enabled Semrush tools require a Semrush connection.",
      });
    }

    const connection = input.lockSemrushConnection
      ? await lockSemrushConnectionForUpdate({
          organizationId: input.organizationId,
          connectionId,
          db: database,
        })
      : ((
          await database
            .select({
              id: schema.semrushConnections.id,
              enabled: schema.semrushConnections.enabled,
              validationStatus: schema.semrushConnections.validationStatus,
            })
            .from(schema.semrushConnections)
            .where(
              and(
                eq(schema.semrushConnections.organizationId, input.organizationId),
                eq(schema.semrushConnections.id, connectionId),
              ),
            )
            .limit(1)
        )[0] ?? null);

    if (!connection) {
      return err({
        code: "semrush_connection_not_found",
        message: "The selected Semrush connection was not found. Choose another connection.",
      });
    }

    if (!connection.enabled || connection.validationStatus !== "valid") {
      return err({
        code: "semrush_not_connected",
        message: "Enable the selected Semrush connection in Integrations before using it.",
      });
    }
  }

  if (input.toolConfig.ahrefs?.enabled) {
    const connectionId = input.toolConfig.ahrefs.connectionId;
    if (!connectionId) {
      return err({
        code: "ahrefs_connection_required",
        message: "Enabled Ahrefs tools require an Ahrefs connection.",
      });
    }

    const connection = input.lockAhrefsConnection
      ? await lockAhrefsConnectionForUpdate({
          organizationId: input.organizationId,
          connectionId,
          db: database,
        })
      : ((
          await database
            .select({
              id: schema.ahrefsConnections.id,
              enabled: schema.ahrefsConnections.enabled,
              validationStatus: schema.ahrefsConnections.validationStatus,
            })
            .from(schema.ahrefsConnections)
            .where(
              and(
                eq(schema.ahrefsConnections.organizationId, input.organizationId),
                eq(schema.ahrefsConnections.id, connectionId),
              ),
            )
            .limit(1)
        )[0] ?? null);

    if (!connection) {
      return err({
        code: "ahrefs_connection_not_found",
        message: "The selected Ahrefs connection was not found. Choose another connection.",
      });
    }

    if (!connection.enabled || connection.validationStatus !== "valid") {
      return err({
        code: "ahrefs_not_connected",
        message: "Enable the selected Ahrefs connection in Integrations before using it.",
      });
    }
  }

  if (input.toolConfig.crowdin?.enabled) {
    const projectId = readOptionalProjectId(input.toolConfig.crowdin.projectId);
    if (!projectId) {
      return err({
        code: "crowdin_project_required",
        message: "Enabled Crowdin tools require a Crowdin-linked project.",
      });
    }

    const encodedProject = parseProviderProjectId(projectId);
    if (encodedProject) {
      if (encodedProject.providerKind !== "crowdin") {
        return err({
          code: "crowdin_project_not_linked",
          message: "The selected project is not linked to Crowdin. Choose a Crowdin project.",
        });
      }
    } else {
      const [project] = await database
        .select({
          id: schema.projects.id,
          source: schema.projects.source,
          externalProviderKind: schema.projects.externalProviderKind,
        })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.organizationId, input.organizationId),
            eq(schema.projects.id, projectId),
          ),
        )
        .limit(1);

      if (!project) {
        return err({
          code: "crowdin_project_not_found",
          message: "The selected Crowdin project was not found. Choose another project.",
        });
      }

      if (project.source !== "external_tms" || project.externalProviderKind !== "crowdin") {
        return err({
          code: "crowdin_project_not_linked",
          message: "The selected project is not linked to Crowdin. Choose a Crowdin project.",
        });
      }
    }

    const credential = await crowdinAuth.loadOrganizationCredential(input.organizationId);
    if (!credential) {
      return err({
        code: "crowdin_not_connected",
        message: "Connect Crowdin in Integrations before using Crowdin review tools.",
      });
    }
  }

  return ok(undefined);
}

function serializeAutomation(
  row: AutomationRow,
  author?: AutomationAuthor | null,
): WorkspaceAutomationRecord {
  const rawToolConfig = (row.toolConfig ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    organizationId: row.organizationId,
    authorUserId: row.authorUserId,
    authorName: formatWorkspaceAutomationAuthorName(author),
    status: row.status,
    name: row.name,
    instructions: row.instructions,
    projectId:
      readOptionalProjectId(row.projectId) ??
      hoistLegacyWorkspaceAutomationProjectId(rawToolConfig),
    triggerConfig: normalizeTriggerConfig(row.triggerConfig),
    repositoryTarget: normalizeRepositoryTarget(row.repositoryTarget),
    toolConfig: normalizeToolConfig(rawToolConfig),
    configVersion: row.configVersion,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeAutomationWithAuthor(row: {
  automation: AutomationRow;
  authorFirstName: string | null;
  authorLastName: string | null;
  authorEmail: string | null;
}): WorkspaceAutomationRecord {
  return serializeAutomation(row.automation, {
    firstName: row.authorFirstName,
    lastName: row.authorLastName,
    email: row.authorEmail,
  });
}

const automationAuthorSelect = {
  automation: schema.workspaceAutomations,
  authorFirstName: schema.users.firstName,
  authorLastName: schema.users.lastName,
  authorEmail: schema.users.email,
};

async function loadAutomationAuthor(
  userId: string | null,
  database: DatabaseClient = db,
): Promise<AutomationAuthor | null> {
  if (!userId) {
    return null;
  }

  const [user] = await database
    .select({
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  return user ?? null;
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

function shouldLockSemrushConnectionForToolConfig(
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  return Boolean(toolConfig.semrush?.enabled && toolConfig.semrush.connectionId);
}

function shouldLockAhrefsConnectionForToolConfig(
  toolConfig: WorkspaceAutomationToolConfig,
): boolean {
  return Boolean(toolConfig.ahrefs?.enabled && toolConfig.ahrefs.connectionId);
}

export async function createWorkspaceAutomation(input: {
  organizationId: string;
  authorUserId?: string | null;
  status?: WorkspaceAutomationStatus;
  name: string;
  instructions: string;
  projectId?: string | null;
  triggerConfig?: WorkspaceAutomationTriggerConfig;
  repositoryTarget?: WorkspaceAutomationRepositoryTarget;
  toolConfig?: WorkspaceAutomationToolConfig;
  nextRunAt?: Date | null;
  db?: DatabaseClient;
}): Promise<Result<WorkspaceAutomationRecord, WorkspaceAutomationConfigValidationError>> {
  const config = workspaceAutomationConfigSchema.parse({
    projectId: input.projectId ?? undefined,
    triggerConfig: input.triggerConfig ?? {},
    repositoryTarget: input.repositoryTarget ?? {},
    toolConfig: input.toolConfig ?? {},
  });
  const projectId = readOptionalProjectId(config.projectId);
  const validation = validateWorkspaceAutomationConfig({
    projectId,
    triggerConfig: config.triggerConfig,
    repositoryTarget: config.repositoryTarget,
    toolConfig: config.toolConfig,
  });
  if (isErr(validation)) {
    return err(validation.error);
  }

  const draftAutomation: WorkspaceAutomationRecord = {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    authorUserId: input.authorUserId ?? null,
    authorName: null,
    status: input.status ?? "active",
    name: input.name,
    instructions: input.instructions,
    projectId,
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

  const lockSemrushConnection = shouldLockSemrushConnectionForToolConfig(config.toolConfig);
  const lockAhrefsConnection = shouldLockAhrefsConnectionForToolConfig(config.toolConfig);
  const needsConnectionLock = lockSemrushConnection || lockAhrefsConnection;

  const write = async (
    database: DatabaseClient,
  ): Promise<Result<WorkspaceAutomationRecord, WorkspaceAutomationConfigValidationError>> => {
    const integrationValidation = await validateWorkspaceAutomationIntegrations({
      organizationId: input.organizationId,
      toolConfig: config.toolConfig,
      db: database,
      lockSemrushConnection,
      lockAhrefsConnection,
    });
    if (isErr(integrationValidation)) {
      return err(integrationValidation.error);
    }

    const [row] = await database
      .insert(schema.workspaceAutomations)
      .values({
        organizationId: input.organizationId,
        authorUserId: input.authorUserId ?? null,
        status: input.status ?? "active",
        name: input.name,
        instructions: input.instructions,
        projectId,
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

    return ok(serializeAutomation(row, await loadAutomationAuthor(row.authorUserId, database)));
  };

  if (input.db) {
    return write(input.db);
  }
  if (needsConnectionLock) {
    return db.transaction(write);
  }
  return write(db);
}

export async function updateWorkspaceAutomation(input: {
  automationId: string;
  organizationId: string;
  status?: WorkspaceAutomationStatus;
  name?: string;
  instructions?: string;
  projectId?: string | null;
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
    input.projectId !== undefined ||
    input.triggerConfig !== undefined ||
    input.repositoryTarget !== undefined ||
    input.toolConfig !== undefined;

  const config = configChanged
    ? workspaceAutomationConfigSchema.parse({
        projectId:
          input.projectId !== undefined
            ? (input.projectId ?? undefined)
            : (existing.projectId ?? undefined),
        triggerConfig: input.triggerConfig ?? existing.triggerConfig,
        repositoryTarget: input.repositoryTarget ?? existing.repositoryTarget,
        toolConfig: input.toolConfig ?? existing.toolConfig,
      })
    : {
        projectId: existing.projectId ?? undefined,
        triggerConfig: existing.triggerConfig,
        repositoryTarget: existing.repositoryTarget,
        toolConfig: existing.toolConfig,
      };
  const projectId = readOptionalProjectId(config.projectId);

  if (configChanged) {
    const validation = validateWorkspaceAutomationConfig({
      projectId,
      triggerConfig: config.triggerConfig,
      repositoryTarget: config.repositoryTarget,
      toolConfig: config.toolConfig,
    });
    if (isErr(validation)) {
      return err(validation.error);
    }
  }

  const mergedAutomation: WorkspaceAutomationRecord = {
    ...existing,
    status: input.status ?? existing.status,
    name: input.name ?? existing.name,
    instructions: input.instructions ?? existing.instructions,
    projectId,
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

  const lockSemrushConnection =
    configChanged && shouldLockSemrushConnectionForToolConfig(config.toolConfig);
  const lockAhrefsConnection =
    configChanged && shouldLockAhrefsConnectionForToolConfig(config.toolConfig);
  const needsConnectionLock = lockSemrushConnection || lockAhrefsConnection;

  const write = async (
    database: DatabaseClient,
  ): Promise<
    Result<WorkspaceAutomationRecord | null, WorkspaceAutomationConfigValidationError>
  > => {
    if (configChanged) {
      const integrationValidation = await validateWorkspaceAutomationIntegrations({
        organizationId: input.organizationId,
        toolConfig: config.toolConfig,
        db: database,
        lockSemrushConnection,
        lockAhrefsConnection,
      });
      if (isErr(integrationValidation)) {
        return err(integrationValidation.error);
      }
    }

    const [row] = await database
      .update(schema.workspaceAutomations)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
        ...(configChanged
          ? {
              projectId,
              // Re-persist normalized tool config so legacy per-tool projectIds are stripped.
              toolConfig: config.toolConfig,
            }
          : {}),
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

    return ok(
      row ? serializeAutomation(row, await loadAutomationAuthor(row.authorUserId, database)) : null,
    );
  };

  if (input.db) {
    return write(input.db);
  }
  if (needsConnectionLock) {
    return db.transaction(write);
  }
  return write(db);
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
    .select(automationAuthorSelect)
    .from(schema.workspaceAutomations)
    .leftJoin(schema.users, eq(schema.workspaceAutomations.authorUserId, schema.users.id))
    .where(
      and(
        eq(schema.workspaceAutomations.id, input.automationId),
        eq(schema.workspaceAutomations.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  return row ? serializeAutomationWithAuthor(row) : null;
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
    .select(automationAuthorSelect)
    .from(schema.workspaceAutomations)
    .leftJoin(schema.users, eq(schema.workspaceAutomations.authorUserId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.workspaceAutomations.createdAt))
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);

  return rows.map(serializeAutomationWithAuthor);
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
        sql`(
          ${schema.workspaceAutomations.toolConfig}->'createNativeTmsJob'->>'enabled' = 'true'
          OR ${schema.workspaceAutomations.toolConfig}->'translation'->>'enabled' = 'true'
        )`,
        or(
          eq(schema.workspaceAutomations.projectId, input.projectId),
          and(
            isNull(schema.workspaceAutomations.projectId),
            sql`(
              ${schema.workspaceAutomations.toolConfig}->'createNativeTmsJob'->>'projectId' = ${input.projectId}
              OR ${schema.workspaceAutomations.toolConfig}->'translation'->>'projectId' = ${input.projectId}
            )`,
          ),
        ),
      ),
    )
    .orderBy(desc(schema.workspaceAutomations.createdAt))
    .limit(input.limit ?? 20);

  return rows.map((row) => serializeAutomation(row));
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
    .orderBy(asc(schema.workspaceAutomations.nextRunAt), asc(schema.workspaceAutomations.id))
    .limit(limit);

  return rows.map(({ automation, repository }) => ({
    automation: serializeAutomation(automation),
    repository,
  }));
}

export async function listDueContentfulWorkspaceAutomations(input: {
  now?: Date;
  limit?: number;
  organizationId?: string;
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
        ...(input.organizationId
          ? [eq(schema.workspaceAutomations.organizationId, input.organizationId)]
          : []),
      ),
    )
    .orderBy(asc(schema.workspaceAutomations.nextRunAt), asc(schema.workspaceAutomations.id))
    .limit(limit);

  return rows
    .map((row) => serializeAutomation(row))
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

export async function enqueueWorkspaceAutomationRunOnce(input: {
  runId: string;
  organizationId: string;
  enqueue: () => Promise<void>;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        outputSummary: schema.workspaceAutomationRuns.outputSummary,
      })
      .from(schema.workspaceAutomationRuns)
      .where(
        and(
          eq(schema.workspaceAutomationRuns.id, input.runId),
          eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");

    if (!run) {
      throw new Error("workspace_automation_run_not_found");
    }

    if (
      typeof run.outputSummary.orchestratorEnqueuedAt === "string" &&
      run.outputSummary.orchestratorEnqueuedAt.length > 0
    ) {
      return false;
    }

    await input.enqueue();

    await tx
      .update(schema.workspaceAutomationRuns)
      .set({
        outputSummary: {
          ...run.outputSummary,
          orchestratorEnqueuedAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workspaceAutomationRuns.id, input.runId),
          eq(schema.workspaceAutomationRuns.organizationId, input.organizationId),
        ),
      );

    return true;
  });
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
