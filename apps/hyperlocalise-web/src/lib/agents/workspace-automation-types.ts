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
import { z } from "zod";

import { optionalProjectIdSchema } from "@/lib/projects/identity/project-id";

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

export const triggerConfigSchema = z
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

export const repositoryTargetSchema = z
  .object({
    kind: z.enum(["none", "github"]).default("none"),
    githubInstallationRepositoryId: z.string().uuid().optional(),
  })
  .default({ kind: "none" });

const githubToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    mode: z.enum(["agent", "sync"]).default("sync"),
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

const githubCommentToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({ enabled: false });

const contentfulToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    connectionId: z.string().uuid().optional(),
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

const createNativeTmsJobToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    useProjectTargetLocales: z.boolean().default(true),
    targetLocales: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  })
  .default({ enabled: false, useProjectTargetLocales: true, targetLocales: [] });

const assignTranslateWithAgentToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({ enabled: false });

const listIssuesToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({ enabled: false });

const createIssueToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
  })
  .default({ enabled: false });

const knowledgeToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    // Lets the automation append to the shared organization Memory.md via the save_memory tool.
    // Meaningless without `enabled`; callers must not treat this as authoritative on its own.
    allowUpdates: z.boolean().default(false),
  })
  .default({ enabled: false, allowUpdates: false });

const mcpToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    connectionId: z.string().uuid().optional(),
  })
  .default({ enabled: false });

const semrushToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    connectionId: z.string().uuid().optional(),
  })
  .default({ enabled: false });

const ahrefsToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    connectionId: z.string().uuid().optional(),
  })
  .default({ enabled: false });

const crowdinToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    projectId: z.string().trim().min(1).max(128).optional(),
  })
  .default({ enabled: false });

export const workspaceAutomationWebSearchProviderSchema = z.enum(["auto", "perplexity", "exa"]);

const webSearchToolConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    provider: workspaceAutomationWebSearchProviderSchema.default("auto"),
  })
  .default({ enabled: false, provider: "auto" });

function migrateLegacyTranslationToolConfig(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { translation: legacyTranslation, ...rest } = value;
  if (!legacyTranslation || typeof legacyTranslation !== "object") {
    return rest;
  }

  const legacy = legacyTranslation as {
    enabled?: unknown;
    useProjectTargetLocales?: unknown;
    targetLocales?: unknown;
  };
  if (!legacy.enabled) {
    return rest;
  }

  const hasCreateNativeTmsJob =
    rest.createNativeTmsJob && typeof rest.createNativeTmsJob === "object";
  const hasAssignTranslateWithAgent =
    rest.assignTranslateWithAgent && typeof rest.assignTranslateWithAgent === "object";

  return {
    ...rest,
    ...(hasCreateNativeTmsJob
      ? {}
      : {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: legacy.useProjectTargetLocales ?? true,
            targetLocales: Array.isArray(legacy.targetLocales) ? legacy.targetLocales : [],
          },
        }),
    ...(hasAssignTranslateWithAgent
      ? {}
      : {
          assignTranslateWithAgent: {
            enabled: true,
          },
        }),
  };
}

const toolConfigObjectSchema = z
  .object({
    github: githubToolConfigSchema.optional(),
    slack: slackToolConfigSchema.optional(),
    email: emailToolConfigSchema.optional(),
    githubComment: githubCommentToolConfigSchema.optional(),
    contentful: contentfulToolConfigSchema.optional(),
    createNativeTmsJob: createNativeTmsJobToolConfigSchema.optional(),
    assignTranslateWithAgent: assignTranslateWithAgentToolConfigSchema.optional(),
    listIssues: listIssuesToolConfigSchema.optional(),
    createIssue: createIssueToolConfigSchema.optional(),
    knowledge: knowledgeToolConfigSchema.optional(),
    mcp: mcpToolConfigSchema.optional(),
    semrush: semrushToolConfigSchema.optional(),
    ahrefs: ahrefsToolConfigSchema.optional(),
    crowdin: crowdinToolConfigSchema.optional(),
    webSearch: webSearchToolConfigSchema.optional(),
  })
  .default({});

export const toolConfigSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return migrateLegacyTranslationToolConfig(value as Record<string, unknown>);
}, toolConfigObjectSchema);

export const workspaceAutomationConfigSchema = z.object({
  projectId: optionalProjectIdSchema,
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
export type WorkspaceAutomationGithubCommentToolConfig = z.infer<
  typeof githubCommentToolConfigSchema
>;
export type WorkspaceAutomationContentfulToolConfig = z.infer<typeof contentfulToolConfigSchema>;
export type WorkspaceAutomationCreateNativeTmsJobToolConfig = z.infer<
  typeof createNativeTmsJobToolConfigSchema
>;
export type WorkspaceAutomationAssignTranslateWithAgentToolConfig = z.infer<
  typeof assignTranslateWithAgentToolConfigSchema
>;
export type WorkspaceAutomationListIssuesToolConfig = z.infer<typeof listIssuesToolConfigSchema>;
export type WorkspaceAutomationCreateIssueToolConfig = z.infer<typeof createIssueToolConfigSchema>;
export type WorkspaceAutomationKnowledgeToolConfig = z.infer<typeof knowledgeToolConfigSchema>;
export type WorkspaceAutomationMcpToolConfig = z.infer<typeof mcpToolConfigSchema>;
export type WorkspaceAutomationSemrushToolConfig = z.infer<typeof semrushToolConfigSchema>;
export type WorkspaceAutomationAhrefsToolConfig = z.infer<typeof ahrefsToolConfigSchema>;
export type WorkspaceAutomationCrowdinToolConfig = z.infer<typeof crowdinToolConfigSchema>;
export type WorkspaceAutomationWebSearchProvider = z.infer<
  typeof workspaceAutomationWebSearchProviderSchema
>;
export type WorkspaceAutomationWebSearchToolConfig = z.infer<typeof webSearchToolConfigSchema>;
export type WorkspaceAutomationToolConfig = z.infer<typeof toolConfigObjectSchema>;

export type WorkspaceAutomationConfigValidationError =
  | {
      code: "github_repository_target_required";
      message: "Enabled GitHub tools require a GitHub repository target.";
    }
  | {
      code: "project_required";
      message: "Choose a Hyperlocalise project for this automation.";
    }
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
      message: "Scheduled automations require at least one GitHub, Contentful, Issues, Web Search, or Crowdin workflow tool.";
    }
  | {
      code: "contentful_connection_required";
      message: "Enabled Contentful tools require a Contentful connection.";
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
      code: "create_native_tms_job_target_locales_required";
      message: "Create job requires at least one target locale.";
    }
  | {
      code: "assign_translate_with_agent_requires_create_job";
      message: "Translate with agent requires Create job to be enabled.";
    }
  | {
      code: "source_upload_workflow_required";
      message: "Source upload triggers require Create job to be enabled.";
    }
  | {
      code: "mcp_connection_required";
      message: "Enabled MCP Server tools require an MCP server connection.";
    }
  | {
      code: "mcp_connection_not_found";
      message: "The selected MCP server connection was not found. Choose another connection.";
    }
  | {
      code: "mcp_not_connected";
      message: "Enable the selected MCP server connection in Integrations before using it.";
    }
  | {
      code: "semrush_connection_required";
      message: "Enabled Semrush tools require a Semrush connection.";
    }
  | {
      code: "semrush_connection_not_found";
      message: "The selected Semrush connection was not found. Choose another connection.";
    }
  | {
      code: "semrush_not_connected";
      message: "Enable the selected Semrush connection in Integrations before using it.";
    }
  | {
      code: "ahrefs_connection_required";
      message: "Enabled Ahrefs tools require an Ahrefs connection.";
    }
  | {
      code: "ahrefs_connection_not_found";
      message: "The selected Ahrefs connection was not found. Choose another connection.";
    }
  | {
      code: "ahrefs_not_connected";
      message: "Enable the selected Ahrefs connection in Integrations before using it.";
    }
  | {
      code: "crowdin_project_required";
      message: "Enabled Crowdin tools require a Crowdin-linked project.";
    }
  | {
      code: "crowdin_project_not_found";
      message: "The selected Crowdin project was not found. Choose another project.";
    }
  | {
      code: "crowdin_project_not_linked";
      message: "The selected project is not linked to Crowdin. Choose a Crowdin project.";
    }
  | {
      code: "crowdin_not_connected";
      message: "Connect Crowdin in Integrations before using Crowdin review tools.";
    };

export function hasWorkspaceAutomationContentfulWorkflow(
  toolConfig: WorkspaceAutomationToolConfig,
) {
  return Boolean(toolConfig.contentful?.enabled);
}

export function hasWorkspaceAutomationCreateNativeTmsJobTool(
  toolConfig: WorkspaceAutomationToolConfig,
) {
  return Boolean(toolConfig.createNativeTmsJob?.enabled);
}

export function hasWorkspaceAutomationAssignTranslateWithAgentTool(
  toolConfig: WorkspaceAutomationToolConfig,
) {
  return Boolean(toolConfig.assignTranslateWithAgent?.enabled);
}

export function hasWorkspaceAutomationListIssuesTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.listIssues?.enabled);
}

export function hasWorkspaceAutomationCreateIssueTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.createIssue?.enabled);
}

export function hasWorkspaceAutomationKnowledgeTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.knowledge?.enabled);
}

// Meaningless without hasWorkspaceAutomationKnowledgeTool — callers must check both, not just this.
export function hasWorkspaceAutomationKnowledgeUpdatesAllowed(
  toolConfig: WorkspaceAutomationToolConfig,
) {
  return Boolean(toolConfig.knowledge?.enabled && toolConfig.knowledge.allowUpdates);
}

export function hasWorkspaceAutomationMcpTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.mcp?.enabled);
}

export function hasWorkspaceAutomationSemrushTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.semrush?.enabled);
}

export function hasWorkspaceAutomationAhrefsTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.ahrefs?.enabled);
}

export function hasWorkspaceAutomationCrowdinTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.crowdin?.enabled);
}

export function hasWorkspaceAutomationWebSearchTool(toolConfig: WorkspaceAutomationToolConfig) {
  return Boolean(toolConfig.webSearch?.enabled);
}

export type WorkspaceAutomationRecord = {
  id: string;
  organizationId: string;
  authorUserId: string | null;
  authorName?: string | null;
  status: WorkspaceAutomationStatus;
  name: string;
  instructions: string;
  projectId: string | null;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
  configVersion: number;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AutomationAuthor = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export function formatWorkspaceAutomationAuthorName(
  author: AutomationAuthor | null | undefined,
): string | null {
  if (!author) {
    return null;
  }

  const name = [author.firstName, author.lastName].filter(Boolean).join(" ").trim();
  if (name.length > 0) {
    return name;
  }

  const email = author.email?.trim();
  return email && email.length > 0 ? email : null;
}

export function readOptionalProjectId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hoistLegacyWorkspaceAutomationProjectId(
  toolConfig: Record<string, unknown> | WorkspaceAutomationToolConfig,
): string | null {
  const rawToolConfig = toolConfig as Record<string, unknown>;
  const contentful =
    rawToolConfig.contentful && typeof rawToolConfig.contentful === "object"
      ? (rawToolConfig.contentful as { projectId?: unknown }).projectId
      : undefined;
  const translation =
    rawToolConfig.translation && typeof rawToolConfig.translation === "object"
      ? (rawToolConfig.translation as { projectId?: unknown }).projectId
      : undefined;
  const github =
    rawToolConfig.github && typeof rawToolConfig.github === "object"
      ? (rawToolConfig.github as { projectId?: unknown }).projectId
      : undefined;

  // Only hoist when every non-empty legacy tool projectId agrees. The pre-header
  // UI let Contentful diverge from the header-owned GitHub/translation pickers;
  // preferring one winner would silently run those tools against the wrong project.
  const distinctProjectIds = [
    ...new Set(
      [contentful, translation, github]
        .map((value) => readOptionalProjectId(value))
        .filter((value): value is string => value !== null),
    ),
  ];
  return distinctProjectIds.length === 1 ? (distinctProjectIds[0] ?? null) : null;
}

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

export function normalizeTriggerConfig(
  value: Record<string, unknown>,
): WorkspaceAutomationTriggerConfig {
  return triggerConfigSchema.parse(value);
}

export function normalizeRepositoryTarget(
  value: Record<string, unknown>,
): WorkspaceAutomationRepositoryTarget {
  return repositoryTargetSchema.parse(value);
}

export function normalizeToolConfig(value: Record<string, unknown>): WorkspaceAutomationToolConfig {
  return toolConfigSchema.parse(value);
}
