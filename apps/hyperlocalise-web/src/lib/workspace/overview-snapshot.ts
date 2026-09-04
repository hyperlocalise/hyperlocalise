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
import "server-only";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import {
  buildAccessibleProjectsWhere,
  buildOrganizationJobsListWhere,
} from "@/api/auth/team-access";
import { listWorkspaceAutomations } from "@/lib/agents/workspace-automations";
import { db, schema } from "@/lib/database/client";
import { listOrganizationJobs } from "@/lib/projects/jobs/organization-job-query-service";
import { listOrganizationProjects } from "@/lib/projects/organization/organization-project-service";
import { organizationIssueService } from "@/lib/projects/issue-sheet/organization-issue-service";
import { resolveJobProjectId } from "@/lib/providers/jobs/tms-provider-resource-id";

import {
  OVERVIEW_AUTOMATION_LIMIT,
  OVERVIEW_BOARD_LIMIT,
  OVERVIEW_LOOKBACK_DAYS,
  OVERVIEW_PROJECT_LIMIT,
  fillDailySeries,
  formatOverviewLocaleRoute,
  overviewJobKindLabel,
  overviewJobTitle,
  rankOverviewActivity,
  type OverviewActivityItem,
  type OverviewJobTitleInput,
  type WorkspaceOverviewSnapshot,
} from "./overview-snapshot-model";

export type { WorkspaceOverviewSnapshot } from "./overview-snapshot-model";

const PROVIDER_LABELS: Record<string, string> = {
  crowdin: "Crowdin",
  smartling: "Smartling",
  phrase: "Phrase",
  lokalise: "Lokalise",
};

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function overviewJobHref(
  organizationSlug: string,
  projectId: string | null | undefined,
  jobId: string,
): string | null {
  const resolvedProjectId = resolveJobProjectId(projectId, jobId);
  if (!resolvedProjectId) {
    return null;
  }

  return `/org/${organizationSlug}/projects/${encodeURIComponent(resolvedProjectId)}/jobs/${encodeURIComponent(jobId)}`;
}

function overviewIssueHref(organizationSlug: string, projectId: string, issueId: string): string {
  return `/org/${encodeURIComponent(organizationSlug)}/projects/${encodeURIComponent(projectId)}/issue-sheet/${encodeURIComponent(issueId)}`;
}

function providerLabel(kind: string | null | undefined): string | null {
  if (!kind) {
    return null;
  }
  return PROVIDER_LABELS[kind] ?? kind;
}

type LatestProjectJob = OverviewJobTitleInput & {
  projectId: string | null;
  updatedAt: Date;
};

async function loadDailyCounts(
  auth: ApiAuthContext,
  since: Date,
): Promise<{
  jobs: { day: string; count: number }[];
  translations: { day: string; count: number }[];
}> {
  const organizationId = auth.organization.localOrganizationId;
  const [accessibleJobsWhere, accessibleProjectsWhere] = await Promise.all([
    buildOrganizationJobsListWhere(auth),
    buildAccessibleProjectsWhere(auth),
  ]);

  const [jobRows, translationRows] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.jobs.createdAt} at time zone 'utc'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.jobs)
      .where(and(accessibleJobsWhere, gte(schema.jobs.createdAt, since)))
      .groupBy(sql`1`),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.projectTranslations.updatedAt} at time zone 'utc'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.projectTranslations)
      .innerJoin(
        schema.projects,
        and(
          eq(schema.projects.id, schema.projectTranslations.projectId),
          eq(schema.projects.organizationId, schema.projectTranslations.organizationId),
        ),
      )
      .where(
        and(
          eq(schema.projectTranslations.organizationId, organizationId),
          accessibleProjectsWhere,
          gte(schema.projectTranslations.updatedAt, since),
        ),
      )
      .groupBy(sql`1`),
  ]);

  return { jobs: jobRows, translations: translationRows };
}

async function loadRecentAutomationRuns(organizationId: string) {
  return db
    .select({
      id: schema.workspaceAutomationRuns.id,
      automationId: schema.workspaceAutomationRuns.automationId,
      automationName: schema.workspaceAutomations.name,
      status: schema.workspaceAutomationRuns.status,
      triggerSource: schema.workspaceAutomationRuns.triggerSource,
      createdAt: schema.workspaceAutomationRuns.createdAt,
      completedAt: schema.workspaceAutomationRuns.completedAt,
    })
    .from(schema.workspaceAutomationRuns)
    .innerJoin(
      schema.workspaceAutomations,
      eq(schema.workspaceAutomations.id, schema.workspaceAutomationRuns.automationId),
    )
    .where(
      and(
        eq(schema.workspaceAutomationRuns.organizationId, organizationId),
        eq(schema.workspaceAutomations.organizationId, organizationId),
        inArray(schema.workspaceAutomations.status, ["active", "paused"]),
      ),
    )
    .orderBy(desc(schema.workspaceAutomationRuns.createdAt))
    .limit(8);
}

async function loadProjectExtras(auth: ApiAuthContext, projectIds: readonly string[]) {
  const empty = {
    latestByProject: new Map<string, LatestProjectJob>(),
    failedCounts: new Map<string, number>(),
    domains: new Map<string, string>(),
  };

  if (projectIds.length === 0) {
    return empty;
  }

  const organizationId = auth.organization.localOrganizationId;
  const accessibleJobsWhere = await buildOrganizationJobsListWhere(auth);

  const [latestJobRows, failedRows, domainRows] = await Promise.all([
    db
      .selectDistinctOn([schema.jobs.projectId], {
        id: schema.jobs.id,
        projectId: schema.jobs.projectId,
        kind: schema.jobs.kind,
        type: schema.translationJobDetails.type,
        inputPayload: schema.jobs.inputPayload,
        updatedAt: schema.jobs.updatedAt,
        externalTitle: schema.externalJobDetails.title,
        reviewCriteria: schema.reviewJobDetails.criteria,
        syncConnectorKind: schema.syncJobDetails.connectorKind,
        syncDirection: schema.syncJobDetails.direction,
      })
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
      .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
      .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .where(and(accessibleJobsWhere, inArray(schema.jobs.projectId, [...projectIds])))
      .orderBy(schema.jobs.projectId, desc(schema.jobs.updatedAt)),
    db
      .select({
        projectId: schema.jobs.projectId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(schema.jobs)
      .where(
        and(
          accessibleJobsWhere,
          inArray(schema.jobs.projectId, [...projectIds]),
          eq(schema.jobs.status, "failed"),
        ),
      )
      .groupBy(schema.jobs.projectId),
    db
      .select({
        projectId: schema.linkedDomains.projectId,
        domainKey: schema.linkedDomains.domainKey,
      })
      .from(schema.linkedDomains)
      .where(
        and(
          eq(schema.linkedDomains.organizationId, organizationId),
          eq(schema.linkedDomains.status, "verified"),
          inArray(schema.linkedDomains.projectId, [...projectIds]),
        ),
      ),
  ]);

  const latestByProject = new Map<string, LatestProjectJob>();
  for (const job of latestJobRows) {
    if (job.projectId) {
      latestByProject.set(job.projectId, job);
    }
  }

  return {
    latestByProject,
    failedCounts: new Map(
      failedRows.flatMap((row) => (row.projectId ? [[row.projectId, row.count] as const] : [])),
    ),
    domains: new Map(
      domainRows.flatMap((row) => (row.projectId ? [[row.projectId, row.domainKey] as const] : [])),
    ),
  };
}

export async function getWorkspaceOverviewSnapshot(
  auth: ApiAuthContext,
): Promise<WorkspaceOverviewSnapshot> {
  const organizationId = auth.organization.localOrganizationId;
  const organizationSlug = auth.organization.slug ?? "";
  const since = new Date(Date.now() - OVERVIEW_LOOKBACK_DAYS * 86_400_000);

  const [dailyCounts, automations, openIssues, p1Issues, recentJobs, projects, recentRuns] =
    await Promise.all([
      loadDailyCounts(auth, since),
      listWorkspaceAutomations({ organizationId, limit: 50 }),
      organizationIssueService.list(auth, {
        view: "all_open",
        sort: "status",
        limit: OVERVIEW_BOARD_LIMIT,
        offset: 0,
      }),
      organizationIssueService.list(auth, {
        view: "all_open",
        priority: "P1",
        sort: "status",
        limit: 1,
        offset: 0,
      }),
      listOrganizationJobs(auth, { limit: 8 }),
      listOrganizationProjects(auth),
      loadRecentAutomationRuns(organizationId),
    ]);

  const visibleAutomations = automations.filter((automation) => automation.status !== "archived");
  const previewProjects = projects.slice(0, OVERVIEW_PROJECT_LIMIT);
  const projectExtras = await loadProjectExtras(
    auth,
    previewProjects.map((project) => project.id),
  );

  const jobActivity: OverviewActivityItem[] = recentJobs.map((job) => ({
    id: job.id,
    kind: "job",
    title: overviewJobTitle(job),
    subtitle: [job.projectName ?? "Workspace", overviewJobKindLabel(job)]
      .filter(Boolean)
      .join(" · "),
    status: job.status,
    href: overviewJobHref(organizationSlug, job.projectId, job.id),
    updatedAt: toIso(job.updatedAt),
    attention: job.status === "failed",
  }));

  const automationActivity: OverviewActivityItem[] = recentRuns.map((run) => ({
    id: run.id,
    kind: "automation",
    title: run.automationName,
    subtitle: "Automation",
    status: run.status,
    href: `/org/${organizationSlug}/automations/${encodeURIComponent(run.automationId)}`,
    updatedAt: toIso(run.completedAt ?? run.createdAt),
    attention: run.status === "failed",
  }));

  const jobSeries = fillDailySeries(dailyCounts.jobs);
  const translationSeries = fillDailySeries(dailyCounts.translations);

  return {
    metrics: {
      jobs: {
        count: jobSeries.reduce((total, value) => total + value, 0),
        series: jobSeries,
      },
      translations: {
        count: translationSeries.reduce((total, value) => total + value, 0),
        series: translationSeries,
      },
      automations: {
        total: visibleAutomations.length,
        paused: visibleAutomations.filter((automation) => automation.status === "paused").length,
      },
      issues: {
        open: openIssues.total,
        p1: p1Issues.total,
      },
    },
    activity: rankOverviewActivity([...jobActivity, ...automationActivity]),
    projects: previewProjects.map((project) => {
      const latestJob = projectExtras.latestByProject.get(project.id);
      const provider = providerLabel(project.externalProviderKind);
      const domain = projectExtras.domains.get(project.id);
      const subtitleParts = [
        domain,
        provider ?? (project.source === "native" ? "Native" : null),
      ].filter((part): part is string => Boolean(part));

      return {
        id: project.id,
        name: project.name,
        subtitle: subtitleParts.join(" · "),
        localeRoute: formatOverviewLocaleRoute(project.sourceLocale, project.targetLocales),
        latestJobTitle: latestJob ? overviewJobTitle(latestJob) : null,
        latestJobAt: latestJob ? toIso(latestJob.updatedAt) : null,
        openCount: project.openJobCount,
        failedCount: projectExtras.failedCounts.get(project.id) ?? 0,
        href: `/org/${organizationSlug}/projects/${encodeURIComponent(project.id)}`,
      };
    }),
    board: openIssues.issues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      projectName: issue.projectName,
      locale: issue.targetLocale,
      priority: issue.priority,
      updatedAt: issue.updatedAt,
      href: overviewIssueHref(organizationSlug, issue.projectId, issue.id),
    })),
    automations: recentRuns.slice(0, OVERVIEW_AUTOMATION_LIMIT).map((run) => ({
      id: run.id,
      automationId: run.automationId,
      name: run.automationName,
      triggerSource: run.triggerSource,
      status: run.status,
      updatedAt: toIso(run.completedAt ?? run.createdAt),
      href: `/org/${organizationSlug}/automations/${encodeURIComponent(run.automationId)}`,
    })),
  };
}
