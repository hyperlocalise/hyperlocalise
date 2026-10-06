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

import type { SupportedTranslationFileFormat } from "@/lib/translation/file-formats";

export async function enqueueFileTranslationFollowUpStep(input: {
  organizationId: string;
  parentJobId: string;
  projectId: string;
  sourceFileId: string;
  fileFormat: string;
  sourceLocale: string;
  targetLocales: string[];
  metadata?: Record<string, string>;
  ignoreTranslationMemory?: boolean;
}): Promise<{ jobId: string } | null> {
  "use step";

  const { and, desc, eq, inArray, sql } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/database/client");
  const { isSupportedFileTranslationFileFormat } = await import("@/lib/translation/file-formats");
  const { enqueueFileTranslationJob } =
    await import("@/lib/projects/jobs/enqueue-file-translation-job");
  const { createTranslationJobEventQueue } = await import("@/lib/workflow/queues");
  const {
    buildFileTranslationFollowUpMetadata,
    parseFileTranslationAutoRetryAttempt,
    REUSABLE_FILE_TRANSLATION_FOLLOW_UP_STATUSES,
    shouldEnqueueFileTranslationFollowUp,
    uniqueFileTranslationLocales,
  } = await import("@/workflows/file-translation-partial");

  const failedLocales = uniqueFileTranslationLocales(input.targetLocales);
  const retryAttempt = parseFileTranslationAutoRetryAttempt(input.metadata);
  if (
    !shouldEnqueueFileTranslationFollowUp({
      failedLocales,
      retryAttempt,
    })
  ) {
    return null;
  }

  if (!isSupportedFileTranslationFileFormat(input.fileFormat as SupportedTranslationFileFormat)) {
    console.warn("[file-translation-workflow] follow-up skipped; unsupported file format", {
      parentJobId: input.parentJobId,
      fileFormat: input.fileFormat,
    });
    return null;
  }

  try {
    const [existingFollowUp] = await db
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
      })
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.organizationId, input.organizationId),
          eq(schema.jobs.projectId, input.projectId),
          inArray(schema.jobs.status, [...REUSABLE_FILE_TRANSLATION_FOLLOW_UP_STATUSES]),
          sql`${schema.jobs.inputPayload}->'metadata'->>'parentJobId' = ${input.parentJobId}`,
        ),
      )
      .orderBy(desc(schema.jobs.createdAt))
      .limit(1);

    if (existingFollowUp) {
      if (existingFollowUp.status === "queued") {
        try {
          await createTranslationJobEventQueue().enqueue({
            kind: "translation",
            jobId: existingFollowUp.id,
            projectId: input.projectId,
            type: "file",
          });
        } catch {
          console.warn("[file-translation-workflow] follow-up re-enqueue failed", {
            parentJobId: input.parentJobId,
            followUpJobId: existingFollowUp.id,
          });
        }
      }
      return { jobId: existingFollowUp.id };
    }

    let parentJob:
      | {
          createdByUserId: string | null;
          apiKeyId: string | null;
          ownerUserId: string | null;
          assigneeType: "user" | "agent" | null;
        }
      | undefined;
    try {
      [parentJob] = await db
        .select({
          createdByUserId: schema.jobs.createdByUserId,
          apiKeyId: schema.jobs.apiKeyId,
          ownerUserId: schema.jobs.ownerUserId,
          assigneeType: schema.jobs.assigneeType,
        })
        .from(schema.jobs)
        .where(eq(schema.jobs.id, input.parentJobId))
        .limit(1);
    } catch {
      console.warn("[file-translation-workflow] follow-up parent job read failed", {
        parentJobId: input.parentJobId,
      });
    }

    const enqueued = await enqueueFileTranslationJob({
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdByUserId: parentJob?.createdByUserId,
      apiKeyId: parentJob?.apiKeyId,
      ownerUserId: parentJob?.ownerUserId,
      assigneeType: parentJob?.assigneeType,
      sourceFileId: input.sourceFileId,
      sourceLocale: input.sourceLocale,
      targetLocales: failedLocales,
      fileFormat: input.fileFormat as SupportedTranslationFileFormat,
      ignoreTranslationMemory: input.ignoreTranslationMemory,
      metadata: buildFileTranslationFollowUpMetadata(input.metadata, {
        parentJobId: input.parentJobId,
        retryAttempt: retryAttempt + 1,
      }),
      jobQueue: createTranslationJobEventQueue(),
    });

    if (!enqueued.ok) {
      console.warn("[file-translation-workflow] follow-up enqueue failed", {
        parentJobId: input.parentJobId,
        leftoverLocaleCount: failedLocales.length,
        error: enqueued.code,
      });
      return null;
    }

    console.info("[file-translation-workflow] enqueued follow-up for failed locales", {
      parentJobId: input.parentJobId,
      followUpJobId: enqueued.jobId,
      leftoverLocaleCount: failedLocales.length,
    });
    return { jobId: enqueued.jobId };
  } catch {
    console.warn("[file-translation-workflow] follow-up enqueue interrupted", {
      parentJobId: input.parentJobId,
      leftoverLocaleCount: failedLocales.length,
    });
    return null;
  }
}
