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
import { and, count, desc, eq, type SQL } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleJobsWhere, canAccessProject } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database/client";
import { normalizeSourcePath } from "@/lib/file-storage/records";
import { err, ok, type Result } from "@/lib/primitives/result/results";

export type PublicJobOutputFile = {
  fileId: string;
  locale: string;
  filename: string;
};

export type AccessiblePublicJob = {
  id: string;
  projectId: string | null;
  kind: (typeof schema.jobs.$inferSelect)["kind"];
  type: (typeof schema.translationJobDetails.$inferSelect)["type"] | null;
  status: (typeof schema.jobs.$inferSelect)["status"];
  outcomeKind: (typeof schema.translationJobDetails.$inferSelect)["outcomeKind"] | null;
  outcomePayload: unknown;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isPublicJobOutputFile(value: unknown): value is PublicJobOutputFile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return hasValue(candidate.fileId) && hasValue(candidate.locale) && hasValue(candidate.filename);
}

export function publicJobOutputFiles(input: {
  type: string | null;
  outcomeKind: string | null;
  outcomePayload: unknown;
}): PublicJobOutputFile[] | null {
  if (input.type !== "file" || input.outcomeKind !== "file_result") {
    return null;
  }

  if (!input.outcomePayload || typeof input.outcomePayload !== "object") {
    return null;
  }

  const outputFiles = (input.outcomePayload as Record<string, unknown>).outputFiles;
  if (!Array.isArray(outputFiles) || !outputFiles.every(isPublicJobOutputFile)) {
    return null;
  }

  return outputFiles.map((outputFile) => ({
    fileId: outputFile.fileId,
    locale: outputFile.locale,
    filename: outputFile.filename,
  }));
}

export function toPublicJobEnvelope(job: AccessiblePublicJob) {
  return {
    id: job.id,
    projectId: job.projectId,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
    lastError: job.lastError,
    outputFiles: publicJobOutputFiles(job),
  };
}

export function toMcpJobEnvelope(job: AccessiblePublicJob) {
  return {
    ...toPublicJobEnvelope(job),
    kind: job.kind,
  };
}

export async function findAccessiblePublicJob(
  auth: ApiAuthContext,
  jobId: string,
): Promise<AccessiblePublicJob | null> {
  const accessibleJobsWhere = await buildAccessibleJobsWhere(auth);

  const [job] = await db
    .select({
      id: schema.jobs.id,
      projectId: schema.jobs.projectId,
      kind: schema.jobs.kind,
      type: schema.translationJobDetails.type,
      status: schema.jobs.status,
      outcomeKind: schema.translationJobDetails.outcomeKind,
      outcomePayload: schema.jobs.outcomePayload,
      lastError: schema.jobs.lastError,
      createdAt: schema.jobs.createdAt,
      updatedAt: schema.jobs.updatedAt,
      completedAt: schema.jobs.completedAt,
    })
    .from(schema.jobs)
    .leftJoin(schema.translationJobDetails, eq(schema.translationJobDetails.jobId, schema.jobs.id))
    .where(and(eq(schema.jobs.id, jobId), accessibleJobsWhere))
    .limit(1);

  return job ?? null;
}

export const COMPACT_JOB_LAST_ERROR_MAX_LENGTH = 500;

export type ListAccessiblePublicJobsQuery = {
  projectId?: string;
  sourcePath?: string;
  status?: AccessiblePublicJob["status"];
  limit: number;
  offset: number;
};

export type CompactPublicJob = {
  id: string;
  projectId: string | null;
  type: AccessiblePublicJob["type"];
  status: AccessiblePublicJob["status"];
  createdAt: Date;
  completedAt: Date | null;
  lastError: string | null;
};

export function truncatePublicJobLastError(lastError: string | null) {
  if (!lastError || lastError.length <= COMPACT_JOB_LAST_ERROR_MAX_LENGTH) {
    return lastError;
  }

  return lastError.slice(0, COMPACT_JOB_LAST_ERROR_MAX_LENGTH);
}

function compactPublicJob(job: {
  id: string;
  projectId: string | null;
  type: AccessiblePublicJob["type"];
  status: AccessiblePublicJob["status"];
  createdAt: Date;
  completedAt: Date | null;
  lastError: string | null;
}): CompactPublicJob {
  return {
    id: job.id,
    projectId: job.projectId,
    type: job.type,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    lastError: truncatePublicJobLastError(job.lastError),
  };
}

/**
 * List compact translation jobs visible to the caller.
 *
 * Access matches `createListJobsTool` / `buildAccessibleJobsWhere`. When
 * `sourcePath` is set, the query uses the same repository-file join as
 * `GET /v1/jobs/latest` so agents can find the latest job for a path.
 */
export async function listAccessiblePublicJobs(
  auth: ApiAuthContext,
  query: ListAccessiblePublicJobsQuery,
): Promise<Result<{ jobs: CompactPublicJob[]; total: number }, { code: "project_not_found" }>> {
  if (query.projectId) {
    const project = await canAccessProject(auth, query.projectId);
    if (!project) {
      return err({ code: "project_not_found" });
    }
  }

  const accessibleJobsWhere = await buildAccessibleJobsWhere(auth);
  const sourcePath = query.sourcePath ? normalizeSourcePath(query.sourcePath) : undefined;

  const compactSelect = {
    id: schema.jobs.id,
    projectId: schema.jobs.projectId,
    type: schema.translationJobDetails.type,
    status: schema.jobs.status,
    createdAt: schema.jobs.createdAt,
    completedAt: schema.jobs.completedAt,
    lastError: schema.jobs.lastError,
  };

  if (sourcePath) {
    const filters: SQL[] = [
      eq(schema.repositorySourceFileVersions.organizationId, auth.organization.localOrganizationId),
      eq(schema.repositorySourceFileVersions.sourcePath, sourcePath),
      accessibleJobsWhere,
      eq(schema.jobs.kind, "translation"),
      eq(schema.translationJobDetails.type, "file"),
    ];

    if (query.projectId) {
      filters.push(eq(schema.repositorySourceFileVersions.projectId, query.projectId));
    }

    if (query.status) {
      filters.push(eq(schema.jobs.status, query.status));
    } else {
      filters.push(eq(schema.jobs.status, "succeeded"));
      filters.push(eq(schema.translationJobDetails.outcomeKind, "file_result"));
    }

    const where = and(...filters);
    const [jobs, [totalRow]] = await Promise.all([
      db
        .select(compactSelect)
        .from(schema.repositorySourceFileVersions)
        .innerJoin(
          schema.translationJobDetails,
          eq(
            schema.translationJobDetails.sourceFileVersionId,
            schema.repositorySourceFileVersions.id,
          ),
        )
        .innerJoin(schema.jobs, eq(schema.jobs.id, schema.translationJobDetails.jobId))
        .where(where)
        .orderBy(desc(schema.repositorySourceFileVersions.createdAt), desc(schema.jobs.createdAt))
        .limit(query.limit)
        .offset(query.offset),
      db
        .select({ value: count() })
        .from(schema.repositorySourceFileVersions)
        .innerJoin(
          schema.translationJobDetails,
          eq(
            schema.translationJobDetails.sourceFileVersionId,
            schema.repositorySourceFileVersions.id,
          ),
        )
        .innerJoin(schema.jobs, eq(schema.jobs.id, schema.translationJobDetails.jobId))
        .where(where),
    ]);

    return ok({
      jobs: jobs.map(compactPublicJob),
      total: totalRow?.value ?? 0,
    });
  }

  const filters: SQL[] = [accessibleJobsWhere, eq(schema.jobs.kind, "translation")];

  if (query.projectId) {
    filters.push(eq(schema.jobs.projectId, query.projectId));
  }

  if (query.status) {
    filters.push(eq(schema.jobs.status, query.status));
  }

  const where = and(...filters);
  const [jobs, [totalRow]] = await Promise.all([
    db
      .select(compactSelect)
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .where(where)
      .orderBy(desc(schema.jobs.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ value: count() })
      .from(schema.jobs)
      .leftJoin(
        schema.translationJobDetails,
        eq(schema.translationJobDetails.jobId, schema.jobs.id),
      )
      .where(where),
  ]);

  return ok({
    jobs: jobs.map(compactPublicJob),
    total: totalRow?.value ?? 0,
  });
}
