import type {
  translationJobs,
  organizationMembershipRoleEnum,
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
