import { and, desc, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleJobsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database";

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

function jobListFilters(input: {
  kind?: "translation" | "research" | "review" | "sync" | "asset_management";
  type?: "string" | "file";
  status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
  mine?: boolean;
  userId?: string;
}) {
  const filters = [];

  if (input.kind) {
    filters.push(eq(schema.jobs.kind, input.kind));
  }

  if (input.type) {
    filters.push(eq(schema.translationJobDetails.type, input.type));
  }

  if (input.status) {
    filters.push(eq(schema.jobs.status, input.status));
  }

  if (input.mine && input.userId) {
    filters.push(eq(schema.jobs.createdByUserId, input.userId));
  }

  return filters;
}

/**
 * Returns paginate-friendly job rows from the local database only.
 */
export async function listOrganizationJobs(
  auth: ApiAuthContext,
  query: {
    kind?: "translation" | "research" | "review" | "sync" | "asset_management";
    type?: "string" | "file";
    status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
    mine?: boolean;
    limit: number;
  },
) {
  return db
    .select(jobWithProjectSelect)
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
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
        await buildAccessibleJobsWhere(auth),
        ...jobListFilters({
          kind: query.kind,
          type: query.type,
          status: query.status,
          mine: query.mine,
          userId: auth.user.localUserId,
        }),
      ),
    )
    .orderBy(desc(schema.jobs.updatedAt))
    .limit(query.limit);
}

export async function listOrganizationProjectJobs(
  auth: ApiAuthContext,
  projectId: string,
  query: {
    kind?: "translation" | "research" | "review" | "sync" | "asset_management";
    type?: "string" | "file";
    status?: "queued" | "running" | "succeeded" | "failed" | "waiting_for_review" | "cancelled";
    mine?: boolean;
    limit: number;
  },
) {
  return db
    .select(jobWithProjectSelect)
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
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
        ...jobListFilters({
          kind: query.kind,
          type: query.type,
          status: query.status,
          mine: query.mine,
          userId: auth.user.localUserId,
        }),
      ),
    )
    .orderBy(desc(schema.jobs.updatedAt))
    .limit(query.limit);
}

export async function getOrganizationJobById(auth: ApiAuthContext, jobId: string) {
  const [job] = await db
    .select(jobWithProjectSelect)
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
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

  return job ?? null;
}
