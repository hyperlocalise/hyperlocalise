import type {
  agentRuns,
  agentRunKindEnum,
  agentRunStatusEnum,
  githubInstallations,
  glossaries,
  memories,
  jobs,
  jobKindEnum,
  jobAssigneeRoleEnum,
  jobStatusEnum,
  llmProviderEnum,
  mcpOAuthClients,
  mcpSessions,
  organizationApiKeys,
  organizationLifecycleStatusEnum,
  organizationLlmProviderCredentials,
  providerSyncIntentCauseEnum,
  providerSyncIntents,
  providerSyncIntentStatusEnum,
  providerSyncRunKindEnum,
  providerSyncRuns,
  providerSyncRunStatusEnum,
  providerWebhookEventProcessingStatusEnum,
  providerWebhookEvents,
  providerWebhookSubscriptionStatusEnum,
  providerWebhookSubscriptions,
  repositorySourceFiles,
  repositorySourceFileVersions,
  translationJobDetails,
  organizationMembershipRoleEnum,
  teamMembershipRoleEnum,
  teamMemberships,
  teams,
  projects,
  interactions,
  inboxItems,
  interactionMessages,
  connectors,
  tmsLinks,
} from "@/lib/database/schema";

export type Glossary = typeof glossaries.$inferSelect;
export type NewGlossary = typeof glossaries.$inferInsert;

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobKind = (typeof jobKindEnum.enumValues)[number];
export type JobAssigneeRole = (typeof jobAssigneeRoleEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type TranslationJobDetails = typeof translationJobDetails.$inferSelect;
export type NewTranslationJobDetails = typeof translationJobDetails.$inferInsert;
export type RepositorySourceFile = typeof repositorySourceFiles.$inferSelect;
export type NewRepositorySourceFile = typeof repositorySourceFiles.$inferInsert;
export type RepositorySourceFileVersion = typeof repositorySourceFileVersions.$inferSelect;
export type NewRepositorySourceFileVersion = typeof repositorySourceFileVersions.$inferInsert;
export type OrganizationMembershipRole = (typeof organizationMembershipRoleEnum.enumValues)[number];
export type OrganizationLifecycleStatus =
  (typeof organizationLifecycleStatusEnum.enumValues)[number];
export type LlmProvider = (typeof llmProviderEnum.enumValues)[number];
export type OrganizationApiKey = typeof organizationApiKeys.$inferSelect;
export type NewOrganizationApiKey = typeof organizationApiKeys.$inferInsert;
export type McpOAuthClient = typeof mcpOAuthClients.$inferSelect;
export type NewMcpOAuthClient = typeof mcpOAuthClients.$inferInsert;
export type McpSession = typeof mcpSessions.$inferSelect;
export type NewMcpSession = typeof mcpSessions.$inferInsert;
export type OrganizationLlmProviderCredential =
  typeof organizationLlmProviderCredentials.$inferSelect;
export type NewOrganizationLlmProviderCredential =
  typeof organizationLlmProviderCredentials.$inferInsert;
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type AgentRunKind = (typeof agentRunKindEnum.enumValues)[number];
export type AgentRunStatus = (typeof agentRunStatusEnum.enumValues)[number];
export type ProviderSyncRun = typeof providerSyncRuns.$inferSelect;
export type NewProviderSyncRun = typeof providerSyncRuns.$inferInsert;
export type ProviderSyncRunKind = (typeof providerSyncRunKindEnum.enumValues)[number];
export type ProviderSyncRunStatus = (typeof providerSyncRunStatusEnum.enumValues)[number];
export type ProviderSyncIntent = typeof providerSyncIntents.$inferSelect;
export type NewProviderSyncIntent = typeof providerSyncIntents.$inferInsert;
export type ProviderSyncIntentCause = (typeof providerSyncIntentCauseEnum.enumValues)[number];
export type ProviderSyncIntentStatus = (typeof providerSyncIntentStatusEnum.enumValues)[number];
export type ProviderWebhookSubscription = typeof providerWebhookSubscriptions.$inferSelect;
export type NewProviderWebhookSubscription = typeof providerWebhookSubscriptions.$inferInsert;
export type ProviderWebhookSubscriptionStatus =
  (typeof providerWebhookSubscriptionStatusEnum.enumValues)[number];
export type ProviderWebhookEvent = typeof providerWebhookEvents.$inferSelect;
export type NewProviderWebhookEvent = typeof providerWebhookEvents.$inferInsert;
export type ProviderWebhookEventProcessingStatus =
  (typeof providerWebhookEventProcessingStatusEnum.enumValues)[number];
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type NewTeamMembership = typeof teamMemberships.$inferInsert;
export type TeamMembershipRole = (typeof teamMembershipRoleEnum.enumValues)[number];
export type GitHubInstallation = typeof githubInstallations.$inferSelect;
export type NewGitHubInstallation = typeof githubInstallations.$inferInsert;

export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
export type InboxItem = typeof inboxItems.$inferSelect;
export type NewInboxItem = typeof inboxItems.$inferInsert;
export type InteractionMessage = typeof interactionMessages.$inferSelect;
export type NewInteractionMessage = typeof interactionMessages.$inferInsert;
export type Connector = typeof connectors.$inferSelect;
export type NewConnector = typeof connectors.$inferInsert;
export type TmsLink = typeof tmsLinks.$inferSelect;
export type NewTmsLink = typeof tmsLinks.$inferInsert;
