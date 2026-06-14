import { and, eq, inArray, sql } from "drizzle-orm";

import type { ProjectSourceStringEntry } from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

const maxKeysPerImport = 5_000;

export async function getRepositorySourceFileByPath(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}) {
  const [row] = await db
    .select({
      id: schema.repositorySourceFiles.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        eq(schema.repositorySourceFiles.sourcePath, input.sourcePath),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function upsertProjectTranslationKeysFromEntries(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  sourceFileVersionId: string;
  entries: ProjectSourceStringEntry[];
}) {
  const entries = input.entries
    .map((entry) => ({
      key: entry.key.trim(),
      sourceText: entry.text,
      context: entry.context?.trim() || null,
      type: entry.type?.trim() || null,
      normalizedSourceText: normalizeTranslationMemorySourceText(entry.text),
    }))
    .filter((entry) => entry.key.length > 0 && entry.sourceText.trim().length > 0)
    .slice(0, maxKeysPerImport);

  if (entries.length === 0) {
    return { imported: 0, updated: 0 };
  }

  const existing = await db
    .select({
      key: schema.projectTranslationKeys.key,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
        inArray(
          schema.projectTranslationKeys.key,
          entries.map((entry) => entry.key),
        ),
      ),
    );

  const existingKeys = new Set(existing.map((row) => row.key));
  let updated = 0;
  for (const entry of entries) {
    if (existingKeys.has(entry.key)) {
      updated += 1;
    }
  }
  const imported = entries.length - updated;

  await db
    .insert(schema.projectTranslationKeys)
    .values(
      entries.map((entry) => ({
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: input.repositorySourceFileId,
        key: entry.key,
        sourceText: entry.sourceText,
        normalizedSourceText: entry.normalizedSourceText,
        context: entry.context,
        type: entry.type,
        sourceFileVersionId: input.sourceFileVersionId,
      })),
    )
    .onConflictDoUpdate({
      target: [
        schema.projectTranslationKeys.projectId,
        schema.projectTranslationKeys.repositorySourceFileId,
        schema.projectTranslationKeys.key,
      ],
      set: {
        sourceText: sql`excluded.source_text`,
        normalizedSourceText: sql`excluded.normalized_source_text`,
        context: sql`excluded.context`,
        type: sql`excluded.type`,
        sourceFileVersionId: sql`excluded.source_file_version_id`,
        updatedAt: sql`now()`,
      },
    });

  return { imported, updated };
}

export async function listProjectTranslationKeysForFile(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
  limit?: number;
}) {
  const limit = input.limit ?? 2_000;

  return db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      sourceText: schema.projectTranslationKeys.sourceText,
      context: schema.projectTranslationKeys.context,
      type: schema.projectTranslationKeys.type,
      maxLength: schema.projectTranslationKeys.maxLength,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
      ),
    )
    .limit(limit);
}

export async function getProjectTranslationsByKeyIds(input: {
  organizationId: string;
  projectId: string;
  translationKeyIds: string[];
  targetLocale: string;
}) {
  if (input.translationKeyIds.length === 0) {
    return [];
  }

  return db
    .select({
      id: schema.projectTranslations.id,
      translationKeyId: schema.projectTranslations.translationKeyId,
      text: schema.projectTranslations.text,
      status: schema.projectTranslations.status,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.organizationId, input.organizationId),
        eq(schema.projectTranslations.projectId, input.projectId),
        eq(schema.projectTranslations.targetLocale, input.targetLocale),
        inArray(schema.projectTranslations.translationKeyId, input.translationKeyIds),
      ),
    );
}

export async function loadProjectTranslationsAsPrefilledEntries(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
}): Promise<Record<string, string>> {
  const sourceFile = await getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });

  if (!sourceFile) {
    return {};
  }

  const keys = await listProjectTranslationKeysForFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
  });

  if (keys.length === 0) {
    return {};
  }

  const translations = await getProjectTranslationsByKeyIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyIds: keys.map((key) => key.id),
    targetLocale: input.targetLocale,
  });
  const translationByKeyId = new Map(
    translations.map((translation) => [translation.translationKeyId, translation]),
  );

  const prefilled: Record<string, string> = {};
  for (const key of keys) {
    const translation = translationByKeyId.get(key.id);
    if (!translation?.text?.trim()) {
      continue;
    }
    prefilled[key.key] = translation.text;
  }

  return prefilled;
}
