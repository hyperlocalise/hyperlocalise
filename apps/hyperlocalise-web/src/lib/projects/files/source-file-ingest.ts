import { and, desc, eq, inArray, or } from "drizzle-orm";

import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";
import { dispatchWorkspaceAutomationsForSourceUpload } from "@/lib/agents/workspace-automation-dispatcher";
import { db, schema } from "@/lib/database";
import { createLogger } from "@/lib/log";
import type { SourceFileIngestEventData, SourceFileIngestQueue } from "@/lib/workflow/types";

const logger = createLogger("source-file-ingest");

export type { SourceFileIngestEventData };

export type SourceFileIngestState =
  (typeof schema.repositorySourceFileVersions.$inferSelect)["ingestState"];

export function entriesFromHlOutput(entries: Record<string, string>): ProjectSourceStringEntry[] {
  return Object.entries(entries)
    .map(([key, text]) => ({
      key: key.trim(),
      text,
      context: null,
      type: "string",
    }))
    .filter((entry) => entry.key.length > 0 && entry.text.trim().length > 0);
}

export async function hasIngestedSourceHashForPath(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  sourceHash: string | null;
}) {
  if (!input.sourceHash) {
    return false;
  }

  const [row] = await db
    .select({ id: schema.repositorySourceFileVersions.id })
    .from(schema.repositorySourceFileVersions)
    .where(
      and(
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        eq(schema.repositorySourceFileVersions.projectId, input.projectId),
        eq(schema.repositorySourceFileVersions.sourcePath, input.sourcePath),
        eq(schema.repositorySourceFileVersions.sourceHash, input.sourceHash),
        inArray(schema.repositorySourceFileVersions.ingestState, ["ingested", "skipped"]),
      ),
    )
    .orderBy(desc(schema.repositorySourceFileVersions.createdAt))
    .limit(1);

  return Boolean(row);
}

export async function markSourceFileIngestState(input: {
  sourceFileVersionId: string;
  organizationId: string;
  ingestState: SourceFileIngestState;
  ingestError?: string | null;
  ingestWorkflowRunId?: string | null;
  ingestedAt?: Date | null;
  fromIngestingWorkflowRunId?: string;
}) {
  const whereConditions = [
    eq(schema.repositorySourceFileVersions.id, input.sourceFileVersionId),
    eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
  ];

  if (input.fromIngestingWorkflowRunId) {
    whereConditions.push(
      eq(schema.repositorySourceFileVersions.ingestState, "ingesting"),
      eq(schema.repositorySourceFileVersions.ingestWorkflowRunId, input.fromIngestingWorkflowRunId),
    );
  }

  const [updated] = await db
    .update(schema.repositorySourceFileVersions)
    .set({
      ingestState: input.ingestState,
      ingestError: input.ingestError ?? null,
      ingestWorkflowRunId: input.ingestWorkflowRunId ?? null,
      ingestedAt: input.ingestedAt ?? null,
    })
    .where(and(...whereConditions))
    .returning({ id: schema.repositorySourceFileVersions.id });

  if (input.fromIngestingWorkflowRunId && !updated) {
    throw new Error(
      `failed to mark source file version ${input.sourceFileVersionId} as ${input.ingestState}; not owned by workflow ${input.fromIngestingWorkflowRunId}`,
    );
  }

  return updated ?? null;
}

export async function claimSourceFileIngest(input: {
  sourceFileVersionId: string;
  organizationId: string;
  workflowRunId: string;
}) {
  const [updated] = await db
    .update(schema.repositorySourceFileVersions)
    .set({
      ingestState: "ingesting",
      ingestWorkflowRunId: input.workflowRunId,
      ingestError: null,
      ingestedAt: null,
    })
    .where(
      and(
        eq(schema.repositorySourceFileVersions.id, input.sourceFileVersionId),
        eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
        or(
          inArray(schema.repositorySourceFileVersions.ingestState, ["pending", "failed"]),
          and(
            eq(schema.repositorySourceFileVersions.ingestState, "ingesting"),
            eq(schema.repositorySourceFileVersions.ingestWorkflowRunId, input.workflowRunId),
          ),
        ),
      ),
    )
    .returning({
      id: schema.repositorySourceFileVersions.id,
      sourceHash: schema.repositorySourceFileVersions.sourceHash,
      sourcePath: schema.repositorySourceFileVersions.sourcePath,
      projectId: schema.repositorySourceFileVersions.projectId,
      storedFileId: schema.repositorySourceFileVersions.storedFileId,
      repositorySourceFileId: schema.repositorySourceFileVersions.repositorySourceFileId,
    });

  return updated ?? null;
}

export async function dispatchSourceUploadAutomations(input: {
  organizationId: string;
  projectId: string;
  sourceFileId: string;
  sourceFileVersionId: string;
  sourcePath: string;
}) {
  await dispatchWorkspaceAutomationsForSourceUpload({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    sourceFileVersionId: input.sourceFileVersionId,
    sourcePath: input.sourcePath,
  });
}

export async function enqueueSourceFileIngestAfterUpload(
  input: SourceFileIngestEventData & {
    sourceHash?: string | null;
    queue?: SourceFileIngestQueue;
  },
) {
  const alreadyIngested = await hasIngestedSourceHashForPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    sourceHash: input.sourceHash ?? null,
  });

  if (alreadyIngested) {
    await markSourceFileIngestState({
      sourceFileVersionId: input.sourceFileVersionId,
      organizationId: input.organizationId,
      ingestState: "skipped",
      ingestedAt: new Date(),
    });

    logger.info(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourceFileVersionId: input.sourceFileVersionId,
        sourcePath: input.sourcePath,
      },
      "source file ingest skipped; hash already ingested",
    );

    void dispatchSourceUploadAutomations({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceFileId: input.storedFileId,
      sourceFileVersionId: input.sourceFileVersionId,
      sourcePath: input.sourcePath,
    }).catch((error) => {
      logger.warn(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          sourceFileVersionId: input.sourceFileVersionId,
          error: error instanceof Error ? error.message : String(error),
        },
        "source file ingest skipped automation dispatch failed",
      );
    });

    return { enqueued: false as const, reason: "hash_already_ingested" as const };
  }

  const { createSourceFileIngestQueue } = await import("@/workflows/adapters");
  const queue = input.queue ?? createSourceFileIngestQueue();
  const { ids } = await queue.enqueue({
    sourceFileVersionId: input.sourceFileVersionId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    storedFileId: input.storedFileId,
    sourcePath: input.sourcePath,
  });

  logger.info(
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourceFileVersionId: input.sourceFileVersionId,
      workflowRunIds: ids,
    },
    "source file ingest workflow enqueued",
  );

  return { enqueued: true as const, workflowRunIds: ids };
}
