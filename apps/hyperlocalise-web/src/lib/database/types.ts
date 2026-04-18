import type {
  translationJobs,
  organizationMembershipRoleEnum,
  teamMembershipRoleEnum,
  teamMemberships,
  teams,
  translationProjects,
  translationJobOutcomeKindEnum,
  translationJobStatusEnum,
  translationJobTypeEnum,
} from "@/lib/database/schema";

export type TranslationProject = typeof translationProjects.$inferSelect;
export type NewTranslationProject = typeof translationProjects.$inferInsert;

export type TranslationJob = typeof translationJobs.$inferSelect;
export type NewTranslationJob = typeof translationJobs.$inferInsert;

export type TranslationJobType = (typeof translationJobTypeEnum.enumValues)[number];
export type TranslationJobStatus = (typeof translationJobStatusEnum.enumValues)[number];
export type TranslationJobOutcomeKind = (typeof translationJobOutcomeKindEnum.enumValues)[number];
export type OrganizationMembershipRole = (typeof organizationMembershipRoleEnum.enumValues)[number];
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type NewTeamMembership = typeof teamMemberships.$inferInsert;
export type TeamMembershipRole = (typeof teamMembershipRoleEnum.enumValues)[number];
