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
  buildDefaultContentSyncTriggerMode,
  contentSyncNeedsProviderFolder,
  defaultContentSyncName,
  defaultContentSyncProjectFolder,
  type ContentSyncConfig,
  type ContentSyncProvider,
} from "./content-sync/content-sync-types";
import {
  DEFAULT_WORKSPACE_AUTOMATION_KIND,
  DEFAULT_WORKSPACE_AUTOMATION_MODEL,
  resolveWorkspaceAutomationGithubEvents,
  resolveWorkspaceAutomationKind,
  resolveWorkspaceAutomationModel,
  type WorkspaceAutomationGithubToolMode,
  type WorkspaceAutomationGithubTriggerEvent,
  type WorkspaceAutomationKind,
  type WorkspaceAutomationModel,
  type WorkspaceAutomationRecord,
  type WorkspaceAutomationRepositoryTarget,
  type WorkspaceAutomationToolConfig,
  type WorkspaceAutomationTriggerConfig,
  type WorkspaceAutomationWebSearchProvider,
} from "./workspace-automation-types";
import type { EmailProviderSlug } from "@/lib/email/constants";
import {
  DEFAULT_GOOGLE_DRIVE_TRANSLATION_OUTPUT,
  resolveGoogleDriveTranslationOutput,
  type GoogleDriveTranslationOutput,
} from "@/lib/google-drive/translation-filename";
import { listUnsupportedSanitySourceDocumentTypes } from "@/lib/sanity/locale-catalog";
import { sanityDocumentTypeTitle } from "@/lib/sanity/localization-mode";
import { parseSlackConversationId } from "./slack/channel-query";
import { isValidAutomationTimeZone } from "./automation-time-zones";
import { hasWorkspaceAutomationScheduledWorkflow } from "./workspace-automation-scheduled-workflow";
import { applySkillToolsToWorkspaceAutomationForm } from "./workspace-automation-skill-form";
import { validateWorkspaceAutomationSkills } from "./workspace-automation-skills";
import {
  getWorkspaceAutomationTemplate,
  type WorkspaceAutomationTemplate,
} from "./workspace-automation-templates";

export type WorkspaceAutomationTriggerMode =
  | "manual"
  | "scheduled"
  | "github"
  | "contentful"
  | "source_upload"
  | "web_chat";

export type WorkspaceAutomationFormState = {
  kind: WorkspaceAutomationKind;
  name: string;
  instructions: string;
  skillIds: string[];
  model: WorkspaceAutomationModel;
  status: "active" | "paused";
  projectId: string;
  syncProvider: ContentSyncProvider;
  syncConnectionId: string;
  syncResourceKey: string;
  syncProviderFolder: string;
  syncProjectFolder: string;
  triggerMode: WorkspaceAutomationTriggerMode;
  pushBranches: string[];
  githubEvents: WorkspaceAutomationGithubTriggerEvent[];
  scheduledCadence: "hourly" | "daily" | "weekly";
  scheduledHourUtc: number;
  scheduledDayOfWeek: number;
  scheduledTimezone: string;
  repositoryTargetKind: "none" | "github" | "gitlab";
  githubInstallationRepositoryId: string;
  gitlabEnabled: boolean;
  gitlabPathWithNamespace: string;
  githubEnabled: boolean;
  githubMode: WorkspaceAutomationGithubToolMode;
  pushSourceEnabled: boolean;
  pullTranslationsEnabled: boolean;
  validationEnabled: boolean;
  slackEnabled: boolean;
  slackChannelId: string;
  emailEnabled: boolean;
  emailProvider: EmailProviderSlug;
  emailFrom: string;
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
  knowledgeFilesEnabled: boolean;
  mcpEnabled: boolean;
  mcpConnectionId: string;
  semrushEnabled: boolean;
  semrushConnectionId: string;
  zernioEnabled: boolean;
  zernioConnectionId: string;
  ahrefsEnabled: boolean;
  intercomEnabled: boolean;
  googleDriveEnabled: boolean;
  googleDriveFolderIds: string[];
  googleDriveFileIds: string[];
  googleDriveTargetLocales: string[];
  googleDriveIncludeTranslatedFiles: boolean;
  googleDriveTranslationOutput: GoogleDriveTranslationOutput;
  sanityEnabled: boolean;
  sanityProjectId: string;
  sanityDataset: string;
  sanityDocumentTypes: string[];
  sanityDocumentTypeModes: Record<string, "document" | "field">;
  sanityLocaleCatalogDocumentType: string;
  sanityLocaleCatalogTagField: string;
  sanityLocaleCatalogTitleField: string;
  sanityLanguages: string[];
  sanityLanguagesByType: Record<string, string[]>;
  sanitySourceLocale: string;
  sanityTargetLocales: string[];
  sanityIncludeDrafts: boolean;
  sanityOverwriteSanityDrafts: boolean;
  sanityExistingTranslationPolicy: "seed_empty" | "refresh_imported" | "overwrite_all";
  webflowEnabled: boolean;
  webflowConnectionId: string;
  webflowSiteId: string;
  webflowCollectionIds: string[];
  webflowSourceLocale: string;
  webflowTargetLocales: string[];
  webflowExistingTranslationPolicy: "seed_empty" | "refresh_imported" | "overwrite_all";
  webflowRunQa: boolean;
  webflowPublishOnPush: boolean;
  brazeEnabled: boolean;
  brazeCampaignsEnabled: boolean;
  customerIoEnabled: boolean;
  loopsEnabled: boolean;
  loopsSourceLocale: string;
  hubspotEnabled: boolean;
  hubspotSourceLocale: string;
  customerIoBroadcastIds: string[];
  customerIoCampaignIds: string[];
  customerIoNewsletterIds: string[];
  customerIoTransactionalMessageIds: string[];
  customerIoBroadcastActions: Record<string, string[]>;
  customerIoCampaignActions: Record<string, string[]>;
  customerIoNewsletterActions: Record<string, string[]>;
  customerIoTransactionalMessageActions: Record<string, string[]>;
  customerIoExistingTranslationPolicy: "seed_empty" | "refresh_imported" | "overwrite_all";
  customerIoOverwriteWhenRemoteNewer: boolean;
  brazeSourceLocale: string;
  brazeTemplateIds: string[];
  brazeContentBlockIds: string[];
  brazeCampaignIds: string[];
  brazeCanvasIds: string[];
  brazeExistingTranslationPolicy: "seed_empty" | "refresh_imported" | "overwrite_all";
  brazeOverwriteWhenRemoteNewer: boolean;
  intercomRestEndpoint: "us" | "eu" | "au";
  intercomHelpCenterId: string;
  intercomHelpCenterLocales: string[];
  intercomSourceLocale: string;
  intercomTargetLocales: string[];
  intercomCollectionIds: string[];
  intercomIncludeDrafts: boolean;
  intercomOverwriteIntercomDrafts: boolean;
  intercomExistingTranslationPolicy: "seed_empty" | "refresh_imported" | "overwrite_all";
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
  if (
    form.intercomEnabled ||
    form.googleDriveEnabled ||
    form.sanityEnabled ||
    form.webflowEnabled ||
    form.brazeEnabled ||
    form.brazeCampaignsEnabled ||
    form.customerIoEnabled ||
    form.loopsEnabled ||
    form.hubspotEnabled
  ) {
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
    | "gitlabRepository"
    | "trigger"
    | "pushBranches"
    | "githubEvents"
    | "slackChannelId"
    | "emailRecipients"
    | "emailFrom"
    | "contentfulConnectionId"
    | "contentfulTargetLocales"
    | "contentfulEntryId"
    | "createNativeTmsJobTargetLocales"
    | "mcpConnectionId"
    | "semrushConnectionId"
    | "zernioConnectionId"
    | "ahrefs"
    | "intercom"
    | "intercomHelpCenterId"
    | "intercomSourceLocale"
    | "googleDrive"
    | "sanity"
    | "sanityProjectId"
    | "sanityDataset"
    | "sanityDocumentTypes"
    | "sanitySourceLocale"
    | "sanityTargetLocales"
    | "webflow"
    | "webflowConnectionId"
    | "webflowCollectionIds"
    | "webflowSourceLocale"
    | "braze"
    | "brazeSourceLocale"
    | "customerIo"
    | "loops"
    | "hubspot"
    | "crowdinProjectId"
    | "scheduledTimezone"
    | "skills"
    | "syncConnectionId"
    | "syncProviderFolder"
    | "syncProjectFolder"
    | "form",
    string
  >
>;

export const WORKSPACE_AUTOMATION_API_ERROR_MESSAGES: Record<string, string> = {
  skill_not_found: "A selected skill is no longer available. Remove it and try again.",
  skill_trigger_incompatible:
    "A selected skill does not work with this trigger. Remove it or change the trigger.",
  skill_tools_required: "A selected skill needs a tool that was removed. Add the skill again.",
  cms_translation_skills_exclusive: "Choose one CMS translation skill per automation.",
  instructions_or_skill_required: "Add a skill or write instructions.",
  github_repository_target_required: "Choose a GitHub repository before enabling GitHub tools.",
  gitlab_repository_target_required: "Choose a GitLab project before enabling GitLab tools.",
  gitlab_github_exclusive: "GitHub and GitLab cannot be enabled on the same automation.",
  gitlab_agent_trigger_required: "Use GitLab repo automations with a scheduled or manual trigger.",
  gitlab_not_connected: "Connect GitLab in Integrations before using it.",
  gitlab_pipes_needs_reauthorization: "Reconnect GitLab in Integrations, then try again.",
  gitlab_pipes_unavailable: "GitLab is unavailable until WorkOS Pipes is configured.",
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
    "Scheduled automations require at least one GitHub, GitLab, Contentful, Intercom, Sanity, Webflow, Google Drive, Braze, Customer.io, Queries, Web Search, or Crowdin workflow tool.",
  intercom_not_connected: "Connect Intercom in Integrations before using it.",
  intercom_pipes_needs_reauthorization: "Reconnect Intercom in Integrations, then try again.",
  intercom_pipes_unavailable: "Intercom is unavailable until WorkOS Pipes is configured.",
  intercom_help_center_required: "Choose an Intercom Help Center.",
  intercom_target_locales_unmapped:
    "One or more selected Intercom target locales do not exist on this Help Center.",
  intercom_source_locale_unmapped:
    "The source locale does not match an Intercom Help Center locale.",
  intercom_source_locale_mismatch:
    "The Intercom source locale must be the same language as the project source locale.",
  sanity_not_connected: "Connect Sanity in Integrations before using it.",
  sanity_pipes_needs_reauthorization: "Reconnect Sanity in Integrations, then try again.",
  sanity_pipes_unavailable: "Sanity is unavailable until WorkOS Pipes is configured.",
  sanity_project_required: "Choose a Sanity project and dataset.",
  sanity_document_types_required: "Choose at least one Sanity document type.",
  sanity_target_locales_unmapped:
    "One or more selected Sanity target locales do not exist on this dataset.",
  sanity_source_locale_unmapped: "The source locale does not match a Sanity language tag.",
  sanity_source_locale_mismatch:
    "The Sanity source locale must be the same language as the project source locale.",
  webflow_not_connected: "Connect Webflow in Integrations before using it.",
  webflow_connection_required: "Choose a Webflow connection.",
  webflow_collection_ids_required: "Choose at least one Webflow collection.",
  webflow_source_locale_mismatch:
    "The Webflow primary locale must match the project source locale.",
  braze_not_connected: "Connect Braze in Integrations before using it.",
  braze_pipes_needs_reauthorization: "Reconnect Braze in Integrations, then try again.",
  braze_pipes_unavailable: "Braze is unavailable until WorkOS Pipes is configured.",
  braze_endpoint_missing: "Save a Braze REST cluster in Integrations before using it.",
  braze_source_locale_mismatch:
    "The Braze source locale must be the same language as the project source locale.",
  braze_skills_exclusive:
    "Choose either Braze Email Templates or Braze Campaigns & Canvas, not both.",
  customer_io_not_connected: "Connect Customer.io in Integrations before using it.",
  customer_io_pipes_needs_reauthorization: "Reconnect Customer.io in Integrations, then try again.",
  customer_io_pipes_unavailable: "Customer.io is unavailable until WorkOS Pipes is configured.",
  loops_not_connected: "Connect Loops in Integrations before using it.",
  loops_pipes_needs_reauthorization: "Reconnect Loops in Integrations, then try again.",
  loops_pipes_unavailable: "Loops is unavailable until WorkOS Pipes is configured.",
  hubspot_not_connected: "Connect HubSpot in Integrations before using it.",
  hubspot_pipes_needs_reauthorization: "Reconnect HubSpot in Integrations, then try again.",
  hubspot_pipes_unavailable: "HubSpot is unavailable until WorkOS Pipes is configured.",
  invalid_automation_timezone: "Choose a valid timezone for the schedule.",
  slack_not_connected: "Connect Slack in Integrations before enabling Slack notifications.",
  slack_channel_required: "Choose a Slack channel for notifications.",
  email_not_connected:
    "Connect an email provider in Integrations before using email notifications.",
  email_provider_not_connected:
    "Connect an email provider in Integrations before using email notifications.",
  email_pipes_needs_reauthorization:
    "Reconnect your email provider in Integrations, then try again.",
  email_pipes_unavailable: "Email providers are unavailable until WorkOS Pipes is configured.",
  email_from_required: "Add a verified sender address for email notifications.",
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
  zernio_connection_required: "Choose a Zernio connection.",
  zernio_connection_not_found:
    "The selected Zernio connection was not found. Choose another connection.",
  zernio_not_connected: "Enable the selected Zernio connection in Integrations before using it.",
  ahrefs_not_connected: "Connect Ahrefs in Integrations before using it.",
  ahrefs_pipes_needs_reauthorization: "Reconnect Ahrefs in Integrations, then try again.",
  ahrefs_pipes_unavailable: "Ahrefs is unavailable until WorkOS Pipes is configured.",
  crowdin_project_required: "Choose a Crowdin-linked project for Crowdin review.",
  crowdin_project_not_found: "The selected Crowdin project was not found. Choose another project.",
  crowdin_project_not_linked:
    "The selected project is not linked to Crowdin. Choose a Crowdin project.",
  crowdin_not_connected: "Connect Crowdin in Integrations before using Crowdin review tools.",
  github_repository_not_enabled: "Enable this repository before configuring automation.",
  github_repository_archived: "Archived repositories cannot use automations.",
  project_not_found: "The selected project could not be found.",
  content_sync_config_required: "Choose a source, resource, and project folder.",
  content_sync_provider_folder_required: "Add the folder on the connected source.",
  content_sync_folder_invalid: "Choose a safe relative folder path.",
  content_sync_duplicate: "This project already syncs that source folder.",
  content_sync_connection_required: "Connect this source in Integrations first.",
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
    kind: DEFAULT_WORKSPACE_AUTOMATION_KIND,
    name: "",
    instructions: "",
    skillIds: [],
    model: DEFAULT_WORKSPACE_AUTOMATION_MODEL,
    status: "active",
    projectId: "",
    syncProvider: "github",
    syncConnectionId: "",
    syncResourceKey: "",
    syncProviderFolder: "locales",
    syncProjectFolder: "",
    triggerMode: "manual",
    pushBranches: ["main"],
    githubEvents: ["push"],
    scheduledCadence: "daily",
    scheduledHourUtc: 22,
    scheduledDayOfWeek: 1,
    scheduledTimezone: "UTC",
    repositoryTargetKind: "none",
    githubInstallationRepositoryId: "",
    gitlabEnabled: false,
    gitlabPathWithNamespace: "",
    githubEnabled: false,
    githubMode: "sync",
    pushSourceEnabled: false,
    pullTranslationsEnabled: false,
    validationEnabled: false,
    slackEnabled: false,
    slackChannelId: "",
    emailEnabled: false,
    emailProvider: "resend",
    emailFrom: "",
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
    knowledgeFilesEnabled: false,
    mcpEnabled: false,
    mcpConnectionId: "",
    semrushEnabled: false,
    semrushConnectionId: "",
    zernioEnabled: false,
    zernioConnectionId: "",
    ahrefsEnabled: false,
    intercomEnabled: false,
    googleDriveEnabled: false,
    googleDriveFolderIds: [],
    googleDriveFileIds: [],
    googleDriveTargetLocales: [],
    googleDriveIncludeTranslatedFiles: false,
    googleDriveTranslationOutput: DEFAULT_GOOGLE_DRIVE_TRANSLATION_OUTPUT,
    sanityEnabled: false,
    sanityProjectId: "",
    sanityDataset: "",
    sanityDocumentTypes: [],
    sanityDocumentTypeModes: {},
    sanityLocaleCatalogDocumentType: "locale",
    sanityLocaleCatalogTagField: "tag",
    sanityLocaleCatalogTitleField: "name",
    sanityLanguages: [],
    sanityLanguagesByType: {},
    sanitySourceLocale: "en",
    sanityTargetLocales: [],
    sanityIncludeDrafts: true,
    sanityOverwriteSanityDrafts: true,
    sanityExistingTranslationPolicy: "seed_empty",
    webflowEnabled: false,
    webflowConnectionId: "",
    webflowSiteId: "",
    webflowCollectionIds: [],
    webflowSourceLocale: "en",
    webflowTargetLocales: [],
    webflowExistingTranslationPolicy: "seed_empty",
    webflowRunQa: true,
    webflowPublishOnPush: false,
    brazeEnabled: false,
    brazeCampaignsEnabled: false,
    customerIoEnabled: false,
    loopsEnabled: false,
    loopsSourceLocale: "en",
    hubspotEnabled: false,
    hubspotSourceLocale: "en",
    customerIoBroadcastIds: [],
    customerIoCampaignIds: [],
    customerIoNewsletterIds: [],
    customerIoTransactionalMessageIds: [],
    customerIoBroadcastActions: {},
    customerIoCampaignActions: {},
    customerIoNewsletterActions: {},
    customerIoTransactionalMessageActions: {},
    customerIoExistingTranslationPolicy: "seed_empty",
    customerIoOverwriteWhenRemoteNewer: true,
    brazeSourceLocale: "en",
    brazeTemplateIds: [],
    brazeContentBlockIds: [],
    brazeCampaignIds: [],
    brazeCanvasIds: [],
    brazeExistingTranslationPolicy: "seed_empty",
    brazeOverwriteWhenRemoteNewer: true,
    intercomRestEndpoint: "us",
    intercomHelpCenterId: "",
    intercomHelpCenterLocales: [],
    intercomSourceLocale: "en",
    intercomTargetLocales: [],
    intercomCollectionIds: [],
    intercomIncludeDrafts: true,
    intercomOverwriteIntercomDrafts: true,
    intercomExistingTranslationPolicy: "seed_empty",
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
  const gitlab = automation.toolConfig.gitlab;
  const slack = automation.toolConfig.slack;
  const email = automation.toolConfig.email;
  const contentful = automation.toolConfig.contentful;
  const createNativeTmsJob = automation.toolConfig.createNativeTmsJob;
  const assignTranslateWithAgent = automation.toolConfig.assignTranslateWithAgent;
  const listIssues = automation.toolConfig.listIssues;
  const createIssue = automation.toolConfig.createIssue;
  const knowledge = automation.toolConfig.knowledge;
  const knowledgeFiles = automation.toolConfig.knowledgeFiles;
  const mcp = automation.toolConfig.mcp;
  const semrush = automation.toolConfig.semrush;
  const zernio = automation.toolConfig.zernio;
  const ahrefs = automation.toolConfig.ahrefs;
  const intercom = automation.toolConfig.intercom;
  const googleDrive = automation.toolConfig.googleDrive;
  const sanity = automation.toolConfig.sanity;
  const webflow = automation.toolConfig.webflow;
  const braze = automation.toolConfig.braze;
  const brazeCampaigns = automation.toolConfig.brazeCampaigns;
  const customerIo = automation.toolConfig.customerIo;
  const loops = automation.toolConfig.loops;
  const hubspot = automation.toolConfig.hubspot;
  const crowdin = automation.toolConfig.crowdin;
  const webSearch = automation.toolConfig.webSearch;

  return {
    kind: resolveWorkspaceAutomationKind(automation.kind),
    name: automation.name,
    instructions: automation.instructions,
    skillIds: automation.skillIds ?? [],
    syncProvider: automation.syncConfig?.provider ?? "github",
    syncConnectionId: automation.syncConfig?.connectionId ?? "",
    syncResourceKey: automation.syncConfig?.resourceKey ?? "",
    syncProviderFolder: automation.syncConfig?.providerFolder ?? "locales",
    syncProjectFolder: automation.syncConfig?.projectFolder ?? "",
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
    gitlabEnabled: Boolean(gitlab?.enabled),
    gitlabPathWithNamespace: automation.repositoryTarget.gitlabPathWithNamespace ?? "",
    githubEnabled: Boolean(github?.enabled),
    githubMode: github?.mode ?? "sync",
    pushSourceEnabled: Boolean(github?.pushSource),
    pullTranslationsEnabled: Boolean(github?.pullTranslations),
    validationEnabled: Boolean(github?.validation),
    slackEnabled: Boolean(slack?.enabled),
    slackChannelId: slack?.channelId ?? "",
    emailEnabled: Boolean(email?.enabled),
    emailProvider: email?.provider ?? "resend",
    emailFrom: email?.from ?? "",
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
    knowledgeFilesEnabled: Boolean(knowledgeFiles?.enabled),
    mcpEnabled: Boolean(mcp?.enabled),
    mcpConnectionId: mcp?.connectionId ?? "",
    semrushEnabled: Boolean(semrush?.enabled),
    semrushConnectionId: semrush?.connectionId ?? "",
    zernioEnabled: Boolean(zernio?.enabled),
    zernioConnectionId: zernio?.connectionId ?? "",
    ahrefsEnabled: Boolean(ahrefs?.enabled),
    intercomEnabled: Boolean(intercom?.enabled),
    googleDriveEnabled: Boolean(googleDrive?.enabled),
    googleDriveFolderIds: googleDrive?.folderIds ? [...googleDrive.folderIds] : [],
    googleDriveFileIds: googleDrive?.fileIds ? [...googleDrive.fileIds] : [],
    googleDriveTargetLocales: googleDrive?.targetLocales ? [...googleDrive.targetLocales] : [],
    googleDriveIncludeTranslatedFiles: Boolean(googleDrive?.includeTranslatedFiles),
    googleDriveTranslationOutput: resolveGoogleDriveTranslationOutput(
      googleDrive?.translationOutput,
    ),
    sanityEnabled: Boolean(sanity?.enabled),
    sanityProjectId: sanity?.projectId ?? "",
    sanityDataset: sanity?.dataset ?? "",
    sanityDocumentTypes: sanity?.documentTypes ? [...sanity.documentTypes] : [],
    sanityDocumentTypeModes: sanity?.documentTypeModes ? { ...sanity.documentTypeModes } : {},
    sanityLocaleCatalogDocumentType: sanity?.localeCatalog?.documentType ?? "locale",
    sanityLocaleCatalogTagField: sanity?.localeCatalog?.tagField ?? "tag",
    sanityLocaleCatalogTitleField: sanity?.localeCatalog?.titleField ?? "name",
    sanityLanguages: sanity?.languages ? [...sanity.languages] : [],
    sanityLanguagesByType: sanity?.languagesByType ? { ...sanity.languagesByType } : {},
    sanitySourceLocale: sanity?.sourceLocale ?? "en",
    sanityTargetLocales: [],
    sanityIncludeDrafts: Boolean(sanity?.includeDrafts),
    sanityOverwriteSanityDrafts: Boolean(sanity?.overwriteSanityDrafts),
    sanityExistingTranslationPolicy:
      sanity?.existingTranslationPolicy === "refresh_imported" ||
      sanity?.existingTranslationPolicy === "overwrite_all"
        ? sanity.existingTranslationPolicy
        : "seed_empty",
    webflowEnabled: Boolean(webflow?.enabled),
    webflowConnectionId: webflow?.connectionId ?? "",
    webflowSiteId: webflow?.siteId ?? "",
    webflowCollectionIds: webflow?.collectionIds ? [...webflow.collectionIds] : [],
    webflowSourceLocale: webflow?.sourceLocale ?? "en",
    webflowTargetLocales: webflow?.targetLocales ? [...webflow.targetLocales] : [],
    webflowExistingTranslationPolicy:
      webflow?.existingTranslationPolicy === "refresh_imported" ||
      webflow?.existingTranslationPolicy === "overwrite_all"
        ? webflow.existingTranslationPolicy
        : "seed_empty",
    webflowRunQa: webflow?.runQa ?? true,
    webflowPublishOnPush: webflow?.publishOnPush ?? false,
    brazeEnabled: Boolean(braze?.enabled),
    brazeCampaignsEnabled: Boolean(brazeCampaigns?.enabled),
    customerIoEnabled: Boolean(customerIo?.enabled),
    loopsEnabled: Boolean(loops?.enabled),
    loopsSourceLocale: loops?.sourceLocale ?? "en",
    hubspotEnabled: Boolean(hubspot?.enabled),
    hubspotSourceLocale: hubspot?.sourceLocale ?? "en",
    customerIoBroadcastIds: customerIo?.broadcastIds ? [...customerIo.broadcastIds] : [],
    customerIoCampaignIds: customerIo?.campaignIds ? [...customerIo.campaignIds] : [],
    customerIoNewsletterIds: customerIo?.newsletterIds ? [...customerIo.newsletterIds] : [],
    customerIoTransactionalMessageIds: customerIo?.transactionalMessageIds
      ? [...customerIo.transactionalMessageIds]
      : [],
    customerIoBroadcastActions: { ...customerIo?.broadcastActions },
    customerIoCampaignActions: { ...customerIo?.campaignActions },
    customerIoNewsletterActions: { ...customerIo?.newsletterActions },
    customerIoTransactionalMessageActions: { ...customerIo?.transactionalMessageActions },
    customerIoExistingTranslationPolicy:
      customerIo?.existingTranslationPolicy === "refresh_imported" ||
      customerIo?.existingTranslationPolicy === "overwrite_all"
        ? customerIo.existingTranslationPolicy
        : "seed_empty",
    customerIoOverwriteWhenRemoteNewer: customerIo?.overwriteWhenRemoteNewer !== false,
    brazeSourceLocale: brazeCampaigns?.sourceLocale ?? braze?.sourceLocale ?? "en",
    brazeTemplateIds: braze?.templateIds ? [...braze.templateIds] : [],
    brazeContentBlockIds: braze?.contentBlockIds ? [...braze.contentBlockIds] : [],
    brazeCampaignIds: brazeCampaigns?.campaignIds ? [...brazeCampaigns.campaignIds] : [],
    brazeCanvasIds: brazeCampaigns?.canvasIds ? [...brazeCampaigns.canvasIds] : [],
    brazeExistingTranslationPolicy:
      (brazeCampaigns?.existingTranslationPolicy ?? braze?.existingTranslationPolicy) ===
        "refresh_imported" ||
      (brazeCampaigns?.existingTranslationPolicy ?? braze?.existingTranslationPolicy) ===
        "overwrite_all"
        ? ((brazeCampaigns?.existingTranslationPolicy ?? braze?.existingTranslationPolicy) as
            | "refresh_imported"
            | "overwrite_all")
        : "seed_empty",
    brazeOverwriteWhenRemoteNewer:
      (brazeCampaigns?.overwriteWhenRemoteNewer ?? braze?.overwriteWhenRemoteNewer) !== false,
    intercomRestEndpoint: intercom?.restEndpoint ?? "us",
    intercomHelpCenterId: intercom?.helpCenterId ?? "",
    intercomHelpCenterLocales: intercom?.helpCenterLocales ? [...intercom.helpCenterLocales] : [],
    intercomSourceLocale: intercom?.sourceLocale ?? "en",
    intercomTargetLocales: intercom?.targetLocales ? [...intercom.targetLocales] : [],
    intercomCollectionIds: intercom?.collectionIds ? [...intercom.collectionIds] : [],
    intercomIncludeDrafts: Boolean(intercom?.includeDrafts),
    intercomOverwriteIntercomDrafts: Boolean(intercom?.overwriteIntercomDrafts),
    intercomExistingTranslationPolicy:
      intercom?.existingTranslationPolicy === "refresh_imported" ||
      intercom?.existingTranslationPolicy === "overwrite_all"
        ? intercom.existingTranslationPolicy
        : "seed_empty",
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
  return applySkillToolsToWorkspaceAutomationForm({
    ...base,
    ...template.defaultForm,
    name: template.defaultForm.name ?? template.name,
    instructions: template.defaultForm.instructions ?? template.instructions,
    skillIds: template.defaultForm.skillIds ?? base.skillIds,
    pushBranches: template.defaultForm.pushBranches ?? base.pushBranches,
    githubEvents: template.defaultForm.githubEvents ?? base.githubEvents,
    emailRecipients: template.defaultForm.emailRecipients ?? base.emailRecipients,
    contentfulContentTypeIds:
      template.defaultForm.contentfulContentTypeIds ?? base.contentfulContentTypeIds,
    contentfulTargetLocales:
      template.defaultForm.contentfulTargetLocales ?? base.contentfulTargetLocales,
  });
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

  if (form.loopsEnabled && project) {
    next.loopsSourceLocale = project.sourceLocale ?? form.loopsSourceLocale;
  }

  if (form.hubspotEnabled && project) {
    next.hubspotSourceLocale = project.sourceLocale ?? form.hubspotSourceLocale;
  }

  return next;
}

export type WorkspaceAutomationAgentWritePayload = {
  kind?: "agent";
  name: string;
  instructions: string;
  skillIds: string[];
  model: WorkspaceAutomationModel;
  status: "active" | "paused";
  projectId?: string;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget: WorkspaceAutomationRepositoryTarget;
  toolConfig: WorkspaceAutomationToolConfig;
};

export type WorkspaceAutomationContentSyncWritePayload = {
  kind: "content_sync";
  name: string;
  model?: WorkspaceAutomationModel;
  status: "active" | "paused";
  projectId?: string;
  triggerConfig: WorkspaceAutomationTriggerConfig;
  repositoryTarget?: WorkspaceAutomationRepositoryTarget;
  syncConfig: ContentSyncConfig;
  toolConfig: WorkspaceAutomationToolConfig;
};

export type WorkspaceAutomationWritePayload =
  | WorkspaceAutomationAgentWritePayload
  | WorkspaceAutomationContentSyncWritePayload;

export function formStateToWorkspaceAutomationPayload(
  form: WorkspaceAutomationFormState,
): WorkspaceAutomationWritePayload {
  if (form.kind === "content_sync") {
    const resourceKey = form.syncResourceKey.trim();
    const projectFolder =
      form.syncProjectFolder.trim() ||
      defaultContentSyncProjectFolder({
        provider: form.syncProvider,
        resourceKey,
      });
    return {
      kind: "content_sync",
      name:
        form.name.trim() || defaultContentSyncName({ provider: form.syncProvider, resourceKey }),
      status: form.status,
      projectId: form.projectId.trim() || undefined,
      triggerConfig: { mode: buildDefaultContentSyncTriggerMode(form.syncProvider) },
      syncConfig: {
        provider: form.syncProvider,
        connectionId: form.syncConnectionId.trim(),
        resourceKey,
        providerFolder: contentSyncNeedsProviderFolder(form.syncProvider)
          ? form.syncProviderFolder.trim()
          : "",
        projectFolder,
      },
      toolConfig: {},
    };
  }

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
            : form.triggerMode === "web_chat"
              ? { mode: "web_chat" }
              : { mode: "manual" };

  const repositoryTarget: WorkspaceAutomationRepositoryTarget =
    form.gitlabEnabled && form.gitlabPathWithNamespace.trim()
      ? {
          kind: "gitlab",
          gitlabPathWithNamespace: form.gitlabPathWithNamespace.trim(),
        }
      : (form.githubEnabled || form.githubCommentEnabled) && form.githubInstallationRepositoryId
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
    ...(form.gitlabEnabled
      ? {
          gitlab: {
            enabled: true,
          },
        }
      : {}),
    ...(form.slackEnabled
      ? {
          slack: {
            enabled: true,
            // A pasted channel link or mention is stored as the ID it names.
            channelId:
              parseSlackConversationId(form.slackChannelId) ??
              (form.slackChannelId.trim() || undefined),
          },
        }
      : {}),
    ...(form.emailEnabled
      ? {
          email: {
            enabled: true,
            provider: form.emailProvider,
            from: form.emailFrom.trim() || undefined,
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
    ...(form.brazeEnabled
      ? {
          braze: {
            enabled: true,
            sourceLocale: form.brazeSourceLocale.trim() || "en",
            templateIds: form.brazeTemplateIds,
            contentBlockIds: form.brazeContentBlockIds,
            existingTranslationPolicy: form.brazeExistingTranslationPolicy,
            overwriteWhenRemoteNewer: form.brazeOverwriteWhenRemoteNewer,
          },
        }
      : {}),
    ...(form.brazeCampaignsEnabled
      ? {
          brazeCampaigns: {
            enabled: true,
            sourceLocale: form.brazeSourceLocale.trim() || "en",
            campaignIds: form.brazeCampaignIds,
            canvasIds: form.brazeCanvasIds,
            existingTranslationPolicy: form.brazeExistingTranslationPolicy,
            overwriteWhenRemoteNewer: form.brazeOverwriteWhenRemoteNewer,
          },
        }
      : {}),
    ...(form.customerIoEnabled
      ? {
          customerIo: {
            enabled: true,
            broadcastIds: form.customerIoBroadcastIds,
            campaignIds: form.customerIoCampaignIds,
            newsletterIds: form.customerIoNewsletterIds,
            transactionalMessageIds: form.customerIoTransactionalMessageIds,
            broadcastActions: form.customerIoBroadcastActions,
            campaignActions: form.customerIoCampaignActions,
            newsletterActions: form.customerIoNewsletterActions,
            transactionalMessageActions: form.customerIoTransactionalMessageActions,
            existingTranslationPolicy: form.customerIoExistingTranslationPolicy,
            overwriteWhenRemoteNewer: form.customerIoOverwriteWhenRemoteNewer,
          },
        }
      : {}),
    ...(form.loopsEnabled
      ? {
          loops: {
            enabled: true,
            sourceLocale: form.loopsSourceLocale.trim() || "en",
            transactionalIds: [],
            campaignIds: [],
            workflowIds: [],
            existingTranslationPolicy: "seed_empty",
            overwriteWhenRemoteNewer: true,
          },
        }
      : {}),
    ...(form.hubspotEnabled
      ? {
          hubspot: {
            enabled: true,
            sourceLocale: form.hubspotSourceLocale.trim() || "en",
            emailIds: [],
            formIds: [],
            blogPostIds: [],
            landingPageIds: [],
            websitePageIds: [],
            existingTranslationPolicy: "seed_empty",
            overwriteWhenRemoteNewer: true,
          },
        }
      : {}),
    ...(form.intercomEnabled
      ? {
          intercom: {
            enabled: true,
            restEndpoint: form.intercomRestEndpoint,
            helpCenterId: form.intercomHelpCenterId.trim() || undefined,
            helpCenterLocales: form.intercomHelpCenterLocales,
            collectionIds: form.intercomCollectionIds,
            sourceLocale: form.intercomSourceLocale.trim() || "en",
            targetLocales: form.intercomTargetLocales,
            includeDrafts: form.intercomIncludeDrafts,
            overwriteIntercomDrafts: form.intercomOverwriteIntercomDrafts,
            existingTranslationPolicy: form.intercomExistingTranslationPolicy,
          },
        }
      : {}),
    ...(form.googleDriveEnabled
      ? {
          googleDrive: {
            enabled: true,
            folderIds: form.googleDriveFolderIds,
            fileIds: form.googleDriveFileIds,
            targetLocales: form.googleDriveTargetLocales,
            includeTranslatedFiles: form.googleDriveIncludeTranslatedFiles,
            translationOutput: form.googleDriveTranslationOutput,
            existingTranslationPolicy: "seed_empty",
          },
        }
      : {}),
    ...(form.sanityEnabled
      ? {
          sanity: {
            enabled: true,
            projectId: form.sanityProjectId.trim() || undefined,
            dataset: form.sanityDataset.trim() || undefined,
            documentTypes: form.sanityDocumentTypes,
            documentTypeModes: form.sanityDocumentTypeModes,
            localeCatalog: {
              documentType: form.sanityLocaleCatalogDocumentType.trim() || "locale",
              tagField: form.sanityLocaleCatalogTagField.trim() || "tag",
              titleField: form.sanityLocaleCatalogTitleField.trim() || "name",
            },
            languages: form.sanityLanguages,
            languagesByType: form.sanityLanguagesByType,
            sourceLocale: form.sanitySourceLocale.trim() || "en",
            targetLocales: [],
            includeDrafts: form.sanityIncludeDrafts,
            overwriteSanityDrafts: form.sanityOverwriteSanityDrafts,
            existingTranslationPolicy: form.sanityExistingTranslationPolicy,
          },
        }
      : {}),
    ...(form.webflowEnabled
      ? {
          webflow: {
            enabled: true,
            connectionId: form.webflowConnectionId || undefined,
            siteId: form.webflowSiteId.trim() || undefined,
            collectionIds: form.webflowCollectionIds,
            sourceLocale: form.webflowSourceLocale.trim() || "en",
            targetLocales: form.webflowTargetLocales,
            existingTranslationPolicy: form.webflowExistingTranslationPolicy,
            runQa: form.webflowRunQa,
            publishOnPush: form.webflowPublishOnPush,
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
    ...(form.knowledgeFilesEnabled
      ? {
          knowledgeFiles: {
            enabled: true,
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
    ...(form.zernioEnabled
      ? {
          zernio: {
            enabled: true,
            connectionId: form.zernioConnectionId || undefined,
          },
        }
      : {}),
    ...(form.ahrefsEnabled
      ? {
          ahrefs: {
            enabled: true,
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
    skillIds: form.skillIds,
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

  if (form.kind === "content_sync") {
    if (!form.projectId.trim()) {
      errors.projectId = "Choose a Hyperlocalise project.";
    }
    if (!form.syncConnectionId.trim() || !form.syncResourceKey.trim()) {
      errors.syncConnectionId = "Choose a connected source.";
    }
    if (contentSyncNeedsProviderFolder(form.syncProvider) && !form.syncProviderFolder.trim()) {
      errors.syncProviderFolder = "Add the folder on the connected source.";
    }
    if (
      !form.syncProjectFolder.trim() &&
      !defaultContentSyncProjectFolder({
        provider: form.syncProvider,
        resourceKey: form.syncResourceKey,
      })
    ) {
      errors.syncProjectFolder = "Add a project folder.";
    }
    return errors;
  }

  if (!form.name.trim()) {
    errors.name = "Name is required.";
  }

  if (!form.instructions.trim() && form.skillIds.length === 0) {
    errors.instructions = WORKSPACE_AUTOMATION_API_ERROR_MESSAGES.instructions_or_skill_required;
  }

  const payload = formStateToWorkspaceAutomationPayload(form);
  const skillProblem = validateWorkspaceAutomationSkills({
    skillIds: form.skillIds,
    triggerMode: form.triggerMode,
    toolConfig: payload.toolConfig,
  });
  if (skillProblem) {
    errors.skills = WORKSPACE_AUTOMATION_API_ERROR_MESSAGES[skillProblem];
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

  if (form.gitlabEnabled) {
    if (!form.gitlabPathWithNamespace.trim()) {
      errors.gitlabRepository = "Choose a GitLab project.";
    }
    if (form.triggerMode !== "manual" && form.triggerMode !== "scheduled") {
      errors.trigger = "Use GitLab repo automations with a scheduled or manual trigger.";
    }
    if (form.githubEnabled || form.githubCommentEnabled) {
      errors.form = "GitHub and GitLab cannot be enabled on the same automation.";
    }
  }

  if (form.triggerMode === "github" && form.pushBranches.length === 0) {
    errors.pushBranches = "Add at least one branch pattern.";
  }

  if (form.triggerMode === "github" && form.githubEvents.length === 0) {
    errors.githubEvents = "Choose at least one GitHub event.";
  }

  if (
    form.triggerMode === "scheduled" &&
    !isValidAutomationTimeZone(form.scheduledTimezone.trim() || "UTC")
  ) {
    errors.scheduledTimezone = "Choose a valid timezone.";
  }

  if (
    form.triggerMode === "scheduled" &&
    !errors.trigger &&
    !hasWorkspaceAutomationScheduledWorkflow(payload.toolConfig)
  ) {
    errors.trigger = WORKSPACE_AUTOMATION_API_ERROR_MESSAGES.scheduled_workflow_required;
  }

  if (form.slackEnabled && !parseSlackConversationId(form.slackChannelId)) {
    errors.slackChannelId = "Enter a valid Slack channel ID.";
  }

  if (form.emailEnabled) {
    if (form.emailRecipients.length === 0) {
      errors.emailRecipients = "Add at least one email recipient.";
    }
    if (!form.emailFrom.trim()) {
      errors.emailFrom = "Add a verified sender address.";
    }
  }

  if (form.intercomEnabled) {
    if (!form.intercomHelpCenterId.trim()) {
      errors.intercomHelpCenterId = "Choose an Intercom Help Center.";
    }
    if (form.intercomHelpCenterLocales.length === 0 && form.intercomTargetLocales.length === 0) {
      errors.intercomHelpCenterId = "Load Help Center locales before saving.";
    }
  }

  if (
    form.googleDriveEnabled &&
    form.googleDriveFolderIds.length === 0 &&
    form.googleDriveFileIds.length === 0
  ) {
    errors.googleDrive = "Choose at least one connected Google Drive folder or file.";
  }

  if (form.sanityEnabled) {
    if (!form.sanityProjectId.trim() || !form.sanityDataset.trim()) {
      errors.sanityProjectId = "Choose a Sanity project and dataset.";
    }
    if (form.sanityDocumentTypes.length === 0) {
      errors.sanityDocumentTypes = "Choose at least one document type.";
    }
    if (form.sanityLanguages.length === 0) {
      errors.sanityDataset = "Load dataset languages before saving.";
    }
    if (!form.sanitySourceLocale.trim()) {
      errors.sanitySourceLocale =
        "Choose a Sanity source locale that matches the project source language.";
    } else if (form.sanityDocumentTypes.length > 0 && form.sanityLanguages.length > 0) {
      const typeLanguages = new Map(
        Object.entries(form.sanityLanguagesByType).map(([name, languages]) => [name, languages]),
      );
      const unsupported = listUnsupportedSanitySourceDocumentTypes({
        sourceLocale: form.sanitySourceLocale,
        documentTypes: form.sanityDocumentTypes,
        languagesByType: form.sanityLanguagesByType,
        fallbackLanguages: form.sanityLanguages,
        typeLanguages,
      });
      if (unsupported.length > 0) {
        errors.sanitySourceLocale = `Source locale ${form.sanitySourceLocale} is not available for: ${unsupported.map((typeName) => sanityDocumentTypeTitle(typeName)).join(", ")}.`;
      }
    }
  }

  if (form.webflowEnabled) {
    if (!form.webflowConnectionId) {
      errors.webflowConnectionId = "Choose a Webflow connection.";
    }
    if (form.webflowCollectionIds.length === 0) {
      errors.webflowCollectionIds = "Choose at least one Webflow collection.";
    }
    if (!form.webflowSourceLocale.trim()) {
      errors.webflowSourceLocale =
        "Choose a Webflow source locale that matches the project source language.";
    }
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

  if (form.zernioEnabled && !form.zernioConnectionId) {
    errors.zernioConnectionId = "Choose a Zernio connection.";
  }

  if (form.crowdinEnabled && !form.crowdinProjectId.trim()) {
    errors.crowdinProjectId = "Choose a Crowdin-linked project.";
  }

  return errors;
}

/**
 * The errors still worth showing once the form has changed: those the form's own checks still
 * find. One the server reported, or one for a field since put right, goes. Returns the same
 * object when nothing goes, so the caller's state does not change.
 */
export function pruneWorkspaceAutomationFieldErrors(
  errors: Record<string, string | undefined>,
  form: WorkspaceAutomationFormState,
): Record<string, string | undefined> {
  const shown = Object.keys(errors).filter((key) => errors[key]);
  if (shown.length === 0) {
    return errors;
  }
  const current: Record<string, string | undefined> = validateWorkspaceAutomationFormState(form);
  const kept = shown.filter((key) => current[key]);
  if (kept.length === shown.length) {
    return errors;
  }
  return Object.fromEntries(kept.map((key) => [key, errors[key]]));
}

export function mapWorkspaceAutomationApiErrorToFieldErrors(
  errorCode: string,
): WorkspaceAutomationFieldErrors {
  const message = WORKSPACE_AUTOMATION_API_ERROR_MESSAGES[errorCode];
  if (!message) {
    return { form: "Unable to save this automation." };
  }

  switch (errorCode) {
    case "skill_not_found":
    case "skill_trigger_incompatible":
    case "skill_tools_required":
    case "cms_translation_skills_exclusive":
      return { skills: message };
    case "instructions_or_skill_required":
      return { instructions: message };
    case "github_repository_target_required":
    case "github_repository_not_enabled":
    case "github_repository_archived":
      return { githubRepository: message };
    case "gitlab_repository_target_required":
    case "gitlab_not_connected":
    case "gitlab_pipes_needs_reauthorization":
    case "gitlab_pipes_unavailable":
      return { gitlabRepository: message };
    case "gitlab_github_exclusive":
      return { form: message };
    case "project_required":
    case "github_project_required":
    case "contentful_project_required":
    case "translation_project_required":
    case "project_not_found":
      return { projectId: message };
    case "github_trigger_required":
    case "github_agent_trigger_required":
    case "gitlab_agent_trigger_required":
    case "scheduled_workflow_required":
    case "source_upload_workflow_required":
      return { trigger: message };
    case "invalid_automation_timezone":
      return { scheduledTimezone: message };
    case "github_push_branches_required":
      return { pushBranches: message };
    case "github_events_required":
      return { githubEvents: message };
    case "slack_not_connected":
    case "slack_channel_required":
      return { slackChannelId: message };
    case "email_not_connected":
    case "email_provider_not_connected":
    case "email_pipes_needs_reauthorization":
    case "email_pipes_unavailable":
    case "email_recipients_required":
      return { emailRecipients: message };
    case "email_from_required":
      return { emailFrom: message };
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
    case "zernio_connection_required":
    case "zernio_connection_not_found":
    case "zernio_not_connected":
      return { zernioConnectionId: message };
    case "ahrefs_not_connected":
    case "ahrefs_pipes_needs_reauthorization":
    case "ahrefs_pipes_unavailable":
      return { ahrefs: message };
    case "intercom_not_connected":
    case "intercom_pipes_needs_reauthorization":
    case "intercom_pipes_unavailable":
      return { intercom: message };
    case "intercom_help_center_required":
    case "intercom_target_locales_unmapped":
      return { intercomHelpCenterId: message };
    case "intercom_source_locale_unmapped":
    case "intercom_source_locale_mismatch":
      return { intercomSourceLocale: message };
    case "sanity_not_connected":
    case "sanity_pipes_needs_reauthorization":
    case "sanity_pipes_unavailable":
      return { sanity: message };
    case "sanity_project_required":
      return { sanityProjectId: message, sanityDataset: message };
    case "sanity_document_types_required":
      return { sanityDocumentTypes: message };
    case "sanity_target_locales_unmapped":
      return { sanityTargetLocales: message };
    case "sanity_source_locale_unmapped":
    case "sanity_source_locale_mismatch":
      return { sanitySourceLocale: message };
    case "webflow_not_connected":
      return { webflow: message };
    case "webflow_connection_required":
      return { webflowConnectionId: message };
    case "webflow_collection_ids_required":
      return { webflowCollectionIds: message };
    case "webflow_source_locale_mismatch":
      return { webflowSourceLocale: message };
    case "braze_not_connected":
    case "braze_pipes_needs_reauthorization":
    case "braze_pipes_unavailable":
    case "braze_endpoint_missing":
    case "braze_skills_exclusive":
      return { braze: message };
    case "braze_source_locale_mismatch":
      return { brazeSourceLocale: message };
    case "customer_io_not_connected":
    case "customer_io_pipes_needs_reauthorization":
    case "customer_io_pipes_unavailable":
      return { customerIo: message };
    case "loops_not_connected":
    case "loops_pipes_needs_reauthorization":
    case "loops_pipes_unavailable":
      return { loops: message };
    case "hubspot_not_connected":
    case "hubspot_pipes_needs_reauthorization":
    case "hubspot_pipes_unavailable":
      return { hubspot: message };
    case "crowdin_project_required":
    case "crowdin_project_not_found":
    case "crowdin_project_not_linked":
    case "crowdin_not_connected":
      return { crowdinProjectId: message };
    case "content_sync_config_required":
      return { syncConnectionId: message };
    case "content_sync_provider_folder_required":
      return { syncProviderFolder: message };
    case "content_sync_folder_invalid":
      return { syncProjectFolder: message };
    case "content_sync_duplicate":
    case "content_sync_connection_required":
      return { form: message };
    default:
      return { form: message };
  }
}

export function workspaceAutomationFormSupportsOnDemandRun(
  triggerMode: WorkspaceAutomationTriggerMode,
) {
  return triggerMode === "manual" || triggerMode === "scheduled";
}

/** The form as a save would store it, where that differs from what was typed. */
function storedWorkspaceAutomationForm(
  form: WorkspaceAutomationFormState,
): WorkspaceAutomationFormState {
  const slackChannelId = parseSlackConversationId(form.slackChannelId);
  return slackChannelId && slackChannelId !== form.slackChannelId
    ? { ...form, slackChannelId }
    : form;
}

/**
 * A pasted Slack channel link and the ID it is saved as count as the same value, so a form left
 * holding the link is not unsaved once the ID has been stored.
 */
export function workspaceAutomationFormHasChanges(
  current: WorkspaceAutomationFormState,
  saved: WorkspaceAutomationFormState,
) {
  return (
    JSON.stringify(storedWorkspaceAutomationForm(current)) !==
    JSON.stringify(storedWorkspaceAutomationForm(saved))
  );
}

export function workspaceAutomationFormCanActivate(form: WorkspaceAutomationFormState) {
  if (form.kind === "content_sync") {
    return Boolean(
      form.projectId.trim() && form.syncConnectionId.trim() && form.syncResourceKey.trim(),
    );
  }

  if (form.triggerMode === "web_chat") {
    return true;
  }

  return (
    form.githubEnabled ||
    form.gitlabEnabled ||
    form.slackEnabled ||
    form.emailEnabled ||
    form.githubCommentEnabled ||
    form.contentfulEnabled ||
    form.intercomEnabled ||
    form.googleDriveEnabled ||
    form.sanityEnabled ||
    form.webflowEnabled ||
    form.brazeEnabled ||
    form.brazeCampaignsEnabled ||
    form.customerIoEnabled ||
    form.loopsEnabled ||
    form.hubspotEnabled ||
    form.createNativeTmsJobEnabled ||
    form.assignTranslateWithAgentEnabled ||
    form.listIssuesEnabled ||
    form.createIssueEnabled ||
    form.mcpEnabled ||
    form.semrushEnabled ||
    form.zernioEnabled ||
    form.ahrefsEnabled ||
    form.crowdinEnabled ||
    form.webSearchEnabled ||
    form.knowledgeFilesEnabled
  );
}
