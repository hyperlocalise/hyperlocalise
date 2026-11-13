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
import { and, eq, inArray } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";

import {
  getJobInputPayloadMetadataString,
  getJobInputPayloadString,
  nativeFileJobSourceDisplayFields,
} from "./native-job-source-file-display";

type JobSourceFileDisplayFields = {
  sourceFilename: string | null;
  sourcePath: string | null;
};

function sourceFileDisplayFromJob(inputPayload: unknown): JobSourceFileDisplayFields | null {
  const sourceFileId = getJobInputPayloadString(inputPayload, "sourceFileId");
  if (!sourceFileId) {
    return null;
  }

  const metadataFilename = getJobInputPayloadMetadataString(inputPayload, "sourceFilename");
  const metadataSourcePath = getJobInputPayloadMetadataString(inputPayload, "sourcePath");
  if (!metadataFilename && !metadataSourcePath) {
    return null;
  }

  const display = nativeFileJobSourceDisplayFields({
    filename: metadataFilename ?? metadataSourcePath ?? sourceFileId,
    sourcePath: metadataSourcePath,
  });

  return {
    sourceFilename: display.sourceFilename,
    sourcePath: display.sourcePath,
  };
}

export async function lookupStoredFileSourceDisplays(input: {
  organizationId: string;
  fileIds: readonly string[];
  db?: Pick<typeof db, "select">;
}): Promise<Map<string, JobSourceFileDisplayFields>> {
  const uniqueFileIds = [...new Set(input.fileIds.filter((fileId) => fileId.length > 0))];
  const displays = new Map<string, JobSourceFileDisplayFields>();
  if (uniqueFileIds.length === 0) {
    return displays;
  }

  const dbClient = input.db ?? db;
  const files = await dbClient
    .select({
      id: schema.storedFiles.id,
      filename: schema.storedFiles.filename,
      metadata: schema.storedFiles.metadata,
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
    })
    .from(schema.storedFiles)
    .leftJoin(
      schema.repositorySourceFileVersions,
      eq(schema.repositorySourceFileVersions.storedFileId, schema.storedFiles.id),
    )
    .where(
      and(
        eq(schema.storedFiles.organizationId, input.organizationId),
        inArray(schema.storedFiles.id, uniqueFileIds),
      ),
    );

  for (const file of files) {
    const metadata = file.metadata;
    const metadataSourcePath =
      metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? typeof (metadata as Record<string, unknown>).sourcePath === "string"
          ? ((metadata as Record<string, unknown>).sourcePath as string)
          : null
        : null;
    const display = nativeFileJobSourceDisplayFields({
      filename: file.filename,
      sourcePath: file.sourcePath ?? metadataSourcePath,
    });
    displays.set(file.id, {
      sourceFilename: display.sourceFilename,
      sourcePath: display.sourcePath,
    });
  }

  return displays;
}

export async function enrichJobsWithSourceFileDisplay<
  T extends { organizationId: string; inputPayload: unknown },
>(
  jobs: T[],
  options?: { db?: Pick<typeof db, "select"> },
): Promise<Array<T & JobSourceFileDisplayFields>> {
  const fileIdsByOrganization = new Map<string, string[]>();

  for (const job of jobs) {
    if (sourceFileDisplayFromJob(job.inputPayload)) {
      continue;
    }

    const sourceFileId = getJobInputPayloadString(job.inputPayload, "sourceFileId");
    if (!sourceFileId) {
      continue;
    }

    const fileIds = fileIdsByOrganization.get(job.organizationId) ?? [];
    fileIds.push(sourceFileId);
    fileIdsByOrganization.set(job.organizationId, fileIds);
  }

  const lookups = await Promise.all(
    [...fileIdsByOrganization.entries()].map(async ([organizationId, fileIds]) => ({
      organizationId,
      displays: await lookupStoredFileSourceDisplays({
        organizationId,
        fileIds,
        db: options?.db,
      }),
    })),
  );
  const displaysByOrganization = new Map(
    lookups.map((lookup) => [lookup.organizationId, lookup.displays]),
  );

  return jobs.map((job) => {
    const fromMetadata = sourceFileDisplayFromJob(job.inputPayload);
    if (fromMetadata) {
      return { ...job, ...fromMetadata };
    }

    const sourceFileId = getJobInputPayloadString(job.inputPayload, "sourceFileId");
    const fromLookup = sourceFileId
      ? (displaysByOrganization.get(job.organizationId)?.get(sourceFileId) ?? null)
      : null;

    return {
      ...job,
      sourceFilename: fromLookup?.sourceFilename ?? null,
      sourcePath: fromLookup?.sourcePath ?? null,
    };
  });
}

export async function enrichJobWithSourceFileDisplay<
  T extends { organizationId: string; inputPayload: unknown },
>(job: T, options?: { db?: Pick<typeof db, "select"> }): Promise<T & JobSourceFileDisplayFields> {
  const [enriched] = await enrichJobsWithSourceFileDisplay([job], options);
  return (
    enriched ?? {
      ...job,
      sourceFilename: null,
      sourcePath: null,
    }
  );
}
