import { and, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  listOrganizationExternalTmsProviderCredentialDetails,
  listOrganizationExternalTmsProviderCredentialSummaries,
} from "./organization-external-tms-provider-credentials";
import type { TmsDashboardProviderItem } from "./organization-tms-dashboard-summary.types";

export {
  FAILED_SYNC_RUNS_RECENCY_DAYS,
  aggregateLocaleReadiness,
  type OrganizationTmsDashboardSummary,
  type TmsDashboardFailedSyncRun,
  type TmsDashboardLocaleReadinessRow,
  type TmsDashboardSummaryCounts,
} from "./organization-tms-dashboard-summary.types";

import {
  FAILED_SYNC_RUNS_RECENCY_DAYS,
  type OrganizationTmsDashboardSummary,
  type TmsDashboardLocaleReadinessRow,
  type TmsDashboardSummaryCounts,
} from "./organization-tms-dashboard-summary.types";

const OPEN_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;
const LOCALE_READINESS_TOP_LOCALES = 12;

function failedSyncRunsSince() {
  const since = new Date();
  since.setDate(since.getDate() - FAILED_SYNC_RUNS_RECENCY_DAYS);
  return since;
}

function recentFailedSyncRunConditions(organizationId: string) {
  return and(
    eq(schema.providerSyncRuns.organizationId, organizationId),
    eq(schema.providerSyncRuns.status, "failed"),
    gte(schema.providerSyncRuns.startedAt, failedSyncRunsSince()),
  );
}

async function fetchAggregatedLocaleReadiness(
  organizationId: string,
): Promise<TmsDashboardLocaleReadinessRow[]> {
  const { rows } = await db.$client.query<{
    locale: string;
    ready: string;
    missing: string;
    changed: string;
    file_count: string;
  }>(
    `
      SELECT
        lr.locale_key AS locale,
        COUNT(*) FILTER (WHERE lr.locale_value IN ('ready', 'complete'))::int AS ready,
        COUNT(*) FILTER (WHERE lr.locale_value IN ('missing', 'stale'))::int AS missing,
        COUNT(*) FILTER (WHERE lr.locale_value = 'changed')::int AS changed,
        COUNT(*)::int AS file_count
      FROM external_tms_files etf
      CROSS JOIN LATERAL jsonb_each_text(etf.locale_readiness) AS lr(locale_key, locale_value)
      WHERE etf.organization_id = $1::uuid
        AND jsonb_typeof(etf.locale_readiness) = 'object'
      GROUP BY lr.locale_key
      ORDER BY missing DESC, changed DESC, locale ASC
      LIMIT $2
    `,
    [organizationId, LOCALE_READINESS_TOP_LOCALES],
  );

  return rows.map((row) => ({
    locale: row.locale,
    ready: Number(row.ready),
    missing: Number(row.missing),
    changed: Number(row.changed),
    fileCount: Number(row.file_count),
  }));
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

async function listTmsDashboardProviders(
  organizationId: string,
  includeCredentialDetails: boolean,
): Promise<TmsDashboardProviderItem[]> {
  if (includeCredentialDetails) {
    const providers = await listOrganizationExternalTmsProviderCredentialDetails(organizationId);
    return providers.map((provider) => ({
      id: provider.id,
      providerKind: provider.providerKind,
      displayName: provider.displayName,
      validationStatus: provider.validationStatus,
      projectCount: provider.projectCount,
      lastSuccessfulSyncAt: provider.lastSuccessfulSyncAt,
    }));
  }

  const summaries = await listOrganizationExternalTmsProviderCredentialSummaries(organizationId);
  if (summaries.length === 0) {
    return [];
  }

  const providerKinds = summaries.map((credential) => credential.providerKind);
  const [projectCounts, lastSyncs] = await Promise.all([
    db
      .select({
        providerKind: schema.projects.externalProviderKind,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.source, "external_tms"),
          eq(schema.projects.isActive, true),
          inArray(schema.projects.externalProviderKind, providerKinds),
        ),
      )
      .groupBy(schema.projects.externalProviderKind),
    db
      .select({
        providerKind: schema.providerSyncRuns.providerKind,
        completedAt: sql<Date | null>`max(${schema.providerSyncRuns.completedAt})`.mapWith((v) =>
          v == null ? null : new Date(v),
        ),
      })
      .from(schema.providerSyncRuns)
      .where(
        and(
          eq(schema.providerSyncRuns.organizationId, organizationId),
          eq(schema.providerSyncRuns.status, "succeeded"),
          ne(schema.providerSyncRuns.kind, "health_check"),
          inArray(schema.providerSyncRuns.providerKind, providerKinds),
        ),
      )
      .groupBy(schema.providerSyncRuns.providerKind),
  ]);

  const projectCountByProvider = Object.fromEntries(
    projectCounts.map((row) => [row.providerKind, row.count]),
  ) as Record<string, number>;
  const lastSyncByProvider = Object.fromEntries(
    lastSyncs.map((row) => [row.providerKind, row.completedAt?.toISOString() ?? null]),
  ) as Record<string, string | null>;

  return summaries.map((credential) => ({
    id: credential.id,
    providerKind: credential.providerKind,
    displayName: credential.displayName,
    validationStatus: credential.validationStatus,
    projectCount: projectCountByProvider[credential.providerKind] ?? 0,
    lastSuccessfulSyncAt: lastSyncByProvider[credential.providerKind] ?? null,
  }));
}

export async function getOrganizationTmsDashboardSummary(
  organizationId: string,
  options: { includeCredentialDetails?: boolean } = {},
): Promise<OrganizationTmsDashboardSummary> {
  const providers = await listTmsDashboardProviders(
    organizationId,
    options.includeCredentialDetails ?? false,
  );
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
    localeReadinessRows,
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
      .where(recentFailedSyncRunConditions(organizationId)),
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
    fetchAggregatedLocaleReadiness(organizationId),
    db
      .select({
        id: schema.providerSyncRuns.id,
        providerKind: schema.providerSyncRuns.providerKind,
        kind: schema.providerSyncRuns.kind,
        errorMessage: schema.providerSyncRuns.errorMessage,
        startedAt: schema.providerSyncRuns.startedAt,
      })
      .from(schema.providerSyncRuns)
      .where(recentFailedSyncRunConditions(organizationId))
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
    localeReadiness: localeReadinessRows,
    recentFailedSyncRuns: recentFailedSyncRuns.map((run) => ({
      id: run.id,
      providerKind: run.providerKind,
      kind: run.kind,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt.toISOString(),
    })),
  };
}
