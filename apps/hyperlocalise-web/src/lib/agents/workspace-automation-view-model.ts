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
import {
  DEFAULT_WORKSPACE_AUTOMATION_MODEL,
  resolveWorkspaceAutomationGithubEvents,
  resolveWorkspaceAutomationModel,
  type WorkspaceAutomationGithubToolMode,
  type WorkspaceAutomationGithubTriggerEvent,
  type WorkspaceAutomationModel,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationRepositoryTarget,
  type WorkspaceAutomationToolConfig,
  type WorkspaceAutomationTriggerConfig,
  type WorkspaceAutomationWebSearchProvider,
} from "./workspace-automation-types";
import { parseSlackConversationId } from "./slack/channel-query";
import {
  getWorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplate,
} from "./workspace-automation-templates";

export type WorkspaceAutomationTriggerMode =
  | "manual"
  | "scheduled"
  | "github"
  | "contentful"
  | "source_upload";

export type WorkspaceAutomationFormState = {
  name: string;
  instructions: string;
  model: WorkspaceAutomationModel;
  status: "active" | "paused";
  projectId: string;
  triggerMode: WorkspaceAutomationTriggerMode;
  pushBranches: string[];
  githubEvents: WorkspaceAutomationGithubTriggerEvent[];
  scheduledCadence: "hourly" | "daily" | "weekly";
  scheduledHourUtc: number;
  scheduledDayOfWeek: number;
  scheduledTimezone: string;
  repositoryTargetKind: "none" | "github";
  githubInstallationRepositoryId: string;
  githubEnabled: boolean;
  githubMode: WorkspaceAutomationGithubToolMode;
  pushSourceEnabled: boolean;
  pullTranslationsEnabled: boolean;
  validationEnabled: boolean;
  slackEnabled: boolean;
  slackChannelId: string;
  emailEnabled: boolean;
  emailRecipients: string[];
  githubCommentEnabled: boolean;
  contentfulEnabled: boolean;
  contentfulConnectionId: string;
  contentfulSourceLocale: string;
  contentfulEntryId: string;
  contentfulContentTypeIds: string[];
  contentfulTargetLocales: string[];
  contentfulFieldMode: "auto" | "configured";
  contentfulOverwriteDraftLocales: boolean;
  contentfulRunQa: boolean;
  contentfulWriteDrafts: boolean;
  createNativeTmsJobEnabled: boolean;
  createNativeTmsJobUseProjectTargetLocales: boolean;
  createNativeTmsJobTargetLocales: string[];
  assignTranslateWithAgentEnabled: boolean;
  listIssuesEnabled: boolean;
  createIssueEnabled: boolean;
  knowledgeEnabled: boolean;
  knowledgeAllowUpdates: boolean;
  mcpEnabled: boolean;
  mcpConnectionId: string;
  semrushEnabled: boolean;
  semrushConnectionId: string;
  ahrefsEnabled: boolean;
  ahrefsConnectionId: string;
  crowdinEnabled: boolean;
  crowdinProjectId: string;
  webSearchEnabled: boolean;
  webSearchProvider: WorkspaceAutomationWebSearchProvider;
};

function workspaceAutomationFormNeedsProject(form: WorkspaceAutomationFormState): boolean {
  if (form.triggerMode === "source_upload") {
    return true;
  }
  if (form.contentfulEnabled) {
    return true;
  }
  if (form.createNativeTmsJobEnabled || form.assignTranslateWithAgentEnabled) {
    return true;
  }
  if (form.listIssuesEnabled || form.createIssueEnabled) {
    return true;
  }
  return form.githubEnabled && form.githubMode === "sync";
}

export type WorkspaceAutomationFieldErrors = Partial<
  Record<
    | "name"
    | "instructions"
    | "model"
    | "projectId"
    | "githubRepository"
    | "trigger"
    | "pushBranches"
    | "githubEvents"
    | "slackChannelId"
    | "emailRecipients"
    | "contentfulConnectionId"
    | "contentfulTargetLocales"
    | "contentfulEntryId"
    | "createNativeTmsJobTargetLocales"
    | "mcpConnectionId"
    | "semrushConnectionId"
    | "ahrefsConnectionId"
    | "crowdinProjectId"
    | "form",
    string
  >
>;

export const WORKSPACE_AUTOMATION_API_ERROR_MESSAGES: Record<string, string> = {
  github_repository_target_required: "Choose a GitHub repository before enabling GitHub tools.",
  project_required: "Choose a Hyperlocalise project for this automation.",
  github_project_required: "Choose a Hyperlocalise project for this automation.",
  contentful_project_required: "Choose a Hyperlocalise project for this automation.",
  translation_project_required: "Choose a Hyperlocalise project for this automation.",
  github_trigger_required: "Choose a schedule or GitHub push trigger for GitHub workflows.",
  github_agent_trigger_required:
    "Use GitHub repo automations with a scheduled, manual, or GitHub push trigger.",
  github_push_branches_required: "Add at least one branch pattern for GitHub triggers.",
  github_events_required: "Choose at least one GitHub event.",
  scheduled_workflow_required:
    "Scheduled automations require at least one GitHub, Contentful, Issues, Web Search, or Crowdin workflow tool.",
  slack_not_connected: "Connect Slack in Integrations before enabling Slack notifications.",
  slack_channel_required: "Choose a Slack channel for notifications.",
  email_not_connected: "Enable the email agent in Integrations before using email notifications.",
  email_recipients_required: "Add at least one email recipient.",
  contentful_connection_required: "Choose a Contentful connection.",
  contentful_target_locales_required: "Add at least one target locale for Contentful translation.",
  contentful_entry_id_required: "Scheduled Contentful automations need an entry ID.",
  create_native_tms_job_target_locales_required: "Add at least one target locale for Create job.",
  assign_translate_with_agent_requires_create_job:
    "Translate with agent requires Create job to be enabled.",
  source_upload_workflow_required: "Source upload triggers require Create job to be enabled.",
  mcp_connection_required: "Choose an MCP server connection.",
  mcp_connection_not_found:
    "The selected MCP server connection was not found. Choose another connection.",
  mcp_not_connected: "Enable the selected MCP server connection in Integrations before using it.",
  semrush_connection_required: "Choose a Semrush connection.",
  semrush_connection_not_found:
    "The selected Semrush connection was not found. Choose another connection.",
  semrush_not_connected: "Enable the selected Semrush connection in Integrations before using it.",
  ahrefs_connection_required: "Choose an Ahrefs connection.",
  ahrefs_connection_not_found:
    "The selected Ahrefs connection was not found. Choose another connection.",
  ahrefs_not_connected: "Enable the selected Ahrefs connection in Integrations before using it.",
  crowdin_project_required: "Choose a Crowdin-linked project for Crowdin review.",
  crowdin_project_not_found: "The selected Crowdin project was not found. Choose another project.",
  crowdin_project_not_linked:
    "The selected project is not linked to Crowdin. Choose a Crowdin project.",
  crowdin_not_connected: "Connect Crowdin in Integrations before using Crowdin review tools.",
  github_repository_not_enabled: "Enable this repository before configuring automation.",
  github_repository_archived: "Archived repositories cannot use automations.",
  project_not_found: "The selected project could not be found.",
};

export function selectableAutomationRepositories<
  T extends { id: string; enabled: boolean; archived: boolean },
>(repositories: T[], selectedId = ""): T[] {
  return repositories.filter(
    (repository) =>
      (repository.enabled && !repository.archived) ||
      (selectedId.length > 0 && repository.id === selectedId),
  );
}

export function createDefaultWorkspaceAutomationFormState(): WorkspaceAutomationFormState {
  return {
    name: "",
    instructions: "",
    model: DEFAULT_WORKSPACE_AUTOMATION_MODEL,
    status: "active",
    projectId: "",
    triggerMode: "manual",
    pushBranches: ["main"],
    githubEvents: ["push"],
    scheduledCadence: "daily",
    scheduledHourUtc: 22,
    scheduledDayOfWeek: 1,
    scheduledTimezone: "UTC",
    repositoryTargetKind: "none",
    githubInstallationRepositoryId: "",
    githubEnabled: false,
    githubMode: "sync",
    pushSourceEnabled: false,
    pullTranslationsEnabled: false,
    validationEnabled: false,
    slackEnabled: false,
    slackChannelId: "",
    emailEnabled: false,
    emailRecipients: [],
    githubCommentEnabled: false,
    contentfulEnabled: false,
    contentfulConnectionId: "",
    contentfulSourceLocale: "en",
    contentfulEntryId: "",
    contentfulContentTypeIds: [],
    contentfulTargetLocales: [],
    contentfulFieldMode: "auto",
    contentfulOverwriteDraftLocales: false,
    contentfulRunQa: true,
    contentfulWriteDrafts: true,
    createNativeTmsJobEnabled: false,
    createNativeTmsJobUseProjectTargetLocales: true,
    createNativeTmsJobTargetLocales: [],
    assignTranslateWithAgentEnabled: false,
    listIssuesEnabled: false,
    createIssueEnabled: false,
    knowledgeEnabled: false,
    knowledgeAllowUpdates: false,
    mcpEnabled: false,
    mcpConnectionId: "",
    semrushEnabled: false,
    semrushConnectionId: "",
    ahrefsEnabled: false,
    ahrefsConnectionId: "",
    crowdinEnabled: false,
    crowdinProjectId: "",
    webSearchEnabled: false,
    webSearchProvider: "auto",
  };
}

export function createWorkspaceAutomationFormStateFromRecord(
  automation: WorkspaceAutomationRecord,
): WorkspaceAutomationFormState {
  const github = automation.toolConfig.github;
  const slack = automation.toolConfig.slack;
  const email = automation.toolConfig.email;
  const contentful = automation.toolConfig.contentful;
  const createNativeTmsJob = automation.toolConfig.createNativeTmsJob;
  const assignTranslateWithAgent = automation.toolConfig.assignTranslateWithAgent;
  const listIssues = automation.toolConfig.listIssues;
  const createIssue = automation.toolConfig.createIssue;
  const knowledge = automation.toolConfig.knowledge;
  const mcp = automation.toolConfig.mcp;
  const semrush = automation.toolConfig.semrush;
  const ahrefs = automation.toolConfig.ahrefs;
  const crowdin = automation.toolConfig.crowdin;
  const webSearch = automation.toolConfig.webSearch;

  return {
    name: automation.name,
    instructions: automation.instructions,
    model: resolveWorkspaceAutomationModel(automation.model),
    status: automation.status === "paused" ? "paused" : "active",
    projectId: automation.projectId ?? "",
    triggerMode: automation.triggerConfig.mode,
    pushBranches:
      automation.triggerConfig.mode === "github" && automation.triggerConfig.branches?.length
        ? [...automation.triggerConfig.branches]
        : ["main"],
    githubEvents: resolveWorkspaceAutomationGithubEvents(
      automation.triggerConfig.mode === "github" ? automation.triggerConfig.events : undefined,
    ),
    scheduledCadence:
      automation.triggerConfig.mode === "scheduled" && automation.triggerConfig.schedule
        ? automation.triggerConfig.schedule.cadence
        : "daily",
    scheduledHourUtc:
      automation.triggerConfig.mode === "scheduled" && automation.triggerConfig.schedule
        ? (automation.triggerConfig.schedule.hourUtc ?? 22)
        : 22,
    scheduledDayOfWeek:
      automation.triggerConfig.mode === "scheduled" && automation.triggerConfig.schedule
        ? (automation.triggerConfig.schedule.dayOfWeek ?? 1)
        : 1,
    scheduledTimezone:
      automation.triggerConfig.mode === "scheduled" && automation.triggerConfig.schedule
        ? automation.triggerConfig.schedule.timezone
        : "UTC",
    repositoryTargetKind: automation.repositoryTarget.kind,
    githubInstallationRepositoryId:
      automation.repositoryTarget.githubInstallationRepositoryId ?? "",
    githubEnabled: Boolean(github?.enabled),
    githubMode: github?.mode ?? "sync",
    pushSourceEnabled: Boolean(github?.pushSource),
    pullTranslationsEnabled: Boolean(github?.pullTranslations),
    validationEnabled: Boolean(github?.validation),
    slackEnabled: Boolean(slack?.enabled),
    slackChannelId: slack?.channelId ?? "",
    emailEnabled: Boolean(email?.enabled),
    emailRecipients: email?.recipients ? [...email.recipients] : [],
    githubCommentEnabled: Boolean(automation.toolConfig.githubComment?.enabled),
    contentfulEnabled: Boolean(contentful?.enabled),
    contentfulConnectionId: contentful?.connectionId ?? "",
    contentfulSourceLocale: contentful?.sourceLocale ?? "en",
    contentfulEntryId: contentful?.entryId ?? "",
    contentfulContentTypeIds: contentful?.contentTypeIds ? [...contentful.contentTypeIds] : [],
    contentfulTargetLocales: contentful?.targetLocales ? [...contentful.targetLocales] : [],
    contentfulFieldMode: contentful?.fieldMode ?? "auto",
    contentfulOverwriteDraftLocales: Boolean(contentful?.overwriteDraftLocales),
    contentfulRunQa: contentful?.runQa ?? true,
    contentfulWriteDrafts: contentful?.writeDrafts ?? true,
    createNativeTmsJobEnabled: Boolean(createNativeTmsJob?.enabled),
    createNativeTmsJobUseProjectTargetLocales: createNativeTmsJob?.useProjectTargetLocales ?? true,
    createNativeTmsJobTargetLocales: createNativeTmsJob?.targetLocales
      ? [...createNativeTmsJob.targetLocales]
      : [],
    assignTranslateWithAgentEnabled: Boolean(assignTranslateWithAgent?.enabled),
    listIssuesEnabled: Boolean(listIssues?.enabled),
    createIssueEnabled: Boolean(createIssue?.enabled),
    knowledgeEnabled: Boolean(knowledge?.enabled),
    knowledgeAllowUpdates: Boolean(knowledge?.allowUpdates),
    mcpEnabled: Boolean(mcp?.enabled),
    mcpConnectionId: mcp?.connectionId ?? "",
    semrushEnabled: Boolean(semrush?.enabled),
    semrushConnectionId: semrush?.connectionId ?? "",
    ahrefsEnabled: Boolean(ahrefs?.enabled),
    ahrefsConnectionId: ahrefs?.connectionId ?? "",
    crowdinEnabled: Boolean(crowdin?.enabled),
    crowdinProjectId: crowdin?.projectId ?? "",
    webSearchEnabled: Boolean(webSearch?.enabled),
    webSearchProvider: webSearch?.provider ?? "auto",
  };
}

export function createWorkspaceAutomationFormStateFromTemplate(
  templateId: string,
  templates?: WorkspaceAutomationTemplate[],
): WorkspaceAutomationFormState | null {
  const template = getWorkspaceAutomationTemplate(templateId, templates);
  if (!template?.activatable) {
    return null;
  }

  return applyTemplateToWorkspaceAutomationFormState(
    createDefaultWorkspaceAutomationFormState(),
    template,
  );
}

export function applyTemplateToWorkspaceAutomationFormState(
  base: WorkspaceAutomationFormState,
  template: WorkspaceAutomationTemplate,
): WorkspaceAutomationFormState {
  return {
    ...base,
    ...template.defaultForm,
    name: template.defaultForm.name ?? template.name,
    instructions: template.defaultForm.instructions ?? template.instructions,
    pushBranches: template.defaultForm.pushBranches ?? base.pushBranches,
    githubEvents: template.defaultForm.githubEvents ?? base.githubEvents,
    emailRecipients: template.defaultForm.emailRecipients ?? base.emailRecipients,
    contentfulContentTypeIds:
      template.defaultForm.contentfulContentTypeIds ?? base.contentfulContentTypeIds,
    contentfulTargetLocales:
      template.defaultForm.contentfulTargetLocales ?? base.contentfulTargetLocales,
  };
}

export function applyWorkspaceAutomationProjectSelection(
  form: WorkspaceAutomationFormState,
  projectId: string,
  project?: { sourceLocale: string | null; targetLocales: string[] },
): WorkspaceAutomationFormState {
  const next: WorkspaceAutomationFormState = {
    ...form,
    projectId,
  };

  if (form.contentfulEnabled && project) {
    next.contentfulSourceLocale = project.sourceLocale ?? form.contentfulSourceLocale;
    next.contentfulTargetLocales =
      project.targetLocales.length > 0 && form.contentfulTargetLocales.length === 0
        ? [...project.targetLocales]
        : form.contentfulTargetLocales.filter((locale) => project.targetLocales.includes(locale));
  }

  return next;
}

export function formStateToWorkspaceAutomationPayload(form: WorkspaceAutomationFormState): {
  name: string;
  instructions: string;
  model: WorkspaceAutomationModel;
  status: "active" | "paused";
  projectId?: string;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
} {
  const triggerConfig: WorkspaceAutomationTriggerConfig =
    form.triggerMode === "scheduled"
      ? {
          mode: "scheduled",
          schedule: {
            cadence: form.scheduledCadence,
            hourUtc: form.scheduledHourUtc,
            dayOfWeek: form.scheduledCadence === "weekly" ? form.scheduledDayOfWeek : undefined,
            timezone: form.scheduledTimezone.trim() || "UTC",
          },
        }
      : form.triggerMode === "github"
        ? {
            mode: "github",
            branches: form.pushBranches,
            events: resolveWorkspaceAutomationGithubEvents(form.githubEvents),
          }
        : form.triggerMode === "contentful"
          ? { mode: "contentful" }
          : form.triggerMode === "source_upload"
            ? { mode: "source_upload" }
            : { mode: "manual" };

  const repositoryTarget: WorkspaceAutomationRepositoryTarget =
    (form.githubEnabled || form.githubCommentEnabled) && form.githubInstallationRepositoryId
      ? {
          kind: "github",
          githubInstallationRepositoryId: form.githubInstallationRepositoryId,
        }
      : { kind: "none" };

  const toolConfig: WorkspaceAutomationToolConfig = {
    ...(form.githubEnabled
      ? {
          github: {
            enabled: true,
            mode: form.githubMode,
            pushSource: form.githubMode === "sync" ? form.pushSourceEnabled : false,
            pullTranslations: form.githubMode === "sync" ? form.pullTranslationsEnabled : false,
            validation: form.githubMode === "sync" ? form.validationEnabled : false,
          },
        }
      : {}),
    ...(form.slackEnabled
      ? {
          slack: {
            enabled: true,
            channelId: form.slackChannelId.trim() || undefined,
          },
        }
      : {}),
    ...(form.emailEnabled
      ? {
          email: {
            enabled: true,
            recipients: form.emailRecipients,
          },
        }
      : {}),
    ...(form.githubCommentEnabled
      ? {
          githubComment: {
            enabled: true,
          },
        }
      : {}),
    ...(form.contentfulEnabled
      ? {
          contentful: {
            enabled: true,
            connectionId: form.contentfulConnectionId || undefined,
            sourceLocale: form.contentfulSourceLocale.trim() || "en",
            entryId: form.contentfulEntryId.trim() || undefined,
            contentTypeIds: form.contentfulContentTypeIds,
            targetLocales: form.contentfulTargetLocales,
            fieldMode: form.contentfulFieldMode,
            overwriteDraftLocales: form.contentfulOverwriteDraftLocales,
            runQa: form.contentfulRunQa,
            writeDrafts: form.contentfulWriteDrafts,
          },
        }
      : {}),
    ...(form.createNativeTmsJobEnabled
      ? {
          createNativeTmsJob: {
            enabled: true,
            useProjectTargetLocales: form.createNativeTmsJobUseProjectTargetLocales,
            targetLocales: form.createNativeTmsJobUseProjectTargetLocales
              ? []
              : form.createNativeTmsJobTargetLocales,
          },
        }
      : {}),
    ...(form.assignTranslateWithAgentEnabled
      ? {
          assignTranslateWithAgent: {
            enabled: true,
          },
        }
      : {}),
    ...(form.listIssuesEnabled
      ? {
          listIssues: {
            enabled: true,
          },
        }
      : {}),
    ...(form.createIssueEnabled
      ? {
          createIssue: {
            enabled: true,
          },
        }
      : {}),
    ...(form.knowledgeEnabled
      ? {
          knowledge: {
            enabled: true,
            // Defense in depth: even if the UI's dependency between the two toggles ever drifts,
            // updates can never be serialized as allowed without recall also being enabled.
            allowUpdates: form.knowledgeAllowUpdates,
          },
        }
      : {}),
    ...(form.mcpEnabled
      ? {
          mcp: {
            enabled: true,
            connectionId: form.mcpConnectionId || undefined,
          },
        }
      : {}),
    ...(form.semrushEnabled
      ? {
          semrush: {
            enabled: true,
            connectionId: form.semrushConnectionId || undefined,
          },
        }
      : {}),
    ...(form.ahrefsEnabled
      ? {
          ahrefs: {
            enabled: true,
            connectionId: form.ahrefsConnectionId || undefined,
          },
        }
      : {}),
    ...(form.crowdinEnabled
      ? {
          crowdin: {
            enabled: true,
            projectId: form.crowdinProjectId.trim() || undefined,
          },
        }
      : {}),
    ...(form.webSearchEnabled
      ? {
          webSearch: {
            enabled: true,
            provider: form.webSearchProvider,
          },
        }
      : {}),
  };

  const projectId = form.projectId.trim() || undefined;

  return {
    name: form.name.trim(),
    instructions: form.instructions.trim(),
    model: resolveWorkspaceAutomationModel(form.model),
    status: form.status,
    ...(projectId ? { projectId } : {}),
    triggerConfig,
    repositoryTarget,
    toolConfig,
  };
}

export function validateWorkspaceAutomationFormState(
  form: WorkspaceAutomationFormState,
): WorkspaceAutomationFieldErrors {
  const errors: WorkspaceAutomationFieldErrors = {};

  if (!form.name.trim()) {
    errors.name = "Name is required.";
  }

  if (!form.instructions.trim()) {
    errors.instructions = "Instructions are required.";
  }

  if (workspaceAutomationFormNeedsProject(form) && !form.projectId.trim()) {
    errors.projectId = "Choose a Hyperlocalise project.";
  }

  if (form.githubEnabled) {
    if (!form.githubInstallationRepositoryId) {
      errors.githubRepository = "Choose a GitHub repository.";
    }

    if (form.githubMode === "sync") {
      if (!form.pushSourceEnabled && !form.pullTranslationsEnabled && !form.validationEnabled) {
        errors.form = "Enable at least one GitHub workflow.";
      }
      if (form.triggerMode === "manual") {
        errors.trigger = "Choose a schedule or GitHub push trigger.";
      }
    }
  } else if (form.githubCommentEnabled && !form.githubInstallationRepositoryId) {
    errors.githubRepository = "Choose a GitHub repository.";
  }

  if (form.triggerMode === "github" && form.pushBranches.length === 0) {
    errors.pushBranches = "Add at least one branch pattern.";
  }

  if (form.triggerMode === "github" && form.githubEvents.length === 0) {
    errors.githubEvents = "Choose at least one GitHub event.";
  }

  if (form.slackEnabled && !parseSlackConversationId(form.slackChannelId)) {
    errors.slackChannelId = "Enter a valid Slack channel ID.";
  }

  if (form.emailEnabled && form.emailRecipients.length === 0) {
    errors.emailRecipients = "Add at least one email recipient.";
  }

  if (form.contentfulEnabled) {
    if (!form.contentfulConnectionId) {
      errors.contentfulConnectionId = "Choose a Contentful connection.";
    }
    if (form.contentfulTargetLocales.length === 0) {
      errors.contentfulTargetLocales = "Add at least one target locale.";
    }
    if (form.triggerMode === "scheduled" && !form.contentfulEntryId.trim()) {
      errors.contentfulEntryId = "Scheduled Contentful automations need an entry ID.";
    }
  }

  if (form.createNativeTmsJobEnabled) {
    if (
      !form.createNativeTmsJobUseProjectTargetLocales &&
      form.createNativeTmsJobTargetLocales.length === 0
    ) {
      errors.createNativeTmsJobTargetLocales = "Add at least one target locale.";
    }
  }

  if (form.assignTranslateWithAgentEnabled && !form.createNativeTmsJobEnabled) {
    errors.form = "Translate with agent requires Create job to be enabled.";
  }

  if (form.triggerMode === "source_upload" && !form.createNativeTmsJobEnabled) {
    errors.trigger = "Source upload triggers require Create job to be enabled.";
  }

  if (form.mcpEnabled && !form.mcpConnectionId) {
    errors.mcpConnectionId = "Choose an MCP server connection.";
  }

  if (form.semrushEnabled && !form.semrushConnectionId) {
    errors.semrushConnectionId = "Choose a Semrush connection.";
  }

  if (form.ahrefsEnabled && !form.ahrefsConnectionId) {
    errors.ahrefsConnectionId = "Choose an Ahrefs connection.";
  }

  if (form.crowdinEnabled && !form.crowdinProjectId.trim()) {
    errors.crowdinProjectId = "Choose a Crowdin-linked project.";
  }

  return errors;
}

export function mapWorkspaceAutomationApiErrorToFieldErrors(
  errorCode: string,
): WorkspaceAutomationFieldErrors {
  const message = WORKSPACE_AUTOMATION_API_ERROR_MESSAGES[errorCode];
  if (!message) {
    return { form: "Unable to save this automation." };
  }

  switch (errorCode) {
    case "github_repository_target_required":
    case "github_repository_not_enabled":
    case "github_repository_archived":
      return { githubRepository: message };
    case "project_required":
    case "github_project_required":
    case "contentful_project_required":
    case "translation_project_required":
    case "project_not_found":
      return { projectId: message };
    case "github_trigger_required":
    case "github_agent_trigger_required":
    case "scheduled_workflow_required":
    case "source_upload_workflow_required":
      return { trigger: message };
    case "github_push_branches_required":
      return { pushBranches: message };
    case "github_events_required":
      return { githubEvents: message };
    case "slack_not_connected":
    case "slack_channel_required":
      return { slackChannelId: message };
    case "email_not_connected":
    case "email_recipients_required":
      return { emailRecipients: message };
    case "contentful_connection_required":
      return { contentfulConnectionId: message };
    case "contentful_target_locales_required":
      return { contentfulTargetLocales: message };
    case "contentful_entry_id_required":
      return { contentfulEntryId: message };
    case "create_native_tms_job_target_locales_required":
      return { createNativeTmsJobTargetLocales: message };
    case "assign_translate_with_agent_requires_create_job":
      return { form: message };
    case "mcp_connection_required":
    case "mcp_connection_not_found":
    case "mcp_not_connected":
      return { mcpConnectionId: message };
    case "semrush_connection_required":
    case "semrush_connection_not_found":
    case "semrush_not_connected":
      return { semrushConnectionId: message };
    case "ahrefs_connection_required":
    case "ahrefs_connection_not_found":
    case "ahrefs_not_connected":
      return { ahrefsConnectionId: message };
    case "crowdin_project_required":
    case "crowdin_project_not_found":
    case "crowdin_project_not_linked":
    case "crowdin_not_connected":
      return { crowdinProjectId: message };
    default:
      return { form: message };
  }
}

export function workspaceAutomationFormSupportsOnDemandRun(
  triggerMode: WorkspaceAutomationTriggerMode,
) {
  return triggerMode === "manual" || triggerMode === "scheduled";
}

export function workspaceAutomationFormHasChanges(
  current: WorkspaceAutomationFormState,
  saved: WorkspaceAutomationFormState,
) {
  return JSON.stringify(current) !== JSON.stringify(saved);
}

export function workspaceAutomationFormCanActivate(form: WorkspaceAutomationFormState) {
  return (
    form.githubEnabled ||
    form.slackEnabled ||
    form.emailEnabled ||
    form.githubCommentEnabled ||
    form.contentfulEnabled ||
    form.createNativeTmsJobEnabled ||
    form.assignTranslateWithAgentEnabled ||
    form.listIssuesEnabled ||
    form.createIssueEnabled ||
    form.mcpEnabled ||
    form.semrushEnabled ||
    form.ahrefsEnabled ||
    form.crowdinEnabled ||
    form.webSearchEnabled
  );
}
