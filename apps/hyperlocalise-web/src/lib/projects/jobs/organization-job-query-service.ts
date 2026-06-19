import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { openJobStatusValues } from "@/api/routes/project/job.schema";
import { buildAccessibleJobsWhere, buildOrganizationJobsListWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";
import { getCurrentUserProviderAssigneeCandidates } from "@/lib/providers/tms-provider-assignee-candidates";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";

const jobWithProjectSelect = {
  id: schema.jobs.id,
  organizationId: schema.jobs.organizationId,
  projectId: schema.jobs.projectId,
  createdByUserId: schema.jobs.createdByUserId,
  ownerUserId: schema.jobs.ownerUserId,
  kind: schema.jobs.kind,
  type: schema.translationJobDetails.type,
  status: schema.jobs.status,
  inputPayload: schema.jobs.inputPayload,
  outcomeKind: schema.translationJobDetails.outcomeKind,
  outcomePayload: schema.jobs.outcomePayload,
  lastError: schema.jobs.lastError,
  workflowRunId: schema.jobs.workflowRunId,
  interactionId: schema.jobs.interactionId,
  contextSnapshot: schema.jobs.contextSnapshot,
  reviewCriteria: schema.reviewJobDetails.criteria,
  reviewTargetLocale: schema.reviewJobDetails.targetLocale,
  reviewConfig: schema.reviewJobDetails.config,
  syncConnectorKind: schema.syncJobDetails.connectorKind,
  syncDirection: schema.syncJobDetails.direction,
  syncExternalIdentifiers: schema.syncJobDetails.externalIdentifiers,
  assetType: schema.assetManagementJobDetails.assetType,
  assetOperation: schema.assetManagementJobDetails.operation,
  assetConfig: schema.assetManagementJobDetails.config,
  externalProviderKind: schema.externalJobDetails.providerKind,
  externalJobId: schema.externalJobDetails.externalJobId,
  externalTaskId: schema.externalJobDetails.externalTaskId,
  externalStatus: schema.externalJobDetails.externalStatus,
  externalTitle: schema.externalJobDetails.title,
  externalDueDate: schema.externalJobDetails.dueDate,
  externalTargetLocales: schema.externalJobDetails.targetLocales,
  externalAssignedUsers: schema.externalJobDetails.assignedUsers,
  externalUrl: schema.externalJobDetails.externalUrl,
  externalSyncState: schema.externalJobDetails.syncState,
  externalProviderPayload: schema.externalJobDetails.providerPayload,
  linkedJobId: schema.externalJobDetails.linkedJobId,
  createdAt: schema.jobs.createdAt,
  updatedAt: schema.jobs.updatedAt,
  completedAt: schema.jobs.completedAt,
  projectName: schema.projects.name,
};

type JobListQuery = {
  kind?: "translation" | "research" | "review" | "sync" | "asset_management";
  type?: "string" | "file";
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  open?: boolean;
  relationship?: "assigned" | "created";
  limit: number;
};

function jobListFilters(input: {
  kind?: JobListQuery["kind"];
  type?: JobListQuery["type"];
  status?: JobListQuery["status"];
  open?: JobListQuery["open"];
  relationship?: JobListQuery["relationship"];
  userId?: string;
  providerAssigneeCandidates?: string[];
}) {
  const filters = [];

  if (input.kind) {
    filters.push(eq(schema.jobs.kind, input.kind));
  }

  if (input.type) {
    filters.push(eq(schema.translationJobDetails.type, input.type));
  }

  if (input.open) {
    filters.push(inArray(schema.jobs.status, [...openJobStatusValues]));
  } else if (input.status) {
    filters.push(eq(schema.jobs.status, input.status));
  }

  if (input.userId) {
    const relationship = input.relationship;
    const assignedFilter = or(
      eq(schema.jobs.ownerUserId, input.userId),
      providerAssignedUsersMatch(input.providerAssigneeCandidates ?? []),
    );
    const createdFilter = eq(schema.jobs.createdByUserId, input.userId);

    if (relationship === "assigned") {
      filters.push(assignedFilter);
    } else if (relationship === "created") {
      filters.push(createdFilter);
    }
  }

  return filters;
}

function providerAssignedUsersMatch(candidates: string[]) {
  const normalizedCandidates = Array.from(
    new Set(candidates.map((candidate) => candidate.trim().toLowerCase()).filter(Boolean)),
  );

  if (normalizedCandidates.length === 0) {
    return sql`false`;
  }

  const candidatePredicates = normalizedCandidates.map(
    (candidate) => sql`
      lower(assigned_user.value) = ${candidate}
      or lower(assigned_user.value) like '%' || ${candidate} || '%'
      or ${candidate} like '%' || lower(assigned_user.value) || '%'
    `,
  );

  return sql`exists (
    select 1
    from jsonb_array_elements_text(${schema.externalJobDetails.assignedUsers}) as assigned_user(value)
    where ${sql.join(candidatePredicates, sql` or `)}
  )`;
}

function visibleSyncedJobConditions() {
  return [
    or(
      isNull(schema.externalJobDetails.syncState),
      ne(schema.externalJobDetails.syncState, "removed"),
    ),
    or(isNull(schema.projects.isActive), eq(schema.projects.isActive, true)),
  ];
}

export class OrganizationJobQueryService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "projects.jobs");
  }

  /** Returns paginate-friendly job rows from the local database only. */
  async list(auth: ApiAuthContext, query: JobListQuery) {
    const providerAssigneeCandidates =
      query.relationship === "assigned"
        ? await getCurrentUserProviderAssigneeCandidates(auth)
        : undefined;

    const jobs = await this.database
      .select(jobWithProjectSelect)
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
      .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
      .leftJoin(
        schema.assetManagementJobDetails,
        eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .leftJoin(
        schema.projects,
        and(
          eq(schema.projects.id, schema.jobs.projectId),
          eq(schema.projects.organizationId, schema.jobs.organizationId),
        ),
      )
      .where(
        and(
          await buildOrganizationJobsListWhere(auth, {
            relationship: query.relationship,
            providerAssigneeCandidates,
          }),
          ...visibleSyncedJobConditions(),
          ...jobListFilters({
            kind: query.kind,
            type: query.type,
            status: query.status,
            open: query.open,
          }),
        ),
      )
      .orderBy(desc(schema.jobs.updatedAt))
      .limit(query.limit);

    this.log.debug(
      {
        organizationId: auth.organization.localOrganizationId,
        jobCount: jobs.length,
        scope: "organization",
      },
      "listed organization jobs",
    );

    return jobs;
  }

  async listForProject(auth: ApiAuthContext, projectId: string, query: JobListQuery) {
    const providerAssigneeCandidates =
      query.relationship === "assigned"
        ? await getCurrentUserProviderAssigneeCandidates(auth)
        : undefined;

    const jobs = await this.database
      .select(jobWithProjectSelect)
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
      .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
      .leftJoin(
        schema.assetManagementJobDetails,
        eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .leftJoin(
        schema.projects,
        and(
          eq(schema.projects.id, schema.jobs.projectId),
          eq(schema.projects.organizationId, schema.jobs.organizationId),
        ),
      )
      .where(
        and(
          eq(schema.jobs.organizationId, auth.organization.localOrganizationId),
          eq(schema.jobs.projectId, projectId),
          ...visibleSyncedJobConditions(),
          ...jobListFilters({
            kind: query.kind,
            type: query.type,
            status: query.status,
            open: query.open,
            relationship: query.relationship,
            userId: auth.user.localUserId,
            providerAssigneeCandidates,
          }),
        ),
      )
      .orderBy(desc(schema.jobs.updatedAt))
      .limit(query.limit);

    this.log.debug(
      {
        organizationId: auth.organization.localOrganizationId,
        projectId,
        jobCount: jobs.length,
        scope: "project",
      },
      "listed organization project jobs",
    );

    return jobs;
  }

  async getById(auth: ApiAuthContext, jobId: string) {
    const [job] = await this.database
      .select(jobWithProjectSelect)
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.reviewJobDetails, eq(schema.reviewJobDetails.jobId, schema.jobs.id))
      .leftJoin(schema.syncJobDetails, eq(schema.syncJobDetails.jobId, schema.jobs.id))
      .leftJoin(
        schema.assetManagementJobDetails,
        eq(schema.assetManagementJobDetails.jobId, schema.jobs.id),
      )
      .leftJoin(schema.externalJobDetails, eq(schema.externalJobDetails.jobId, schema.jobs.id))
      .leftJoin(
        schema.projects,
        and(
          eq(schema.projects.id, schema.jobs.projectId),
          eq(schema.projects.organizationId, schema.jobs.organizationId),
        ),
      )
      .where(and(await buildAccessibleJobsWhere(auth), eq(schema.jobs.id, jobId)))
      .limit(1);

    if (!job) {
      this.log.debug(
        { organizationId: auth.organization.localOrganizationId, jobId },
        "organization job not found",
      );
      return null;
    }

    return job;
  }
}

export const organizationJobQueryService = new OrganizationJobQueryService();

export const listOrganizationJobs = (auth: ApiAuthContext, query: JobListQuery) =>
  organizationJobQueryService.list(auth, query);

export const listOrganizationProjectJobs = (
  auth: ApiAuthContext,
  projectId: string,
  query: JobListQuery,
) => organizationJobQueryService.listForProject(auth, projectId, query);

export const getOrganizationJobById = (auth: ApiAuthContext, jobId: string) =>
  organizationJobQueryService.getById(auth, jobId);
