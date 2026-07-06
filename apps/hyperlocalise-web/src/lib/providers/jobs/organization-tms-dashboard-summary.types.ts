import type { ExternalTmsProviderKind } from "@/lib/providers/credentials/organization-external-tms-provider-credentials";

export type TmsDashboardProviderItem = {
  id: string;
  providerKind: ExternalTmsProviderKind;
  displayName: string;
  validationStatus: string;
  projectCount: number;
  lastMaterializedAt: string | null;
};

export type TmsDashboardSummaryCounts = {
  connectedProviders: number;
  externalProjects: number;
  openProviderJobs: number;
};

export type OrganizationTmsDashboardSummary = {
  providers: TmsDashboardProviderItem[];
  counts: TmsDashboardSummaryCounts;
};
