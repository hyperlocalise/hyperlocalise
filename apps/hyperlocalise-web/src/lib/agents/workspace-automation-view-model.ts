import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRepositoryTarget,
  WorkspaceAutomationToolConfig,
  WorkspaceAutomationTriggerConfig,
} from "./workspace-automations";
import {
  getWorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplate,
} from "./workspace-automation-templates";

export type WorkspaceAutomationTriggerMode = "manual" | "scheduled" | "github" | "contentful";

export type WorkspaceAutomationFormState = {
  name: string;
  instructions: string;
  status: "active" | "paused";
  triggerMode: WorkspaceAutomationTriggerMode;
  pushBranches: string[];
  scheduledCadence: "hourly" | "daily" | "weekly";
  scheduledHourUtc: number;
  scheduledDayOfWeek: number;
  scheduledTimezone: string;
  repositoryTargetKind: "none" | "github";
  githubInstallationRepositoryId: string;
  githubEnabled: boolean;
  githubProjectId: string;
  pushSourceEnabled: boolean;
  pullTranslationsEnabled: boolean;
  validationEnabled: boolean;
  slackEnabled: boolean;
  slackChannelId: string;
  emailEnabled: boolean;
  emailRecipients: string[];
  contentfulEnabled: boolean;
  contentfulConnectionId: string;
  contentfulProjectId: string;
  contentfulSourceLocale: string;
  contentfulEntryId: string;
  contentfulContentTypeIds: string[];
  contentfulTargetLocales: string[];
  contentfulFieldMode: "auto" | "configured";
  contentfulOverwriteDraftLocales: boolean;
  contentfulRunQa: boolean;
  contentfulWriteDrafts: boolean;
};

export type WorkspaceAutomationFieldErrors = Partial<
  Record<
    | "name"
    | "instructions"
    | "githubProjectId"
    | "githubRepository"
    | "trigger"
    | "pushBranches"
    | "slackChannelId"
    | "emailRecipients"
    | "contentfulConnectionId"
    | "contentfulProjectId"
    | "contentfulTargetLocales"
    | "contentfulEntryId"
    | "form",
    string
  >
>;

export const WORKSPACE_AUTOMATION_API_ERROR_MESSAGES: Record<string, string> = {
  github_repository_target_required: "Choose a GitHub repository before enabling GitHub tools.",
  github_project_required: "Choose a Hyperlocalise project for GitHub workflows.",
  github_trigger_required: "Choose a schedule or GitHub push trigger for GitHub workflows.",
  github_push_branches_required: "Add at least one branch pattern for GitHub push triggers.",
  scheduled_workflow_required:
    "Scheduled automations require at least one GitHub or Contentful workflow.",
  slack_not_connected: "Connect Slack in Integrations before enabling Slack notifications.",
  slack_channel_required: "Choose a Slack channel for notifications.",
  email_not_connected: "Enable the email agent in Integrations before using email notifications.",
  email_recipients_required: "Add at least one email recipient.",
  contentful_connection_required: "Choose a Contentful connection.",
  contentful_project_required: "Choose a Hyperlocalise project for Contentful translation.",
  contentful_target_locales_required: "Add at least one target locale for Contentful translation.",
  github_repository_not_enabled: "Enable this repository before configuring automation.",
  github_repository_archived: "Archived repositories cannot use automations.",
  project_not_found: "The selected project could not be found.",
};

export function createDefaultWorkspaceAutomationFormState(): WorkspaceAutomationFormState {
  return {
    name: "",
    instructions: "",
    status: "active",
    triggerMode: "manual",
    pushBranches: ["main"],
    scheduledCadence: "daily",
    scheduledHourUtc: 22,
    scheduledDayOfWeek: 1,
    scheduledTimezone: "UTC",
    repositoryTargetKind: "none",
    githubInstallationRepositoryId: "",
    githubEnabled: false,
    githubProjectId: "",
    pushSourceEnabled: false,
    pullTranslationsEnabled: false,
    validationEnabled: false,
    slackEnabled: false,
    slackChannelId: "",
    emailEnabled: false,
    emailRecipients: [],
    contentfulEnabled: false,
    contentfulConnectionId: "",
    contentfulProjectId: "",
    contentfulSourceLocale: "en",
    contentfulEntryId: "",
    contentfulContentTypeIds: [],
    contentfulTargetLocales: [],
    contentfulFieldMode: "auto",
    contentfulOverwriteDraftLocales: false,
    contentfulRunQa: true,
    contentfulWriteDrafts: true,
  };
}

export function createWorkspaceAutomationFormStateFromRecord(
  automation: WorkspaceAutomationRecord,
): WorkspaceAutomationFormState {
  const github = automation.toolConfig.github;
  const slack = automation.toolConfig.slack;
  const email = automation.toolConfig.email;
  const contentful = automation.toolConfig.contentful;

  return {
    name: automation.name,
    instructions: automation.instructions,
    status: automation.status === "paused" ? "paused" : "active",
    triggerMode: automation.triggerConfig.mode,
    pushBranches:
      automation.triggerConfig.mode === "github" && automation.triggerConfig.branches?.length
        ? [...automation.triggerConfig.branches]
        : ["main"],
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
    githubProjectId: github?.projectId ?? "",
    pushSourceEnabled: Boolean(github?.pushSource),
    pullTranslationsEnabled: Boolean(github?.pullTranslations),
    validationEnabled: Boolean(github?.validation),
    slackEnabled: Boolean(slack?.enabled),
    slackChannelId: slack?.channelId ?? "",
    emailEnabled: Boolean(email?.enabled),
    emailRecipients: email?.recipients ? [...email.recipients] : [],
    contentfulEnabled: Boolean(contentful?.enabled),
    contentfulConnectionId: contentful?.connectionId ?? "",
    contentfulProjectId: contentful?.projectId ?? "",
    contentfulSourceLocale: contentful?.sourceLocale ?? "en",
    contentfulEntryId: contentful?.entryId ?? "",
    contentfulContentTypeIds: contentful?.contentTypeIds ? [...contentful.contentTypeIds] : [],
    contentfulTargetLocales: contentful?.targetLocales ? [...contentful.targetLocales] : [],
    contentfulFieldMode: contentful?.fieldMode ?? "auto",
    contentfulOverwriteDraftLocales: Boolean(contentful?.overwriteDraftLocales),
    contentfulRunQa: contentful?.runQa ?? true,
    contentfulWriteDrafts: contentful?.writeDrafts ?? true,
  };
}

export function createWorkspaceAutomationFormStateFromTemplate(
  templateId: string,
): WorkspaceAutomationFormState | null {
  const template = getWorkspaceAutomationTemplate(templateId);
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
    emailRecipients: template.defaultForm.emailRecipients ?? base.emailRecipients,
    contentfulContentTypeIds:
      template.defaultForm.contentfulContentTypeIds ?? base.contentfulContentTypeIds,
    contentfulTargetLocales:
      template.defaultForm.contentfulTargetLocales ?? base.contentfulTargetLocales,
  };
}

export function formStateToWorkspaceAutomationPayload(form: WorkspaceAutomationFormState): {
  name: string;
  instructions: string;
  status: "active" | "paused";
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
          }
        : form.triggerMode === "contentful"
          ? { mode: "contentful" }
          : { mode: "manual" };

  const repositoryTarget: WorkspaceAutomationRepositoryTarget =
    form.githubEnabled && form.githubInstallationRepositoryId
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
            projectId: form.githubProjectId.trim() || undefined,
            pushSource: form.pushSourceEnabled,
            pullTranslations: form.pullTranslationsEnabled,
            validation: form.validationEnabled,
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
    ...(form.contentfulEnabled
      ? {
          contentful: {
            enabled: true,
            connectionId: form.contentfulConnectionId || undefined,
            projectId: form.contentfulProjectId || undefined,
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
  };

  return {
    name: form.name.trim(),
    instructions: form.instructions.trim(),
    status: form.status,
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

  if (form.githubEnabled) {
    if (!form.githubInstallationRepositoryId) {
      errors.githubRepository = "Choose a GitHub repository.";
    }
    if (!form.githubProjectId.trim()) {
      errors.githubProjectId = "Choose a Hyperlocalise project.";
    }
    if (!form.pushSourceEnabled && !form.pullTranslationsEnabled && !form.validationEnabled) {
      errors.form = "Enable at least one GitHub workflow.";
    }
    if (form.triggerMode === "manual") {
      errors.trigger = "Choose a schedule or GitHub push trigger.";
    }
    if (form.triggerMode === "github" && form.pushBranches.length === 0) {
      errors.pushBranches = "Add at least one branch pattern.";
    }
  }

  if (form.slackEnabled && !form.slackChannelId.trim()) {
    errors.slackChannelId = "Choose a Slack channel.";
  }

  if (form.emailEnabled && form.emailRecipients.length === 0) {
    errors.emailRecipients = "Add at least one email recipient.";
  }

  if (form.contentfulEnabled) {
    if (!form.contentfulConnectionId) {
      errors.contentfulConnectionId = "Choose a Contentful connection.";
    }
    if (!form.contentfulProjectId.trim()) {
      errors.contentfulProjectId = "Choose a Hyperlocalise project.";
    }
    if (form.contentfulTargetLocales.length === 0) {
      errors.contentfulTargetLocales = "Add at least one target locale.";
    }
    if (form.triggerMode === "scheduled" && !form.contentfulEntryId.trim()) {
      errors.contentfulEntryId = "Scheduled Contentful automations need an entry ID.";
    }
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
    case "github_project_required":
    case "project_not_found":
      return { githubProjectId: message };
    case "github_trigger_required":
    case "scheduled_workflow_required":
      return { trigger: message };
    case "github_push_branches_required":
      return { pushBranches: message };
    case "slack_not_connected":
    case "slack_channel_required":
      return { slackChannelId: message };
    case "email_not_connected":
    case "email_recipients_required":
      return { emailRecipients: message };
    case "contentful_connection_required":
      return { contentfulConnectionId: message };
    case "contentful_project_required":
      return { contentfulProjectId: message };
    case "contentful_target_locales_required":
      return { contentfulTargetLocales: message };
    default:
      return { form: message };
  }
}

export function workspaceAutomationFormCanActivate(form: WorkspaceAutomationFormState) {
  return form.githubEnabled || form.slackEnabled || form.emailEnabled || form.contentfulEnabled;
}
