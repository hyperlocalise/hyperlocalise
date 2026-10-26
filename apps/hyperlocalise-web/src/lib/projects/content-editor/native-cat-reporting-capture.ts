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

import { db, schema } from "@/lib/database/client";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";
import { captureAnalysis, captureCompletions } from "@/lib/reporting/capture";
import { personSave, sourceOfProvenance, textOrigins } from "@/lib/reporting/completion-source";
import { openPersonTaskForString } from "@/lib/reporting/task-analysis";

export async function captureNativeCatTranslationReporting(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  translationKeyId: string;
  targetLocale: string;
  text: string;
  approve?: boolean;
  provenance?: "manual" | "translation_job" | "import" | "agent";
  sourceJobId?: string;
  actorUserId?: string | null;
}): Promise<boolean> {
  const translations = new ProjectTranslationService(db);
  const sourceFile = await translations.getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  if (!sourceFile) {
    return false;
  }

  const [key] = await db
    .select({
      id: schema.projectTranslationKeys.id,
      sourceText: schema.projectTranslationKeys.sourceText,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.id, input.translationKeyId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
      ),
    )
    .limit(1);

  if (!key) {
    return false;
  }

  const [existing] = await db
    .select({
      id: schema.projectTranslations.id,
      sourceJobId: schema.projectTranslations.sourceJobId,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.translationKeyId, key.id),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
      ),
    )
    .limit(1);
  const step = input.approve ? "review" : "translation";
  const provenance = input.provenance ?? "manual";
  // A save made while a task for people covers the string is that task's work; otherwise it
  // belongs to the task that produced the translation.
  const sourceJobId =
    input.sourceJobId ??
    (await openPersonTaskForString({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: sourceFile.id,
      targetLocale: input.targetLocale,
      step,
    })) ??
    existing?.sourceJobId ??
    undefined;
  const [project] = await db
    .select({ sourceLocale: schema.projects.sourceLocale })
    .from(schema.projects)
    .where(eq(schema.projects.id, input.projectId));

  await captureAnalysis({
    organizationId: input.organizationId,
    projectId: input.projectId,
    jobId: sourceJobId,
    sourceLocale: project?.sourceLocale ?? "en",
    targetLocale: input.targetLocale,
    sourceEntries: { [key.id]: key.sourceText },
    billable: provenance === "manual",
    step,
  });

  if (input.text.trim()) {
    // A person's save keeps the given text's source when they kept the text; other saves bring
    // their own (a task's output, an import).
    const origin =
      provenance === "manual"
        ? personSave(
            existing
              ? (
                  await textOrigins(input.organizationId, [
                    { translationId: existing.id, text: input.text },
                  ])
                )[0]
              : undefined,
          )
        : { source: sourceOfProvenance(provenance), unchanged: undefined };
    await captureCompletions({
      organizationId: input.organizationId,
      jobId: sourceJobId,
      targetLocale: input.targetLocale,
      sourceEntries: { [key.id]: key.sourceText },
      provenance: provenance === "manual" ? "human" : "automated",
      step,
      actorUserId: provenance === "manual" ? input.actorUserId : null,
      source: origin.source,
      ...(origin.unchanged === undefined ? {} : { unchanged: { [key.id]: origin.unchanged } }),
    });
  }

  return true;
}
