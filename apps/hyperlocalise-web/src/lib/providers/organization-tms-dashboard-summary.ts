import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  listOrganizationExternalTmsProviderCredentialDetails,
  type ExternalTmsProviderCredentialListItem,
} from "./organization-external-tms-provider-credentials";

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

const OPEN_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;

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

function emptySummary(): OrganizationTmsDashboardSummary {
  return {
    providers: [],
    counts: {
      connectedProviders: 0,
      externalProjects: 0,
      staleFiles: 0,
      staleGlossaries: 0,
      staleMemories: 0,
      failedSyncRuns: 0,
      syncErrorGlossaries: 0,
      syncErrorMemories: 0,
      openProviderJobs: 0,
      pendingProviderJobSync: 0,
    },
    localeReadiness: [],
    recentFailedSyncRuns: [],
  };
}

export async function getOrganizationTmsDashboardSummary(
  organizationId: string,
): Promise<OrganizationTmsDashboardSummary> {
  const providers = await listOrganizationExternalTmsProviderCredentialDetails(organizationId);
  if (providers.length === 0) {
    return emptySummary();
  }

  const orgCondition = eq(schema.externalTmsFiles.organizationId, organizationId);

  const [
    externalProjectsRow,
    staleFilesRow,
    staleGlossariesRow,
    staleMemoriesRow,
    failedSyncRunsRow,
    syncErrorGlossariesRow,
    syncErrorMemoriesRow,
    openProviderJobsRow,
    pendingProviderJobSyncRow,
    localeReadinessFiles,
    recentFailedSyncRuns,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.source, "external_tms"),
          eq(schema.projects.isActive, true),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.externalTmsFiles)
      .where(and(orgCondition, eq(schema.externalTmsFiles.syncState, "stale"))),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.organizationId, organizationId),
          eq(schema.glossaries.syncState, "stale"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.organizationId, organizationId),
          eq(schema.memories.syncState, "stale"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, organizationId),
          eq(schema.providerSyncRuns.status, "failed"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.glossaries)
      .where(
        and(
          eq(schema.glossaries.organizationId, organizationId),
          isNotNull(schema.glossaries.lastSyncErrorAt),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.memories)
      .where(
        and(
          eq(schema.memories.organizationId, organizationId),
          isNotNull(schema.memories.lastSyncErrorAt),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.organizationId, organizationId),
          inArray(schema.jobs.status, [...OPEN_JOB_STATUSES]),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(schema.externalJobDetails)
      .where(
        and(
          eq(schema.externalJobDetails.organizationId, organizationId),
          eq(schema.externalJobDetails.syncState, "pending"),
        ),
      ),
    db
      .select({ localeReadiness: schema.externalTmsFiles.localeReadiness })
      .from(schema.externalTmsFiles)
      .where(
        and(orgCondition, sql`jsonb_typeof(${schema.externalTmsFiles.localeReadiness}) = 'object'`),
      )
      .limit(500),
    db
      .select({
        id: schema.providerSyncRuns.id,
        providerKind: schema.providerSyncRuns.providerKind,
        kind: schema.providerSyncRuns.kind,
        errorMessage: schema.providerSyncRuns.errorMessage,
        startedAt: schema.providerSyncRuns.startedAt,
      })
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, organizationId),
          eq(schema.providerSyncRuns.status, "failed"),
        ),
      )
      .orderBy(sql`${schema.providerSyncRuns.startedAt} desc`)
      .limit(5),
  ]);

  const counts: TmsDashboardSummaryCounts = {
    connectedProviders: providers.length,
    externalProjects: externalProjectsRow[0]?.count ?? 0,
    staleFiles: staleFilesRow[0]?.count ?? 0,
    staleGlossaries: staleGlossariesRow[0]?.count ?? 0,
    staleMemories: staleMemoriesRow[0]?.count ?? 0,
    failedSyncRuns: failedSyncRunsRow[0]?.count ?? 0,
    syncErrorGlossaries: syncErrorGlossariesRow[0]?.count ?? 0,
    syncErrorMemories: syncErrorMemoriesRow[0]?.count ?? 0,
    openProviderJobs: openProviderJobsRow[0]?.count ?? 0,
    pendingProviderJobSync: pendingProviderJobSyncRow[0]?.count ?? 0,
  };

  return {
    providers,
    counts,
    localeReadiness: aggregateLocaleReadiness(
      localeReadinessFiles.map((row) => ({
        localeReadiness: row.localeReadiness as Record<string, unknown>,
      })),
    ),
    recentFailedSyncRuns: recentFailedSyncRuns.map((run) => ({
      id: run.id,
      providerKind: run.providerKind,
      kind: run.kind,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt.toISOString(),
    })),
  };
}
