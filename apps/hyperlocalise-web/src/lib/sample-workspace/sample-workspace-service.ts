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
import { and, eq, inArray, sql } from "drizzle-orm";

import type { DatabaseTransaction } from "@/lib/database/client";
import { db, schema } from "@/lib/database/client";
import { getFileStorageAdapter } from "@/lib/file-storage/get-file-storage-adapter";
import { createRepositorySourceFileVersion, createStoredFile } from "@/lib/file-storage/records";
import type { FileStorageAdapter } from "@/lib/file-storage/types";
import { createLogger } from "@/lib/log";
import { err, ok, type Result } from "@/lib/primitives/result/results";
import { insertWithAllocatedProjectIdentifier } from "@/lib/projects/issue-identifier/allocate-issue-identifier";
import { claimSourceFileIngest } from "@/lib/projects/files/source-file-ingest";
import { reconcileSourceFileTranslationKeys } from "@/lib/projects/files/reconcile-source-file-translation-keys";
import { ensureDefaultWorkspaceTeam } from "@/lib/teams/default-workspace-team";
import { normalizeTranslationMemorySourceText } from "@/lib/translation/normalizeTranslationMemorySourceText";

import {
  SAMPLE_DICTIONARY,
  SAMPLE_GLOSSARY,
  SAMPLE_MEMORY,
  SAMPLE_PROJECTS,
  SAMPLE_SOURCE_LOCALE,
  type SampleFile,
  type SampleLocaleProgress,
  type SampleProject,
  type SampleTargetLocale,
} from "./sample-workspace-content";

const logger = createLogger("sample-workspace-service");

const SAMPLE_UPLOAD_SURFACE = "sample_workspace";
const SAMPLE_METADATA_KEY = "sampleWorkspace";
const SAMPLE_CONTENT_VERSION = 1;

/** Stored on each sample project so removal finds every resource the seed created. */
type SampleWorkspaceMarker = {
  version: number;
  glossaryIds: string[];
  memoryIds: string[];
  dictionaryIds: string[];
};

export type SampleWorkspaceProject = { id: string; name: string };

export type SampleWorkspaceStatus = {
  loaded: boolean;
  projects: SampleWorkspaceProject[];
};

export type SampleWorkspaceSeedResult = {
  projects: SampleWorkspaceProject[];
  glossaryCount: number;
  memoryCount: number;
  dictionaryCount: number;
  fileCount: number;
  stringCount: number;
};

export type SampleWorkspaceSeedError = { code: "sample_workspace_exists" };

type SeedInput = {
  organizationId: string;
  userId: string;
  teamId?: string | null;
  fileStorageAdapter?: FileStorageAdapter;
};

type CreatedProject = { project: SampleProject; id: string };

function sampleProjectsWhere(organizationId: string) {
  return and(
    eq(schema.projects.organizationId, organizationId),
    sql`(${schema.projects.providerMetadata} -> ${SAMPLE_METADATA_KEY}) is not null`,
  );
}

async function listSampleProjects(organizationId: string) {
  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      providerMetadata: schema.projects.providerMetadata,
    })
    .from(schema.projects)
    .where(sampleProjectsWhere(organizationId));
}

export async function getSampleWorkspaceStatus(
  organizationId: string,
): Promise<SampleWorkspaceStatus> {
  const projects = await listSampleProjects(organizationId);
  return {
    loaded: projects.length > 0,
    projects: projects.map(({ id, name }) => ({ id, name })),
  };
}

/**
 * Creates sample projects with source files, translations, a glossary, a translation memory and
 * a spellcheck dictionary. Guideline documents are uploaded separately by the browser because
 * go-svc owns guideline ingest. On failure everything created so far is removed again.
 */
export async function seedSampleWorkspace(
  input: SeedInput,
): Promise<Result<SampleWorkspaceSeedResult, SampleWorkspaceSeedError>> {
  const existing = await listSampleProjects(input.organizationId);
  if (existing.length > 0) {
    return err({ code: "sample_workspace_exists" });
  }

  const teamId = input.teamId ?? (await ensureDefaultWorkspaceTeam(input.organizationId)).id;

  // Sample projects skip the plan's project limit: they are created once per workspace with
  // fixed content, and a trial on a one-project plan still needs to see a full workspace.
  const created = await db.transaction((tx) => insertSampleResources(tx, { ...input, teamId }));

  try {
    let fileCount = 0;
    let stringCount = 0;
    for (const { project, id } of created.projects) {
      for (const file of project.files) {
        await seedSampleFile({ ...input, project, projectId: id, file });
        fileCount += 1;
        stringCount += file.strings.length;
      }
      await seedSampleComments({ ...input, project, projectId: id });
    }

    return ok({
      projects: created.projects.map(({ project, id }) => ({ id, name: project.name })),
      glossaryCount: 1,
      memoryCount: 1,
      dictionaryCount: 1,
      fileCount,
      stringCount,
    });
  } catch (error) {
    logger.error(
      {
        organizationId: input.organizationId,
        error: error instanceof Error ? error.message : "unknown",
      },
      "sample workspace seed failed; removing partial sample data",
    );
    await removeSampleWorkspace({
      organizationId: input.organizationId,
      fileStorageAdapter: input.fileStorageAdapter,
    }).catch(() => {});
    throw error;
  }
}

async function insertSampleResources(
  tx: DatabaseTransaction,
  input: SeedInput & { teamId: string },
): Promise<{ projects: CreatedProject[] }> {
  const allTargetLocales = [
    ...new Set(SAMPLE_PROJECTS.flatMap((project) => project.targetLocales.map((t) => t.locale))),
  ];

  const [glossary] = await tx
    .insert(schema.glossaries)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: SAMPLE_GLOSSARY.name,
      description: SAMPLE_GLOSSARY.description,
      sourceLocale: SAMPLE_SOURCE_LOCALE,
      targetLocale: null,
      controlLevel: "org",
      localeCoverage: [SAMPLE_SOURCE_LOCALE, ...allTargetLocales],
    })
    .returning({ id: schema.glossaries.id });
  if (!glossary) throw new Error("sample glossary insert failed");

  for (const concept of SAMPLE_GLOSSARY.concepts) {
    const [conceptRow] = await tx
      .insert(schema.glossaryConcepts)
      .values({
        glossaryId: glossary.id,
        primaryTerm: concept.primaryTerm,
        definition: concept.definition,
        translatable: concept.translatable,
        note: concept.note ?? "",
        createdByUserId: input.userId,
        modifiedByUserId: input.userId,
      })
      .returning({ id: schema.glossaryConcepts.id });
    if (!conceptRow) throw new Error("sample glossary concept insert failed");

    const terms = [
      { locale: SAMPLE_SOURCE_LOCALE, text: concept.primaryTerm, forbidden: false },
      ...Object.entries(concept.terms).map(([locale, text]) => ({
        locale,
        text,
        forbidden: false,
      })),
      ...Object.entries("forbidden" in concept ? (concept.forbidden ?? {}) : {}).map(
        ([locale, text]) => ({ locale, text, forbidden: true }),
      ),
    ];
    await tx.insert(schema.glossaryTerms).values(
      terms.map((term) => ({
        glossaryId: glossary.id,
        conceptId: conceptRow.id,
        locale: term.locale,
        term: term.text,
        sourceTerm: term.text,
        targetTerm: term.text,
        status: term.forbidden ? "not_recommended" : "preferred",
        forbidden: term.forbidden,
        provenance: "manual" as const,
        createdByUserId: input.userId,
        modifiedByUserId: input.userId,
      })),
    );
  }

  const [memory] = await tx
    .insert(schema.memories)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: SAMPLE_MEMORY.name,
      description: SAMPLE_MEMORY.description,
      source: "native",
      localeCoverage: [SAMPLE_SOURCE_LOCALE, ...allTargetLocales],
    })
    .returning({ id: schema.memories.id });
  if (!memory) throw new Error("sample memory insert failed");

  await tx.insert(schema.memoryEntries).values(
    SAMPLE_MEMORY.entries.flatMap((entry) =>
      Object.entries(entry.translations).map(([targetLocale, targetText]) => ({
        memoryId: memory.id,
        sourceLocale: SAMPLE_SOURCE_LOCALE,
        targetLocale,
        sourceText: entry.sourceText,
        normalizedSourceText: normalizeTranslationMemorySourceText(entry.sourceText),
        targetText,
        createdByUserId: input.userId,
        modifiedByUserId: input.userId,
      })),
    ),
  );

  const [dictionary] = await tx
    .insert(schema.spellcheckDictionaries)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.userId,
      name: SAMPLE_DICTIONARY.name,
      description: SAMPLE_DICTIONARY.description,
    })
    .returning({ id: schema.spellcheckDictionaries.id });
  if (!dictionary) throw new Error("sample dictionary insert failed");

  await tx.insert(schema.spellcheckDictionaryWords).values(
    SAMPLE_DICTIONARY.locales.flatMap((locale) =>
      SAMPLE_DICTIONARY.words.map((word) => ({
        dictionaryId: dictionary.id,
        locale,
        word,
        wordNormalized: word.toLocaleLowerCase(),
        createdByUserId: input.userId,
      })),
    ),
  );

  const marker: SampleWorkspaceMarker = {
    version: SAMPLE_CONTENT_VERSION,
    glossaryIds: [glossary.id],
    memoryIds: [memory.id],
    dictionaryIds: [dictionary.id],
  };

  const projects: CreatedProject[] = [];
  for (const project of SAMPLE_PROJECTS) {
    const projectId = `project_${crypto.randomUUID()}`;
    await insertWithAllocatedProjectIdentifier({
      organizationId: input.organizationId,
      name: project.name,
      database: tx,
      insert: (identifier, attemptDb) =>
        attemptDb.insert(schema.projects).values({
          id: projectId,
          organizationId: input.organizationId,
          teamId: input.teamId,
          createdByUserId: input.userId,
          updatedByUserId: input.userId,
          name: project.name,
          identifier,
          description: project.description,
          translationContext: project.translationContext,
          source: "native",
          sourceLocale: SAMPLE_SOURCE_LOCALE,
          targetLocales: project.targetLocales.map((target) => target.locale),
          providerMetadata: { [SAMPLE_METADATA_KEY]: marker },
        }),
    });

    await tx
      .insert(schema.projectBranches)
      .values({
        organizationId: input.organizationId,
        projectId,
        name: "main",
        isDefault: true,
        createdByUserId: input.userId,
      })
      .onConflictDoNothing();
    await tx.insert(schema.projectGlossaries).values({
      organizationId: input.organizationId,
      projectId,
      glossaryId: glossary.id,
      priority: 0,
    });
    await tx.insert(schema.projectMemories).values({
      organizationId: input.organizationId,
      projectId,
      memoryId: memory.id,
      priority: 0,
    });
    await tx.insert(schema.projectSpellcheckDictionaries).values({
      organizationId: input.organizationId,
      projectId,
      dictionaryId: dictionary.id,
      priority: 0,
    });

    projects.push({ project, id: projectId });
  }

  return { projects };
}

function sampleFileContent(file: SampleFile): Uint8Array {
  const payload = Object.fromEntries(file.strings.map((entry) => [entry.key, entry.text]));
  return new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`);
}

/**
 * Stores the source file and reconciles its keys in-process instead of running the sandbox
 * ingest workflow, so the content editor has strings as soon as the seed returns.
 */
async function seedSampleFile(
  input: SeedInput & { project: SampleProject; projectId: string; file: SampleFile },
) {
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  const filename = input.file.sourcePath.split("/").pop() ?? input.file.sourcePath;
  let uploadedKey: string | null = null;

  const version = await db
    .transaction(async (tx) => {
      const storedFile = await createStoredFile({
        organizationId: input.organizationId,
        projectId: input.projectId,
        createdByUserId: input.userId,
        role: "source",
        sourceKind: "repository_file",
        filename,
        contentType: "application/json",
        content: sampleFileContent(input.file),
        metadata: { sourcePath: input.file.sourcePath, uploadSurface: SAMPLE_UPLOAD_SURFACE },
        adapter,
        db: tx,
      });
      uploadedKey = storedFile.storageKey;

      return createRepositorySourceFileVersion({
        storedFile,
        sourcePath: input.file.sourcePath,
        branchName: "main",
        uploadedByUserId: input.userId,
        uploadSurface: SAMPLE_UPLOAD_SURFACE,
        db: tx,
      });
    })
    .catch(async (error) => {
      if (uploadedKey) {
        await adapter.delete({ keyOrUrl: uploadedKey }).catch(() => {});
      }
      throw error;
    });

  const workflowRunId = `${SAMPLE_UPLOAD_SURFACE}:${crypto.randomUUID()}`;
  const claimed = await claimSourceFileIngest({
    sourceFileVersionId: version.id,
    organizationId: input.organizationId,
    workflowRunId,
  });
  if (!claimed) throw new Error("sample source file ingest claim failed");

  await reconcileSourceFileTranslationKeys({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: version.repositorySourceFileId,
    sourceFileVersionId: version.id,
    workflowRunId,
    entries: input.file.strings.map((entry) => ({
      key: entry.key,
      text: entry.text,
      context: entry.context ?? null,
      ...(entry.maxLength ? { maxLength: entry.maxLength } : {}),
    })),
  });

  const keys = await db
    .select({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        eq(schema.projectTranslationKeys.repositorySourceFileId, version.repositorySourceFileId),
      ),
    );
  const keyIds = new Map(keys.map((row) => [row.key, row.id]));

  const translations = input.project.targetLocales.flatMap(({ locale, progress }) =>
    input.file.strings.flatMap((entry, index) => {
      const text = entry.translations[locale];
      const translationKeyId = keyIds.get(entry.key);
      const status = sampleTranslationStatus(progress, index, input.file.strings.length);
      if (!text || !translationKeyId || !status) return [];
      return [
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          translationKeyId,
          targetLocale: locale,
          text,
          status,
          provenance: "import" as const,
          origin: status === "approved" ? ("human" as const) : ("machine" as const),
          reviewedByUserId: status === "approved" ? input.userId : null,
          reviewedAt: status === "approved" ? new Date() : null,
        },
      ];
    }),
  );
  if (translations.length > 0) {
    await db.insert(schema.projectTranslations).values(translations).onConflictDoNothing();
  }
}

/** Spreads translation states across a file so each locale shows a different stage of work. */
function sampleTranslationStatus(
  progress: SampleLocaleProgress,
  index: number,
  total: number,
): "approved" | "needs_review" | "draft" | null {
  switch (progress) {
    case "approved":
      return "approved";
    case "in_review":
      return index < Math.ceil(total / 2) ? "approved" : "needs_review";
    case "partial":
      if (index < Math.ceil(total / 3)) return "approved";
      return index < Math.ceil((total * 2) / 3) ? "draft" : null;
    case "untranslated":
      return null;
  }
}

async function seedSampleComments(
  input: SeedInput & { project: SampleProject; projectId: string },
) {
  if (input.project.comments.length === 0) return;

  const keys = await db
    .select({ id: schema.projectTranslationKeys.id, key: schema.projectTranslationKeys.key })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        inArray(
          schema.projectTranslationKeys.key,
          input.project.comments.map((comment) => comment.key),
        ),
      ),
    );
  const keyIds = new Map(keys.map((row) => [row.key, row.id]));

  const comments = input.project.comments.flatMap((comment) => {
    const translationKeyId = keyIds.get(comment.key);
    if (!translationKeyId) return [];
    return [
      {
        organizationId: input.organizationId,
        projectId: input.projectId,
        translationKeyId,
        targetLocale: comment.locale satisfies SampleTargetLocale,
        type: "comment" as const,
        text: comment.text,
        authorUserId: input.userId,
      },
    ];
  });
  if (comments.length > 0) {
    await db.insert(schema.projectTranslationComments).values(comments);
  }
}

function readMarker(providerMetadata: Record<string, unknown>): SampleWorkspaceMarker | null {
  const marker = providerMetadata[SAMPLE_METADATA_KEY];
  if (!marker || typeof marker !== "object") return null;
  const value = marker as Partial<SampleWorkspaceMarker>;
  const ids = (list: unknown) =>
    Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  return {
    version: typeof value.version === "number" ? value.version : SAMPLE_CONTENT_VERSION,
    glossaryIds: ids(value.glossaryIds),
    memoryIds: ids(value.memoryIds),
    dictionaryIds: ids(value.dictionaryIds),
  };
}

/** Deletes the sample projects (with their files and strings) and the resources they used. */
export async function removeSampleWorkspace(input: {
  organizationId: string;
  fileStorageAdapter?: FileStorageAdapter;
}): Promise<{ removedProjectCount: number }> {
  const projects = await listSampleProjects(input.organizationId);
  if (projects.length === 0) {
    return { removedProjectCount: 0 };
  }

  const projectIds = projects.map((project) => project.id);
  const markers = projects.flatMap((project) => readMarker(project.providerMetadata) ?? []);
  const glossaryIds = [...new Set(markers.flatMap((marker) => marker.glossaryIds))];
  const memoryIds = [...new Set(markers.flatMap((marker) => marker.memoryIds))];
  const dictionaryIds = [...new Set(markers.flatMap((marker) => marker.dictionaryIds))];

  const storedFiles = await db
    .select({ id: schema.storedFiles.id, storageKey: schema.storedFiles.storageKey })
    .from(schema.storedFiles)
    .where(
      and(
        eq(schema.storedFiles.organizationId, input.organizationId),
        inArray(schema.storedFiles.projectId, projectIds),
      ),
    );

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.projects)
      .where(
        and(
          eq(schema.projects.organizationId, input.organizationId),
          inArray(schema.projects.id, projectIds),
        ),
      );
    if (glossaryIds.length > 0) {
      await tx
        .delete(schema.glossaries)
        .where(
          and(
            eq(schema.glossaries.organizationId, input.organizationId),
            inArray(schema.glossaries.id, glossaryIds),
          ),
        );
    }
    if (memoryIds.length > 0) {
      await tx
        .delete(schema.memories)
        .where(
          and(
            eq(schema.memories.organizationId, input.organizationId),
            inArray(schema.memories.id, memoryIds),
          ),
        );
    }
    if (dictionaryIds.length > 0) {
      await tx
        .delete(schema.spellcheckDictionaries)
        .where(
          and(
            eq(schema.spellcheckDictionaries.organizationId, input.organizationId),
            inArray(schema.spellcheckDictionaries.id, dictionaryIds),
          ),
        );
    }
  });

  // Best effort: a file another record still points at (for example a job output) stays.
  const adapter = input.fileStorageAdapter ?? getFileStorageAdapter();
  for (const file of storedFiles) {
    const deleted = await db
      .delete(schema.storedFiles)
      .where(eq(schema.storedFiles.id, file.id))
      .then(() => true)
      .catch(() => false);
    if (deleted) {
      await adapter.delete({ keyOrUrl: file.storageKey }).catch(() => {});
    }
  }

  return { removedProjectCount: projectIds.length };
}
