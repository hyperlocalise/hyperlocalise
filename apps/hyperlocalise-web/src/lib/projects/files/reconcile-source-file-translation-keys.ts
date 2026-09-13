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
import { and, desc, eq, sql } from "drizzle-orm";

import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database/client";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

export async function reconcileSourceFileTranslationKeys(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  sourceFileVersionId: string;
  workflowRunId: string;
  entries: ProjectSourceStringEntry[];
}) {
  // Validate the whole snapshot before batching; normalized duplicates are ambiguous.
  const keys = new Set<string>();
  for (const entry of input.entries) {
    const key = entry.key.trim();
    if (!key || keys.has(key)) {
      throw new Error("Source snapshot contains blank or duplicate keys");
    }
    keys.add(key);
  }

  return db.transaction(async (tx) => {
    // Uploads upsert this same row. The lock serializes publication with uploads
    // and other reconciliations, while parsing happens outside the transaction.
    const [file] = await tx
      .select()
      .from(schema.repositorySourceFiles)
      .where(
        and(
          eq(schema.repositorySourceFiles.id, input.repositorySourceFileId),
          eq(schema.repositorySourceFiles.organizationId, input.organizationId),
          eq(schema.repositorySourceFiles.projectId, input.projectId),
        ),
      )
      .for("update");
    if (!file) throw new Error("Source file not found");

    const [version] = await tx
      .select()
      .from(schema.repositorySourceFileVersions)
      .where(
        and(
          eq(schema.repositorySourceFileVersions.id, input.sourceFileVersionId),
          eq(schema.repositorySourceFileVersions.repositorySourceFileId, file.id),
          eq(schema.repositorySourceFileVersions.organizationId, input.organizationId),
          eq(schema.repositorySourceFileVersions.projectId, input.projectId),
        ),
      )
      .for("update");
    if (!version) throw new Error("Source version not found");
    if (version.ingestWorkflowRunId !== input.workflowRunId) {
      throw new Error("Source ingest is not owned by this workflow");
    }
    const [latest] = await tx
      .select({ id: schema.repositorySourceFileVersions.id })
      .from(schema.repositorySourceFileVersions)
      .where(eq(schema.repositorySourceFileVersions.repositorySourceFileId, file.id))
      .orderBy(
        desc(schema.repositorySourceFileVersions.createdAt),
        desc(schema.repositorySourceFileVersions.id),
      )
      .limit(1);
    if (latest?.id !== version.id) {
      await tx
        .update(schema.repositorySourceFileVersions)
        .set({
          ingestState: "skipped",
          ingestedAt: new Date(),
          ingestError: null,
        })
        .where(
          and(
            eq(schema.repositorySourceFileVersions.id, version.id),
            eq(schema.repositorySourceFileVersions.ingestState, "ingesting"),
          ),
        );
      return { status: "superseded" as const };
    }

    if (file.reconciledSourceFileVersionId === version.id) {
      return { status: "ingested" as const };
    }
    if (version.ingestState === "skipped") {
      return { status: "superseded" as const };
    }
    if (version.ingestState !== "ingesting") {
      throw new Error("Source version is not ingesting");
    }

    await new ProjectTranslationService().upsertKeysFromEntries(
      {
        ...input,
        preserveEmptySourceText: true,
      },
      tx,
    );
    await tx
      .delete(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.organizationId, input.organizationId),
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, file.id),
          sql`${schema.projectTranslationKeys.sourceFileVersionId} IS DISTINCT FROM ${version.id}::uuid`,
        ),
      );
    await tx
      .update(schema.repositorySourceFiles)
      .set({
        reconciledSourceFileVersionId: version.id,
      })
      .where(eq(schema.repositorySourceFiles.id, file.id));
    await tx
      .update(schema.repositorySourceFileVersions)
      .set({
        ingestState: "ingested",
        ingestedAt: new Date(),
        ingestError: null,
      })
      .where(eq(schema.repositorySourceFileVersions.id, version.id));
    return { status: "ingested" as const };
  });
}
