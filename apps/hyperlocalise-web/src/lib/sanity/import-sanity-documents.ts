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

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import type { DatabaseTransaction } from "@/lib/database/client";
import { getLatestRepositorySourceFileVersion } from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";

import { createSanityClient } from "./client";
import {
  detectSanityDocumentTypes,
  fetchSanityDocumentById,
  fetchSanityTranslationMetadataLinks,
  listSanityDocumentsForImport,
  normalizeSanityPublishedDocumentId,
} from "./content-api";
import { SANITY_DOCUMENT_IMPORT_CONCURRENCY, SANITY_IMPORT_STALE_CONFIG } from "./constants";
import type { SanityDocumentRecord, SanityJsonObject } from "./sanity-field-value";
import {
  buildSanityDocumentSourcePath,
  hashSanityTranslationMap,
  readSanityDocumentSlug,
  serializeSanityTranslationMap,
  type SanityTranslationMap,
} from "./document-json";
import { DEFAULT_SANITY_EXISTING_TRANSLATION_POLICY } from "./existing-translation-policy";
import { extractSanityDocumentSourceMap, extractSanityTargetLocaleMap } from "./extract-source";
import { importSanityTargetTranslations } from "./import-sanity-target-translations";
import {
  readFileTranslationJobSourceFileId,
  readFileTranslationJobTargetLocales,
  resolveSanityImportJobTargetLocales,
  SANITY_IMPORT_OPEN_JOB_STATUSES,
  type SanityOpenFileTranslationJob,
} from "./import-sanity-jobs";
import {
  isSanityDocumentTypeLocalizable,
  resolveSanityDocumentI18nMode,
} from "./localization-mode";
import { loadSanityPipesAccessToken } from "./pipes";
import { mapProjectLocalesToSanity, resolveSanityLocaleKey } from "./sanity-locale";
import {
  assertLiveSanityAutomationConfigVersion,
  withCurrentSanityAutomationConfig,
} from "./sanity-sync-current";
import {
  buildSanityImportScopeKey,
  encodeSanityImportScopeCursor,
  isSanitySyncStaleConfigError,
  readSanityImportScopeCursor,
} from "./sanity-sync-scope";

const logger = createLogger("import-sanity-documents");
const RECONCILE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const jobQueue = createTranslationJobEventQueue();

export type ImportSanityDocumentsResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
  translationsImported: number;
  translationsSkipped: number;
  translationsFailed: number;
};

export function resolveSanitySourceIngestAction(input: {
  sourceContentUnchanged: boolean;
  latestIngestState: string | null | undefined;
}): "reuse" | "wait" | "upload" {
  if (input.sourceContentUnchanged && input.latestIngestState === "ingested") {
    return "reuse";
  }
  if (
    input.sourceContentUnchanged &&
    input.latestIngestState != null &&
    input.latestIngestState !== "failed"
  ) {
    return "wait";
  }
  return "upload";
}

function readSanityConfig(automation: WorkspaceAutomationRecord) {
  const sanity = automation.toolConfig.sanity;
  if (!sanity?.enabled || !sanity.workosUserId) {
    throw new Error("sanity_not_configured");
  }
  const projectId = automation.projectId?.trim();
  if (!projectId) {
    throw new Error("sanity_project_required");
  }
  const sanityProjectId = sanity.projectId?.trim();
  const dataset = sanity.dataset?.trim();
  if (!sanityProjectId) {
    throw new Error("sanity_sanity_project_required");
  }
  if (!dataset) {
    throw new Error("sanity_dataset_required");
  }
  const documentTypes = sanity.documentTypes.filter((type) => type.trim().length > 0);
  if (documentTypes.length === 0) {
    throw new Error("sanity_document_types_required");
  }
  return { sanity, projectId, sanityProjectId, dataset, documentTypes };
}

async function loadOpenSanityFileTranslationJobs(input: {
  organizationId: string;
  projectId: string;
}): Promise<SanityOpenFileTranslationJob[]> {
  const rows = await db
    .select({ inputPayload: schema.jobs.inputPayload })
    .from(schema.jobs)
    .where(
      and(
        eq(schema.jobs.organizationId, input.organizationId),
        eq(schema.jobs.projectId, input.projectId),
        eq(schema.jobs.kind, "translation"),
        inArray(schema.jobs.status, [...SANITY_IMPORT_OPEN_JOB_STATUSES]),
      ),
    );

  return rows.map((row) => ({
    sourceFileId: readFileTranslationJobSourceFileId(row.inputPayload),
    targetLocales: readFileTranslationJobTargetLocales(row.inputPayload),
  }));
}

async function archiveOutOfScopeSanityMappings(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  inScopeDocumentIds?: readonly string[];
  client: DatabaseTransaction;
}) {
  const rows = await input.client
    .select()
    .from(schema.sanityDocumentSyncStates)
    .where(
      and(
        eq(schema.sanityDocumentSyncStates.organizationId, input.organizationId),
        eq(schema.sanityDocumentSyncStates.automationId, input.automationId),
        eq(schema.sanityDocumentSyncStates.projectId, input.projectId),
        eq(schema.sanityDocumentSyncStates.sanityProjectId, input.sanityProjectId),
        eq(schema.sanityDocumentSyncStates.dataset, input.dataset),
        inArray(schema.sanityDocumentSyncStates.status, ["active", "import_failed", "push_failed"]),
      ),
    );

  const inScope = new Set((input.inScopeDocumentIds ?? []).map(normalizeSanityPublishedDocumentId));
  for (const row of rows) {
    if (inScope.size > 0 && inScope.has(row.documentId)) {
      continue;
    }
    await input.client
      .update(schema.sanityDocumentSyncStates)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(schema.sanityDocumentSyncStates.id, row.id));
  }
}

async function upsertSanitySyncState(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentType: string;
  documentId: string;
  i18nMode: "document" | "field";
  sourcePath: string;
  sourceLocale: string;
  contentHash: string;
  sourceUpdatedAt: Date | null;
  status: "active" | "import_failed";
  lastError: SanityJsonObject | null;
  importedTranslationHashes: Record<string, string>;
  translatedDocumentIds?: Record<string, string>;
  lastImportedAt?: Date | null;
  client: DatabaseTransaction;
}) {
  const publishedId = normalizeSanityPublishedDocumentId(input.documentId);
  await input.client
    .insert(schema.sanityDocumentSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      projectId: input.projectId,
      sanityProjectId: input.sanityProjectId,
      dataset: input.dataset,
      documentType: input.documentType,
      documentId: publishedId,
      i18nMode: input.i18nMode,
      sourcePath: input.sourcePath,
      sourceLocale: input.sourceLocale,
      sourceContentHash: input.contentHash,
      sourceUpdatedAt: input.sourceUpdatedAt,
      status: input.status,
      lastError: input.lastError,
      importedTranslationHashes: input.importedTranslationHashes,
      translatedDocumentIds: input.translatedDocumentIds ?? {},
      lastImportedAt: input.lastImportedAt ?? null,
    })
    .onConflictDoUpdate({
      target: [
        schema.sanityDocumentSyncStates.organizationId,
        schema.sanityDocumentSyncStates.automationId,
        schema.sanityDocumentSyncStates.documentId,
      ],
      set: {
        sourcePath: input.sourcePath,
        sourceContentHash: input.contentHash,
        sourceUpdatedAt: input.sourceUpdatedAt,
        status: input.status,
        lastError: input.lastError,
        importedTranslationHashes: input.importedTranslationHashes,
        translatedDocumentIds: input.translatedDocumentIds ?? {},
        lastImportedAt: input.lastImportedAt ?? null,
        updatedAt: new Date(),
      },
    });
}

async function collectTargetMaps(input: {
  client: ReturnType<typeof createSanityClient>;
  document: SanityDocumentRecord;
  publishedId: string;
  i18nMode: "document" | "field";
  sanityTargetLocales: readonly string[];
}): Promise<Record<string, SanityTranslationMap>> {
  const maps: Record<string, SanityTranslationMap> = {};
  if (input.i18nMode === "field") {
    for (const locale of input.sanityTargetLocales) {
      const map = extractSanityTargetLocaleMap({
        document: input.document,
        i18nMode: "field",
        targetSanityLocale: locale,
      });
      if (Object.keys(map).length > 0) {
        maps[locale] = map;
      }
    }
    return maps;
  }

  const links = await fetchSanityTranslationMetadataLinks(input.client, input.publishedId);
  for (const link of links) {
    if (!input.sanityTargetLocales.includes(link.sanityLocale)) {
      continue;
    }
    const targetDoc = await fetchSanityDocumentById(input.client, link.documentRef);
    if (!targetDoc) {
      continue;
    }
    const map = extractSanityDocumentSourceMap({
      document: targetDoc,
      i18nMode: "document",
      sourceSanityLocale: link.sanityLocale,
    });
    if (Object.keys(map).length > 0) {
      maps[link.sanityLocale] = map;
    }
  }
  return maps;
}

export async function runImportSanityDocuments(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string | null;
}): Promise<ImportSanityDocumentsResult> {
  const { sanity, projectId, sanityProjectId, dataset, documentTypes } = readSanityConfig(
    input.automation,
  );
  const importScopeKey = buildSanityImportScopeKey({
    nativeProjectId: projectId,
    sanityProjectId,
    dataset,
    documentTypes,
  });

  const writeIfCurrent = <T>(write: (tx: DatabaseTransaction) => Promise<T>) =>
    withCurrentSanityAutomationConfig(
      {
        organizationId: input.organizationId,
        automationId: input.automation.id,
        configVersion: input.automation.configVersion,
        scopeKey: importScopeKey,
        staleErrorCode: SANITY_IMPORT_STALE_CONFIG,
      },
      write,
    );

  await assertLiveSanityAutomationConfigVersion(db, {
    organizationId: input.organizationId,
    automationId: input.automation.id,
    configVersion: input.automation.configVersion,
    scopeKey: importScopeKey,
    staleErrorCode: SANITY_IMPORT_STALE_CONFIG,
  });

  const tokenResult = await loadSanityPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: sanity.workosUserId!,
  });
  if (isErr(tokenResult)) {
    throw new Error(tokenResult.error.code);
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project || project.source !== "native") {
    throw new Error("sanity_native_project_required");
  }

  const client = createSanityClient({
    token: tokenResult.value,
    projectId: sanityProjectId,
    dataset,
    includeDrafts: sanity.includeDrafts,
  });

  const sanityLanguages =
    sanity.languages.length > 0
      ? sanity.languages
      : sanity.targetLocales.concat(sanity.sourceLocale);
  const localeMapping = mapProjectLocalesToSanity({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    intercomLocales: sanityLanguages,
    configuredSourceLocale: sanity.sourceLocale,
    configuredTargetLocales: sanity.targetLocales.length > 0 ? sanity.targetLocales : undefined,
  });
  if (!localeMapping.sourceIntercomLocale) {
    throw new Error("sanity_source_locale_mismatch");
  }
  const sourceSanityLocale = localeMapping.sourceIntercomLocale;

  const [cursorRow] = await db
    .select()
    .from(schema.sanitySyncCursors)
    .where(eq(schema.sanitySyncCursors.automationId, input.automation.id))
    .limit(1);

  const storedScopeKey = readSanityImportScopeCursor(cursorRow?.listCursor);
  const importScopeChanged = storedScopeKey !== importScopeKey;
  if (importScopeChanged) {
    await writeIfCurrent((tx) =>
      archiveOutOfScopeSanityMappings({
        organizationId: input.organizationId,
        automationId: input.automation.id,
        projectId,
        sanityProjectId,
        dataset,
        client: tx,
      }),
    );
  }

  const needsReconcile =
    importScopeChanged ||
    !cursorRow?.lastReconcileAt ||
    Date.now() - cursorRow.lastReconcileAt.getTime() > RECONCILE_INTERVAL_MS;

  const watermarkIso =
    needsReconcile || !cursorRow?.watermarkUpdatedAt
      ? null
      : cursorRow.watermarkUpdatedAt.toISOString();

  const listed = await listSanityDocumentsForImport({
    client,
    documentTypes,
    watermarkIso,
    includeDrafts: sanity.includeDrafts,
  });

  if (needsReconcile) {
    await writeIfCurrent((tx) =>
      archiveOutOfScopeSanityMappings({
        organizationId: input.organizationId,
        automationId: input.automation.id,
        projectId,
        sanityProjectId,
        dataset,
        inScopeDocumentIds: listed.map((doc) => String(doc._id)),
        client: tx,
      }),
    );
  }

  let openJobs = await loadOpenSanityFileTranslationJobs({
    organizationId: input.organizationId,
    projectId,
  });

  const result: ImportSanityDocumentsResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    jobIds: [],
    translationsImported: 0,
    translationsSkipped: 0,
    translationsFailed: 0,
  };

  let maxWatermark = cursorRow?.watermarkUpdatedAt ?? null;

  const detectedByType = new Map<string, Awaited<ReturnType<typeof detectSanityDocumentTypes>>>();

  const loadDetectedForType = async (typeName: string) => {
    const cached = detectedByType.get(typeName);
    if (cached) {
      return cached;
    }
    const detected = await detectSanityDocumentTypes({
      client,
      typeNames: [typeName],
      localeCatalog: sanity.localeCatalog,
    });
    detectedByType.set(typeName, detected);
    return detected;
  };

  const languagesForDocumentType = (
    typeName: string,
    detected: Awaited<ReturnType<typeof detectSanityDocumentTypes>>,
  ): string[] => {
    const configured = sanity.languagesByType?.[typeName];
    if (configured && configured.length > 0) {
      return configured;
    }
    return detected.types.find((type) => type.name === typeName)?.languages ?? sanityLanguages;
  };

  await mapWithConcurrency(listed, SANITY_DOCUMENT_IMPORT_CONCURRENCY, async (rawDoc) => {
    try {
      const documentType = String(rawDoc._type);
      const publishedId = normalizeSanityPublishedDocumentId(String(rawDoc._id));
      const typeModeOverride = sanity.documentTypeModes?.[documentType];
      const detected = await loadDetectedForType(documentType);
      let detectedMode: "document" | "field" | "none" = typeModeOverride ?? "none";
      if (!typeModeOverride) {
        const remoteMode = detected.types[0]?.i18nMode ?? "none";
        detectedMode = remoteMode;
      }
      const i18nMode = resolveSanityDocumentI18nMode({
        typeName: documentType,
        detectedMode,
        override: typeModeOverride ?? null,
      });
      if (!isSanityDocumentTypeLocalizable(i18nMode)) {
        result.skipped += 1;
        return;
      }

      const fullDoc = (await fetchSanityDocumentById(client, String(rawDoc._id))) ?? rawDoc;
      if (i18nMode === "document") {
        const docLanguage =
          typeof fullDoc.language === "string" ? fullDoc.language : sanity.sourceLocale;
        const typeLanguages = languagesForDocumentType(documentType, detected);
        const resolved = resolveSanityLocaleKey(docLanguage, typeLanguages);
        if (resolved !== sourceSanityLocale) {
          result.skipped += 1;
          return;
        }
      }

      const sourceMap = extractSanityDocumentSourceMap({
        document: fullDoc,
        i18nMode,
        sourceSanityLocale,
      });
      if (Object.keys(sourceMap).length === 0) {
        result.skipped += 1;
        return;
      }

      const contentHash = hashSanityTranslationMap(sourceMap);
      const sourcePath = buildSanityDocumentSourcePath({
        sanityProjectId,
        dataset,
        documentType,
        documentId: publishedId,
        slug: readSanityDocumentSlug(fullDoc),
      });

      const [existing] = await db
        .select()
        .from(schema.sanityDocumentSyncStates)
        .where(
          and(
            eq(schema.sanityDocumentSyncStates.organizationId, input.organizationId),
            eq(schema.sanityDocumentSyncStates.automationId, input.automation.id),
            eq(schema.sanityDocumentSyncStates.documentId, publishedId),
          ),
        )
        .limit(1);

      const sourceContentUnchanged =
        existing?.sourceContentHash === contentHash && existing.sourcePath === sourcePath;
      const sourceUnchanged = sourceContentUnchanged && existing?.status === "active";

      let sourceFileId: string | null = null;
      const latestVersion = await getLatestRepositorySourceFileVersion({
        organizationId: input.organizationId,
        projectId,
        sourcePath,
      });
      const sourceIngestAction = resolveSanitySourceIngestAction({
        sourceContentUnchanged,
        latestIngestState: latestVersion?.ingestState,
      });

      if (sourceIngestAction === "reuse") {
        sourceFileId = latestVersion?.storedFileId ?? null;
      } else if (sourceIngestAction === "wait" && latestVersion) {
        sourceFileId = latestVersion.storedFileId ?? null;
        const ingestOutcome = await waitForSourceFileVersionIngest({
          organizationId: input.organizationId,
          sourceFileVersionId: latestVersion.id,
        });
        if (ingestOutcome !== "ingested") {
          await writeIfCurrent((tx) =>
            upsertSanitySyncState({
              organizationId: input.organizationId,
              automationId: input.automation.id,
              projectId,
              sanityProjectId,
              dataset,
              documentType,
              documentId: publishedId,
              i18nMode,
              sourcePath,
              sourceLocale: sourceSanityLocale,
              contentHash,
              sourceUpdatedAt: rawDoc._updatedAt ? new Date(rawDoc._updatedAt) : null,
              status: "import_failed",
              lastError: { ingestOutcome },
              importedTranslationHashes: existing?.importedTranslationHashes ?? {},
              client: tx,
            }),
          );
          result.failed += 1;
          return;
        }
      } else {
        const jsonBytes = Buffer.from(serializeSanityTranslationMap(sourceMap), "utf8");
        const upload = await uploadSourceFile({
          organizationId: input.organizationId,
          project,
          sourcePath,
          sourceHash: contentHash,
          workflowRunId: input.workflowRunId ?? null,
          uploadSurface: "sanity_automation",
          file: {
            filename: sourcePath.slice(sourcePath.lastIndexOf("/") + 1),
            contentType: "application/json",
            content: jsonBytes,
          },
        });
        if (!upload.ok || upload.value.destination !== "native") {
          result.failed += 1;
          return;
        }
        sourceFileId = upload.value.file.id;
        const ingestOutcome = await waitForSourceFileVersionIngest({
          organizationId: input.organizationId,
          sourceFileVersionId: upload.value.file.sourceFileVersionId,
        });
        if (ingestOutcome !== "ingested") {
          result.failed += 1;
          return;
        }
      }

      if (!sourceFileId) {
        sourceFileId =
          (
            await getLatestRepositorySourceFileVersion({
              organizationId: input.organizationId,
              projectId,
              sourcePath,
            })
          )?.storedFileId ?? null;
      }

      const targetMaps = await collectTargetMaps({
        client,
        document: fullDoc,
        publishedId,
        i18nMode,
        sanityTargetLocales: localeMapping.intercomTargetLocales,
      });

      const translationResult = await importSanityTargetTranslations({
        organizationId: input.organizationId,
        projectId,
        sourcePath,
        localeMapping,
        targetMapsBySanityLocale: targetMaps,
        policy: sanity.existingTranslationPolicy ?? DEFAULT_SANITY_EXISTING_TRANSLATION_POLICY,
        storedImportedHashes: existing?.importedTranslationHashes ?? {},
      });

      result.translationsImported += translationResult.importedLocales.length;
      result.translationsSkipped += translationResult.skippedLocales.length;
      result.translationsFailed += translationResult.failedLocales.length;

      const translatedDocumentIds: Record<string, string> = {
        ...existing?.translatedDocumentIds,
      };
      if (i18nMode === "document") {
        const links = await fetchSanityTranslationMetadataLinks(client, publishedId);
        for (const link of links) {
          translatedDocumentIds[link.sanityLocale] = link.documentRef;
        }
      }

      if (!sourceUnchanged || translationResult.importedLocales.length > 0) {
        await writeIfCurrent((tx) =>
          upsertSanitySyncState({
            organizationId: input.organizationId,
            automationId: input.automation.id,
            projectId,
            sanityProjectId,
            dataset,
            documentType,
            documentId: publishedId,
            i18nMode,
            sourcePath,
            sourceLocale: sourceSanityLocale,
            contentHash,
            sourceUpdatedAt: rawDoc._updatedAt ? new Date(rawDoc._updatedAt) : null,
            status: "active",
            lastError: null,
            importedTranslationHashes: translationResult.importedTranslationHashes,
            translatedDocumentIds,
            lastImportedAt: new Date(),
            client: tx,
          }),
        );
      }

      const createJobConfig = input.automation.toolConfig.createNativeTmsJob;
      const jobTargetLocales = resolveSanityImportJobTargetLocales({
        createJobEnabled: Boolean(createJobConfig?.enabled),
        useProjectTargetLocales: createJobConfig?.useProjectTargetLocales ?? true,
        configuredTargetLocales: createJobConfig?.targetLocales ?? [],
        mappedJobTargetLocales: localeMapping.jobTargetLocales,
        importedProjectLocales: translationResult.importedLocales,
        pushReadyProjectLocales: translationResult.pushReadyLocales,
        sourceUnchanged: sourceContentUnchanged,
        sourceFileId,
        openJobs,
      });

      if (sourceFileId && jobTargetLocales.length > 0) {
        const jobResult = await createFileTranslationJob({
          organizationId: input.organizationId,
          projectId,
          sourceFileId,
          sourceLocale: project.sourceLocale?.trim() || "en",
          targetLocales: jobTargetLocales,
        });
        if (jobResult.ok) {
          result.jobsCreated += 1;
          result.jobIds.push(jobResult.jobId);
          openJobs.push({ sourceFileId, targetLocales: jobTargetLocales });
          if (input.automation.toolConfig.assignTranslateWithAgent?.enabled) {
            const enqueueResult = await enqueueExistingFileTranslationJob({
              organizationId: input.organizationId,
              jobId: jobResult.jobId,
              jobQueue,
            });
            if (!enqueueResult.ok) {
              logger.warn({ jobId: jobResult.jobId }, "sanity_enqueue_job_failed");
            }
          }
        }
      }

      if (sourceUnchanged && translationResult.importedLocales.length === 0) {
        result.skipped += 1;
      } else {
        result.imported += 1;
      }

      if (rawDoc._updatedAt) {
        const updated = new Date(rawDoc._updatedAt);
        if (!maxWatermark || updated > maxWatermark) {
          maxWatermark = updated;
        }
      }
    } catch (error) {
      if (typeof error === "object" && error !== null && isSanitySyncStaleConfigError(error)) {
        throw error;
      }
      logger.warn({ error, documentId: rawDoc._id }, "sanity_document_import_failed");
      result.failed += 1;
    }
  });

  await writeIfCurrent(async (tx) => {
    await tx
      .insert(schema.sanitySyncCursors)
      .values({
        automationId: input.automation.id,
        organizationId: input.organizationId,
        watermarkUpdatedAt: maxWatermark,
        listCursor: encodeSanityImportScopeCursor(importScopeKey),
        lastReconcileAt: needsReconcile ? new Date() : (cursorRow?.lastReconcileAt ?? null),
      })
      .onConflictDoUpdate({
        target: schema.sanitySyncCursors.automationId,
        set: {
          watermarkUpdatedAt: maxWatermark,
          listCursor: encodeSanityImportScopeCursor(importScopeKey),
          lastReconcileAt: needsReconcile ? new Date() : (cursorRow?.lastReconcileAt ?? null),
          updatedAt: new Date(),
        },
      });
  });

  return result;
}
