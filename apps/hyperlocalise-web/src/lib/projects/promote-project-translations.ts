import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

function sourceTextHash(sourceText: string) {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export async function promoteApprovedProjectTranslationsToMemory(input: {
  organizationId: string;
  projectId: string;
  memoryId: string;
  sourceLocale: string;
  targetLocale?: string;
  sourcePath?: string;
}) {
  const [memory] = await db
    .select({ id: schema.memories.id })
    .from(schema.memories)
    .where(
      and(
        eq(schema.memories.id, input.memoryId),
        eq(schema.memories.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!memory) {
    return { promoted: 0, skipped: 0, reason: "memory_not_found" as const };
  }

  const [attachment] = await db
    .select({ memoryId: schema.projectMemories.memoryId })
    .from(schema.projectMemories)
    .where(
      and(
        eq(schema.projectMemories.projectId, input.projectId),
        eq(schema.projectMemories.memoryId, input.memoryId),
      ),
    )
    .limit(1);

  if (!attachment) {
    return { promoted: 0, skipped: 0, reason: "memory_not_attached" as const };
  }

  const keyConditions = [
    eq(schema.projectTranslationKeys.organizationId, input.organizationId),
    eq(schema.projectTranslationKeys.projectId, input.projectId),
  ];

  if (input.sourcePath) {
    const [sourceFile] = await db
      .select({ id: schema.repositorySourceFiles.id })
      .from(schema.repositorySourceFiles)
      .where(
        and(
          eq(schema.repositorySourceFiles.organizationId, input.organizationId),
          eq(schema.repositorySourceFiles.projectId, input.projectId),
          eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
        ),
      )
      .limit(1);

    if (!sourceFile) {
      return { promoted: 0, skipped: 0, reason: "source_file_not_found" as const };
    }

    keyConditions.push(eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id));
  }

  const translationConditions = [
    eq(schema.projectTranslations.organizationId, input.organizationId),
    eq(schema.projectTranslations.projectId, input.projectId),
    eq(schema.projectTranslations.status, "approved"),
  ];

  if (input.targetLocale) {
    translationConditions.push(eq(schema.projectTranslations.targetLocale, input.targetLocale));
  }

  const rows = await db
    .select({
      key: schema.projectTranslationKeys.key,
      sourceText: schema.projectTranslationKeys.sourceText,
      targetLocale: schema.projectTranslations.targetLocale,
      targetText: schema.projectTranslations.text,
      translationKeyId: schema.projectTranslationKeys.id,
      translationId: schema.projectTranslations.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.projectTranslations)
    .innerJoin(
      schema.projectTranslationKeys,
      eq(schema.projectTranslations.translationKeyId, schema.projectTranslationKeys.id),
    )
    .leftJoin(
      schema.repositorySourceFiles,
      eq(schema.projectTranslationKeys.repositorySourceFileId, schema.repositorySourceFiles.id),
    )
    .where(and(...translationConditions, ...keyConditions));

  const eligible = rows.filter((row) => row.targetText.trim().length > 0);
  if (eligible.length === 0) {
    return { promoted: 0, skipped: 0, reason: "no_approved_translations" as const };
  }

  const values = eligible.map((row) => {
    const normalized = normalizeTranslationMemorySourceText(row.sourceText);
    return {
      memoryId: input.memoryId,
      sourceLocale: input.sourceLocale,
      targetLocale: row.targetLocale,
      sourceText: row.sourceText,
      normalizedSourceText: normalized,
      targetText: row.targetText,
      provenance: "approved_job" as const,
      reviewStatus: "approved",
      externalKey: `${row.translationKeyId}:${row.targetLocale}`,
      metadata: {
        projectId: input.projectId,
        sourcePath: row.sourcePath,
        segmentKey: row.key,
        sourceTextHash: sourceTextHash(row.sourceText),
        translationId: row.translationId,
      },
    };
  });

  await db
    .insert(schema.memoryEntries)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.memoryEntries.memoryId,
        schema.memoryEntries.sourceLocale,
        schema.memoryEntries.targetLocale,
        schema.memoryEntries.normalizedSourceText,
      ],
      set: {
        targetText: sql`excluded.target_text`,
        provenance: sql`excluded.provenance`,
        reviewStatus: sql`excluded.review_status`,
        externalKey: sql`excluded.external_key`,
        metadata: sql`excluded.metadata`,
        updatedAt: sql`now()`,
      },
    });

  return { promoted: values.length, skipped: 0, reason: null };
}

export async function persistStringJobTranslations(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  sourceLocale: string;
  translations: Array<{ locale: string; text: string }>;
  translationKeyId?: string;
}) {
  if (!input.translationKeyId) {
    return;
  }

  const [key] = await db
    .select({
      id: schema.projectTranslationKeys.id,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.id, input.translationKeyId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!key) {
    return;
  }

  const translationValues = input.translations.map((translation) => ({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyId: key.id,
    targetLocale: translation.locale,
    text: translation.text,
    status: "needs_review" as const,
    provenance: "translation_job" as const,
    sourceJobId: input.jobId,
  }));

  if (translationValues.length === 0) {
    return;
  }

  await db
    .insert(schema.projectTranslations)
    .values(translationValues)
    .onConflictDoUpdate({
      target: [
        schema.projectTranslations.translationKeyId,
        schema.projectTranslations.targetLocale,
      ],
      set: {
        text: sql`excluded.text`,
        status: sql`excluded.status`,
        provenance: sql`excluded.provenance`,
        sourceJobId: sql`excluded.source_job_id`,
        reviewedAt: null,
        reviewedByUserId: null,
        updatedAt: sql`now()`,
      },
    });
}

export async function persistFileJobTranslations(input: {
  organizationId: string;
  projectId: string;
  jobId: string;
  sourcePath: string;
  sourceLocale: string;
  targetLocale: string;
  sourceEntries: Record<string, string>;
  targetEntries: Record<string, string>;
}) {
  const [sourceFile] = await db
    .select({ id: schema.repositorySourceFiles.id })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
      ),
    )
    .limit(1);

  if (!sourceFile) {
    return;
  }

  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
        inArray(schema.projectTranslationKeys.key, Object.keys(input.targetEntries)),
      ),
    );

  const translationValues = keys.flatMap((key) => {
    const targetText = input.targetEntries[key.key];
    if (!targetText?.trim()) {
      return [];
    }

    return [
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId: key.id,
        targetLocale: input.targetLocale,
        text: targetText,
        status: "needs_review" as const,
        provenance: "translation_job" as const,
        sourceJobId: input.jobId,
      },
    ];
  });

  if (translationValues.length === 0) {
    return;
  }

  await db
    .insert(schema.projectTranslations)
    .values(translationValues)
    .onConflictDoUpdate({
      target: [
        schema.projectTranslations.translationKeyId,
        schema.projectTranslations.targetLocale,
      ],
      set: {
        text: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.text ELSE excluded.text END`,
        status: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.status ELSE excluded.status END`,
        provenance: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.provenance ELSE excluded.provenance END`,
        sourceJobId: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.source_job_id ELSE excluded.source_job_id END`,
        reviewedAt: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.reviewed_at ELSE NULL END`,
        reviewedByUserId: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.reviewed_by_user_id ELSE NULL END`,
        updatedAt: sql`CASE WHEN project_translations.status = 'approved' THEN project_translations.updated_at ELSE now() END`,
      },
    });
}
