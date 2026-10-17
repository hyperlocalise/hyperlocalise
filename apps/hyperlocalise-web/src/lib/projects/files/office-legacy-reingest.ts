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
import { and, asc, eq, gt, isNull, notExists, sql } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import { createLogger } from "@/lib/log";
import { enqueueSourceFileIngestAfterUpload } from "@/lib/projects/files/source-file-ingest";
import { supportedOfficeTranslationFileFormats } from "@/lib/translation/file-formats";
import type { SourceFileIngestQueue } from "@/lib/workflow/types";

// Office uploads ingested before segment extraction finished as whole files with no keys.
// Re-ingesting the latest version keys them; translations stay on the stored-file variant.

const logger = createLogger("office-legacy-reingest");

const BACKFILL_BATCH_SIZE = 200;

const OFFICE_EXTENSION_PATTERN = `\\.(${supportedOfficeTranslationFileFormats.join("|")})$`;

const versions = schema.repositorySourceFileVersions;

function noKeysForVersionFile() {
  return notExists(
    db
      .select({ id: schema.projectTranslationKeys.id })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.organizationId, versions.organizationId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, versions.repositorySourceFileId),
        ),
      ),
  );
}

/**
 * Segment extraction always reconciles the version, even when it yields zero keys, so an
 * unreconciled version was ingested as a whole file. Key absence alone would requeue empty
 * or image-only documents on every open.
 */
function notReconciledVersion() {
  return notExists(
    db
      .select({ id: schema.repositorySourceFiles.id })
      .from(schema.repositorySourceFiles)
      .where(
        and(
          eq(schema.repositorySourceFiles.id, versions.repositorySourceFileId),
          eq(schema.repositorySourceFiles.reconciledSourceFileVersionId, versions.id),
        ),
      ),
  );
}

/** Later versions of the same path supersede this one, so only the latest is re-keyed. */
function isLatestVersion() {
  return sql`not exists (
    select 1 from ${versions} as newer
    where newer.organization_id = ${versions.organizationId}
      and newer.project_id = ${versions.projectId}
      and newer.source_path = ${versions.sourcePath}
      and (newer.created_at, newer.id) > (${versions.createdAt}, ${versions.id})
  )`;
}

type ReingestCandidate = {
  id: string;
  organizationId: string;
  projectId: string;
  storedFileId: string;
  sourcePath: string;
  sourceHash: string | null;
  ingestedAt: Date | null;
};

async function requeueCandidate(candidate: ReingestCandidate, queue?: SourceFileIngestQueue) {
  const [claimed] = await db
    .update(versions)
    .set({ ingestState: "pending", ingestError: null, ingestWorkflowRunId: null, ingestedAt: null })
    .where(
      and(
        eq(versions.id, candidate.id),
        eq(versions.ingestState, "ingested"),
        noKeysForVersionFile(),
        notReconciledVersion(),
      ),
    )
    .returning({ id: versions.id });
  if (!claimed) {
    return false;
  }

  try {
    await enqueueSourceFileIngestAfterUpload({
      sourceFileVersionId: candidate.id,
      organizationId: candidate.organizationId,
      projectId: candidate.projectId,
      storedFileId: candidate.storedFileId,
      sourcePath: candidate.sourcePath,
      sourceHash: candidate.sourceHash,
      reingest: true,
      queue,
    });
  } catch (error) {
    // Only `ingested` rows are claimable, so an unowned `pending` row would never be retried.
    await db
      .update(versions)
      .set({ ingestState: "ingested", ingestedAt: candidate.ingestedAt })
      .where(
        and(
          eq(versions.id, candidate.id),
          eq(versions.ingestState, "pending"),
          isNull(versions.ingestWorkflowRunId),
        ),
      );
    throw error;
  }
  return true;
}

const candidateColumns = {
  id: versions.id,
  organizationId: versions.organizationId,
  projectId: versions.projectId,
  storedFileId: versions.storedFileId,
  sourcePath: versions.sourcePath,
  sourceHash: versions.sourceHash,
  ingestedAt: versions.ingestedAt,
};

/**
 * Re-keys the latest version of `sourcePath` when it is an Office upload ingested without
 * keys. Resolves to whether an ingest was enqueued.
 */
export async function requeueKeylessOfficeSourceIngest(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  queue?: SourceFileIngestQueue;
}): Promise<boolean> {
  const [candidate] = await db
    .select(candidateColumns)
    .from(versions)
    .where(
      and(
        eq(versions.organizationId, input.organizationId),
        eq(versions.projectId, input.projectId),
        eq(versions.sourcePath, input.sourcePath),
        sql`${versions.sourcePath} ~* ${OFFICE_EXTENSION_PATTERN}`,
        eq(versions.ingestState, "ingested"),
        isLatestVersion(),
        noKeysForVersionFile(),
        notReconciledVersion(),
      ),
    )
    .limit(1);
  return candidate ? requeueCandidate(candidate, input.queue) : false;
}

/** Re-keys every keyless Office upload, in batches ordered by version id. */
export async function backfillKeylessOfficeSourceIngest(
  input: { queue?: SourceFileIngestQueue } = {},
) {
  let requeued = 0;
  let after: string | null = null;
  for (;;) {
    const batch: ReingestCandidate[] = await db
      .select(candidateColumns)
      .from(versions)
      .where(
        and(
          after ? gt(versions.id, after) : undefined,
          sql`${versions.sourcePath} ~* ${OFFICE_EXTENSION_PATTERN}`,
          eq(versions.ingestState, "ingested"),
          isLatestVersion(),
          noKeysForVersionFile(),
          notReconciledVersion(),
        ),
      )
      .orderBy(asc(versions.id))
      .limit(BACKFILL_BATCH_SIZE);
    if (batch.length === 0) {
      break;
    }
    for (const candidate of batch) {
      if (await requeueCandidate(candidate, input.queue)) {
        requeued += 1;
      }
    }
    after = batch.at(-1)!.id;
  }
  logger.info({ requeued }, "keyless Office source ingest backfill finished");
  return { requeued };
}
