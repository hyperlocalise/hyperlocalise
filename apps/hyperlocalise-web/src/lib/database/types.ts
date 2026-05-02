import type {
  githubInstallations,
  jobs,
  jobKindEnum,
  jobStatusEnum,
  llmProviderEnum,
  organizationLlmProviderCredentials,
  translationJobDetails,
  organizationMembershipRoleEnum,
  teamMembershipRoleEnum,
  teamMemberships,
  teams,
  projects,
  translationJobOutcomeKindEnum,
  translationJobTypeEnum,
  interactions,
  inboxItems,
  interactionMessages,
  connectors,
  tmsLinks,
} from "@/lib/database/schema";

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type JobKind = (typeof jobKindEnum.enumValues)[number];
export type JobStatus = (typeof jobStatusEnum.enumValues)[number];
export type TranslationJobDetails = typeof translationJobDetails.$inferSelect;
export type NewTranslationJobDetails = typeof translationJobDetails.$inferInsert;

/**
 * @deprecated Prefer `JobKind`, `JobStatus`, and `TranslationJobDetails`.
 * Translation-specific job fields now live in `translation_job_details`.
 */
export type TranslationJobType = (typeof translationJobTypeEnum.enumValues)[number];
/**
 * @deprecated Use `JobStatus` for all job lifecycle state.
 */
export type TranslationJobStatus = JobStatus;
/**
 * @deprecated Prefer reading `TranslationJobDetails["outcomeKind"]` for translation jobs.
 */
export type TranslationJobOutcomeKind = (typeof translationJobOutcomeKindEnum.enumValues)[number];
export type OrganizationMembershipRole = (typeof organizationMembershipRoleEnum.enumValues)[number];
export type LlmProvider = (typeof llmProviderEnum.enumValues)[number];
export type OrganizationLlmProviderCredential =
  typeof organizationLlmProviderCredentials.$inferSelect;
export type NewOrganizationLlmProviderCredential =
  typeof organizationLlmProviderCredentials.$inferInsert;
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
