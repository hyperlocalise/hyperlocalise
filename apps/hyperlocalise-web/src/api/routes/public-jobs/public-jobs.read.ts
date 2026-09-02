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
import { and, eq } from "drizzle-orm";

import type { ApiAuthContext } from "@/api/auth/workos";
import { buildAccessibleJobsWhere } from "@/api/auth/team-access";
import { db, schema } from "@/lib/database/client";

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
