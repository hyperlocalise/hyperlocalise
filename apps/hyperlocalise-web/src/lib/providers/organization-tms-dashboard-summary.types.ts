import type { ExternalTmsProviderCredentialListItem } from "./organization-external-tms-provider-credentials";

export type TmsDashboardLocaleReadinessRow = {
  locale: string;
  ready: number;
  missing: number;
  changed: number;
  fileCount: number;
};

export type TmsDashboardSummaryCounts = {
  connectedProviders: number;
  externalProjects: number;
  staleFiles: number;
  staleGlossaries: number;
  staleMemories: number;
  failedSyncRuns: number;
  syncErrorGlossaries: number;
  syncErrorMemories: number;
  openProviderJobs: number;
  pendingProviderJobSync: number;
};

export type TmsDashboardFailedSyncRun = {
  id: string;
  providerKind: string;
  kind: string;
  errorMessage: string | null;
  startedAt: string;
};

export type OrganizationTmsDashboardSummary = {
  providers: ExternalTmsProviderCredentialListItem[];
  counts: TmsDashboardSummaryCounts;
  localeReadiness: TmsDashboardLocaleReadinessRow[];
  recentFailedSyncRuns: TmsDashboardFailedSyncRun[];
};

export const FAILED_SYNC_RUNS_RECENCY_DAYS = 30;

export function aggregateLocaleReadiness(
  files: { localeReadiness: Record<string, unknown> }[],
): TmsDashboardLocaleReadinessRow[] {
  const byLocale = new Map<
    string,
    { ready: number; missing: number; changed: number; fileCount: number }
  >();

  for (const file of files) {
    for (const [locale, value] of Object.entries(file.localeReadiness)) {
      const entry = byLocale.get(locale) ?? { ready: 0, missing: 0, changed: 0, fileCount: 0 };
      entry.fileCount += 1;
      if (value === "ready" || value === "complete") {
        entry.ready += 1;
      } else if (value === "missing" || value === "stale") {
        entry.missing += 1;
      } else if (value === "changed") {
        entry.changed += 1;
      }
      byLocale.set(locale, entry);
    }
  }

  return Array.from(byLocale.entries())
    .map(([locale, stats]) => ({ locale, ...stats }))
    .sort((a, b) => {
      if (b.missing !== a.missing) return b.missing - a.missing;
      if (b.changed !== a.changed) return b.changed - a.changed;
      return a.locale.localeCompare(b.locale);
    })
    .slice(0, 12);
}
