import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import type {
  ProjectFileCatQueueFilter,
  ProjectSourceStringEntry,
} from "@/api/routes/project/project.schema";
import { db, schema } from "@/lib/database";
import { ProjectServiceBase } from "@/lib/projects/project-service-base";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

const maxKeysPerImport = 5_000;

function sourceTextHash(sourceText: string) {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

function translationKeysFileConditions(input: {
  organizationId: string;
  projectId: string;
  repositorySourceFileId: string;
}) {
  return and(
    eq(schema.projectTranslationKeys.organizationId, input.organizationId),
    eq(schema.projectTranslationKeys.projectId, input.projectId),
    eq(schema.projectTranslationKeys.repositorySourceFileId, input.repositorySourceFileId),
  );
}

function translationKeysSearchCondition(search: string | undefined) {
  const query = search?.trim();
  if (!query) {
    return undefined;
  }

  const pattern = `%${query}%`;

  return or(
    ilike(schema.projectTranslationKeys.key, pattern),
    ilike(schema.projectTranslationKeys.sourceText, pattern),
    ilike(schema.projectTranslationKeys.context, pattern),
  );
}

function translationKeysQueueFilterCondition(input: {
  organizationId: string;
  projectId: string;
  targetLocale: string;
  queueFilter?: ProjectFileCatQueueFilter;
}) {
  const filter = input.queueFilter;
  if (!filter || filter === "all") {
    return undefined;
  }

  const translationMatch = sql`
    ${schema.projectTranslations.translationKeyId} = ${schema.projectTranslationKeys.id}
    and ${schema.projectTranslations.organizationId} = ${input.organizationId}
    and ${schema.projectTranslations.projectId} = ${input.projectId}
    and ${schema.projectTranslations.targetLocale} = ${input.targetLocale}
  `;

  switch (filter) {
    case "untranslated":
      return sql`not exists (
        select 1
        from ${schema.projectTranslations}
        where ${translationMatch}
          and trim(${schema.projectTranslations.text}) != ''
      )`;
    case "reviewed":
      return sql`exists (
        select 1
        from ${schema.projectTranslations}
        where ${translationMatch}
          and ${schema.projectTranslations.status} = 'approved'
      )`;
    case "needs_review":
      return sql`exists (
        select 1
        from ${schema.projectTranslations}
        where ${translationMatch}
          and trim(${schema.projectTranslations.text}) != ''
          and ${schema.projectTranslations.status} != 'approved'
      )`;
    case "has_issues":
      return sql`exists (
        select 1
        from ${schema.projectTranslationComments}
        where ${schema.projectTranslationComments.translationKeyId} = ${schema.projectTranslationKeys.id}
          and ${schema.projectTranslationComments.organizationId} = ${input.organizationId}
          and ${schema.projectTranslationComments.projectId} = ${input.projectId}
          and ${schema.projectTranslationComments.targetLocale} = ${input.targetLocale}
          and ${schema.projectTranslationComments.type} = 'issue'
          and ${schema.projectTranslationComments.status} = 'unresolved'
      )`;
    default:
      return undefined;
  }
}

export class ProjectTranslationService extends ProjectServiceBase {
  constructor(database: typeof db = db) {
    super(database, "projects.translations");
  }

  async getRepositorySourceFileByPath(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
  }) {
    const [row] = await this.database
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

  async upsertKeysFromEntries(input: {
    organizationId: string;
    projectId: string;
    repositorySourceFileId: string;
    sourceFileVersionId?: string | null;
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

    const existing = await this.database
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

    await this.database
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
          sourceFileVersionId: input.sourceFileVersionId ?? null,
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

    this.log.info(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        repositorySourceFileId: input.repositorySourceFileId,
        imported,
        updated,
        total: entries.length,
      },
      "upserted project translation keys",
    );

    return { imported, updated };
  }

  async countKeysForFile(input: {
    organizationId: string;
    projectId: string;
    repositorySourceFileId: string;
    targetLocale?: string;
    search?: string;
    queueFilter?: ProjectFileCatQueueFilter;
  }) {
    const [row] = await this.database
      .select({ total: count() })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          translationKeysFileConditions(input),
          translationKeysSearchCondition(input.search),
          input.targetLocale
            ? translationKeysQueueFilterCondition({
                organizationId: input.organizationId,
                projectId: input.projectId,
                targetLocale: input.targetLocale,
                queueFilter: input.queueFilter,
              })
            : undefined,
        ),
      );

    return Number(row?.total ?? 0);
  }

  async listKeysForFile(input: {
    organizationId: string;
    projectId: string;
    repositorySourceFileId: string;
    targetLocale?: string;
    limit?: number;
    offset?: number;
    search?: string;
    queueFilter?: ProjectFileCatQueueFilter;
  }) {
    const limit = input.limit ?? 2_000;
    const offset = input.offset ?? 0;

    return this.database
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
          translationKeysFileConditions(input),
          translationKeysSearchCondition(input.search),
          input.targetLocale
            ? translationKeysQueueFilterCondition({
                organizationId: input.organizationId,
                projectId: input.projectId,
                targetLocale: input.targetLocale,
                queueFilter: input.queueFilter,
              })
            : undefined,
        ),
      )
      .orderBy(asc(schema.projectTranslationKeys.key), asc(schema.projectTranslationKeys.id))
      .limit(limit)
      .offset(offset);
  }

  async getTranslationsByKeyIds(input: {
    organizationId: string;
    projectId: string;
    translationKeyIds: string[];
    targetLocale: string;
  }) {
    if (input.translationKeyIds.length === 0) {
      return [];
    }

    return this.database
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

  async loadAsPrefilledEntries(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    /** When true, export every source key (translation text or source fallback). Used by sync pull. */
    includeAllSourceKeys?: boolean;
  }): Promise<{
    prefilled: Record<string, string>;
    truncated: boolean;
    loadedKeyCount: number;
    maxKeyCount: number;
    translatedKeyCount: number;
  }> {
    const sourceFile = await this.getRepositorySourceFileByPath({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
    });

    if (!sourceFile) {
      return {
        prefilled: {},
        truncated: false,
        loadedKeyCount: 0,
        maxKeyCount: maxKeysPerImport,
        translatedKeyCount: 0,
      };
    }

    const keys = await this.listKeysForFile({
      organizationId: input.organizationId,
      projectId: input.projectId,
      repositorySourceFileId: sourceFile.id,
      limit: maxKeysPerImport + 1,
    });

    const truncated = keys.length > maxKeysPerImport;
    const visibleKeys = truncated ? keys.slice(0, maxKeysPerImport) : keys;

    if (visibleKeys.length === 0) {
      return {
        prefilled: {},
        truncated,
        loadedKeyCount: 0,
        maxKeyCount: maxKeysPerImport,
        translatedKeyCount: 0,
      };
    }

    const translations = await this.getTranslationsByKeyIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyIds: visibleKeys.map((key) => key.id),
      targetLocale: input.targetLocale,
    });
    const translationByKeyId = new Map(
      translations.map((translation) => [translation.translationKeyId, translation]),
    );

    const prefilled: Record<string, string> = {};
    let translatedKeyCount = 0;

    for (const key of visibleKeys) {
      const translation = translationByKeyId.get(key.id);
      const hasValidTranslation =
        Boolean(translation?.text?.trim()) && translation?.status !== "rejected";

      if (hasValidTranslation) {
        prefilled[key.key] = translation!.text;
        translatedKeyCount += 1;
        continue;
      }

      if (input.includeAllSourceKeys) {
        prefilled[key.key] = key.sourceText;
      }
    }

    return {
      prefilled,
      truncated,
      loadedKeyCount: visibleKeys.length,
      maxKeyCount: maxKeysPerImport,
      translatedKeyCount,
    };
  }

  async promoteApprovedToMemory(input: {
    organizationId: string;
    projectId: string;
    memoryId: string;
    sourceLocale: string;
    targetLocale?: string;
    sourcePath?: string;
  }) {
    const [memory] = await this.database
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
      this.log.warn(
        { organizationId: input.organizationId, memoryId: input.memoryId },
        "translation promotion skipped: memory not found",
      );
      return { promoted: 0, skipped: 0, reason: "memory_not_found" as const };
    }

    const [attachment] = await this.database
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
      this.log.warn(
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          memoryId: input.memoryId,
        },
        "translation promotion skipped: memory not attached",
      );
      return { promoted: 0, skipped: 0, reason: "memory_not_attached" as const };
    }

    const keyConditions = [
      eq(schema.projectTranslationKeys.organizationId, input.organizationId),
      eq(schema.projectTranslationKeys.projectId, input.projectId),
    ];

    if (input.sourcePath) {
      const [sourceFile] = await this.database
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
        this.log.warn(
          { organizationId: input.organizationId, projectId: input.projectId },
          "translation promotion skipped: source file not found",
        );
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

    const rows = await this.database
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
      this.log.debug(
        { organizationId: input.organizationId, projectId: input.projectId },
        "translation promotion skipped: no approved translations",
      );
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

    await this.database
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

    this.log.info(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        memoryId: input.memoryId,
        promoted: values.length,
      },
      "promoted approved project translations to memory",
    );

    return { promoted: values.length, skipped: 0, reason: null };
  }

  async persistStringJobTranslations(input: {
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

    const [key] = await this.database
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

    await this.database
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

  async persistFileJobTranslations(input: {
    organizationId: string;
    projectId: string;
    jobId: string;
    sourcePath: string;
    sourceLocale: string;
    targetLocale: string;
    sourceEntries: Record<string, string>;
    targetEntries: Record<string, string>;
  }) {
    const [sourceFile] = await this.database
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

    const keys = await this.database
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

    await this.database
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

  /**
   * Migrates already-translated entries into a target locale, matching them to
   * existing source keys for the given file. Imported translations are stored as
   * approved (provenance: import) and overwrite any existing translation for the
   * key/locale pair, since the caller is explicitly importing known-good content.
   */
  async importApprovedTranslationsFromEntries(input: {
    organizationId: string;
    projectId: string;
    sourcePath: string;
    targetLocale: string;
    entries: Record<string, string>;
    actorUserId?: string | null;
  }): Promise<{ matched: number; imported: number; skipped: number }> {
    const entryKeys = Object.keys(input.entries);
    if (entryKeys.length === 0) {
      return { matched: 0, imported: 0, skipped: 0 };
    }

    const [sourceFile] = await this.database
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
      return { matched: 0, imported: 0, skipped: entryKeys.length };
    }

    const keys = await this.database
      .select({
        id: schema.projectTranslationKeys.id,
        key: schema.projectTranslationKeys.key,
      })
      .from(schema.projectTranslationKeys)
      .where(
        and(
          eq(schema.projectTranslationKeys.projectId, input.projectId),
          eq(schema.projectTranslationKeys.repositorySourceFileId, sourceFile.id),
          inArray(schema.projectTranslationKeys.key, entryKeys),
        ),
      );

    const reviewedAt = new Date();
    const reviewedByUserId = input.actorUserId ?? null;

    const translationValues = keys.flatMap((key) => {
      const text = input.entries[key.key];
      if (!text?.trim()) {
        return [];
      }

      return [
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          translationKeyId: key.id,
          targetLocale: input.targetLocale,
          text,
          status: "approved" as const,
          provenance: "import" as const,
          reviewedAt,
          reviewedByUserId,
        },
      ];
    });

    const matched = keys.length;
    const imported = translationValues.length;
    const skipped = entryKeys.length - imported;

    if (translationValues.length === 0) {
      return { matched, imported, skipped };
    }

    await this.database
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
          sourceJobId: sql`NULL`,
          reviewedAt: sql`excluded.reviewed_at`,
          reviewedByUserId: sql`excluded.reviewed_by_user_id`,
          updatedAt: sql`now()`,
        },
      });

    this.log.info(
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetLocale: input.targetLocale,
        matched,
        imported,
        skipped,
      },
      "imported approved project translations",
    );

    return { matched, imported, skipped };
  }
}

export const projectTranslationService = new ProjectTranslationService();

export const getRepositorySourceFileByPath = (
  input: Parameters<ProjectTranslationService["getRepositorySourceFileByPath"]>[0],
) => projectTranslationService.getRepositorySourceFileByPath(input);

export const upsertProjectTranslationKeysFromEntries = (
  input: Parameters<ProjectTranslationService["upsertKeysFromEntries"]>[0],
) => projectTranslationService.upsertKeysFromEntries(input);

export const countProjectTranslationKeysForFile = (
  input: Parameters<ProjectTranslationService["countKeysForFile"]>[0],
) => projectTranslationService.countKeysForFile(input);

export const listProjectTranslationKeysForFile = (
  input: Parameters<ProjectTranslationService["listKeysForFile"]>[0],
) => projectTranslationService.listKeysForFile(input);

export const getProjectTranslationsByKeyIds = (
  input: Parameters<ProjectTranslationService["getTranslationsByKeyIds"]>[0],
) => projectTranslationService.getTranslationsByKeyIds(input);

export const loadProjectTranslationsAsPrefilledEntries = (
  input: Parameters<ProjectTranslationService["loadAsPrefilledEntries"]>[0],
) => projectTranslationService.loadAsPrefilledEntries(input);

export const promoteApprovedProjectTranslationsToMemory = (
  input: Parameters<ProjectTranslationService["promoteApprovedToMemory"]>[0],
) => projectTranslationService.promoteApprovedToMemory(input);

export const persistStringJobTranslations = (
  input: Parameters<ProjectTranslationService["persistStringJobTranslations"]>[0],
) => projectTranslationService.persistStringJobTranslations(input);

export const persistFileJobTranslations = (
  input: Parameters<ProjectTranslationService["persistFileJobTranslations"]>[0],
) => projectTranslationService.persistFileJobTranslations(input);

export const importApprovedProjectTranslationsFromEntries = (
  input: Parameters<ProjectTranslationService["importApprovedTranslationsFromEntries"]>[0],
) => projectTranslationService.importApprovedTranslationsFromEntries(input);
