import { and, eq, inArray, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database";

import {
  listOrganizationExternalTmsProviderCredentialDetails,
  listOrganizationExternalTmsProviderCredentialSummaries,
} from "@/lib/providers/credentials/organization-external-tms-provider-credentials";
import type { TmsDashboardProviderItem } from "./organization-tms-dashboard-summary.types";

export {
  type OrganizationTmsDashboardSummary,
  type TmsDashboardSummaryCounts,
} from "./organization-tms-dashboard-summary.types";

import {
  type OrganizationTmsDashboardSummary,
  type TmsDashboardSummaryCounts,
} from "./organization-tms-dashboard-summary.types";

const OPEN_JOB_STATUSES = ["queued", "running", "waiting_for_review"] as const;

function emptySummary(): OrganizationTmsDashboardSummary {
  return {
    providers: [],
    counts: {
      connectedProviders: 0,
      externalProjects: 0,
      openProviderJobs: 0,
    },
  };
}

async function listTmsDashboardProviders(
  organizationId: string,
  includeCredentialDetails: boolean,
): Promise<TmsDashboardProviderItem[]> {
  if (includeCredentialDetails) {
    const providers = await listOrganizationExternalTmsProviderCredentialDetails(organizationId);
    const providerKinds = providers.map((provider) => provider.providerKind);
    const lastMaterializedByProvider =
      providerKinds.length === 0
        ? []
        : await db
            .select({
              providerKind: schema.projects.externalProviderKind,
              materializedAt: sql<Date | null>`max(${schema.projects.lastSyncedAt})`.mapWith((v) =>
                v == null ? null : new Date(v),
              ),
            })
            .from(schema.projects)
            .where(
              and(
                eq(schema.projects.organizationId, organizationId),
                eq(schema.projects.source, "external_tms"),
                inArray(schema.projects.externalProviderKind, providerKinds),
              ),
            )
            .groupBy(schema.projects.externalProviderKind);

    const lastMaterializedMap = Object.fromEntries(
      lastMaterializedByProvider.map((row) => [
        row.providerKind,
        row.materializedAt?.toISOString() ?? null,
      ]),
    ) as Record<string, string | null>;

    return providers.map((provider) => ({
      id: provider.id,
      providerKind: provider.providerKind,
      displayName: provider.displayName,
      validationStatus: provider.validationStatus,
      projectCount: provider.projectCount,
      lastMaterializedAt: lastMaterializedMap[provider.providerKind] ?? null,
    }));
  }

  const summaries = await listOrganizationExternalTmsProviderCredentialSummaries(organizationId);
  if (summaries.length === 0) {
    return [];
  }

  const providerKinds = summaries.map((credential) => credential.providerKind);
  const [projectCounts, lastMaterialized] = await Promise.all([
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
        providerKind: schema.projects.externalProviderKind,
        materializedAt: sql<Date | null>`max(${schema.projects.lastSyncedAt})`.mapWith((v) =>
          v == null ? null : new Date(v),
        ),
      })
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, organizationId),
          eq(schema.projects.source, "external_tms"),
          inArray(schema.projects.externalProviderKind, providerKinds),
        ),
      )
      .groupBy(schema.projects.externalProviderKind),
  ]);

  const projectCountByProvider = Object.fromEntries(
    projectCounts.map((row) => [row.providerKind, row.count]),
  ) as Record<string, number>;
  const lastMaterializedByProvider = Object.fromEntries(
    lastMaterialized.map((row) => [row.providerKind, row.materializedAt?.toISOString() ?? null]),
  ) as Record<string, string | null>;

  return summaries.map((credential) => ({
    id: credential.id,
    providerKind: credential.providerKind,
    displayName: credential.displayName,
    validationStatus: credential.validationStatus,
    projectCount: projectCountByProvider[credential.providerKind] ?? 0,
    lastMaterializedAt: lastMaterializedByProvider[credential.providerKind] ?? null,
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

  const [externalProjectsRow, openProviderJobsRow] = await Promise.all([
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
      .from(schema.jobs)
      .innerJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(
        and(
          eq(schema.jobs.organizationId, organizationId),
          inArray(schema.jobs.status, [...OPEN_JOB_STATUSES]),
        ),
      ),
  ]);

  const counts: TmsDashboardSummaryCounts = {
    connectedProviders: providers.length,
    externalProjects: externalProjectsRow[0]?.count ?? 0,
    openProviderJobs: openProviderJobsRow[0]?.count ?? 0,
  };

  return {
    providers,
    counts,
  };
}
