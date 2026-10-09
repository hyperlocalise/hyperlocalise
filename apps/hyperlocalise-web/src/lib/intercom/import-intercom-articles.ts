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
import { and, eq, inArray, ne, notInArray, or } from "drizzle-orm";

import { db, schema } from "@/lib/database/client";
import type { DatabaseClient, DatabaseTransaction } from "@/lib/database/client";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import {
  assignIntercomArticleSourcePaths,
  buildIntercomArticleSourcePath,
  hashIntercomArticleContent,
  serializeIntercomArticleMarkdown,
} from "./article-markdown";
import {
  createIntercomArticlesClient,
  getIntercomArticle,
  intercomArticleToImportPayload,
  listIntercomArticlesSince,
  listIntercomHelpCenters,
  loadIntercomArticleForImport,
} from "./articles-api";
import { DEFAULT_INTERCOM_EXISTING_TRANSLATION_POLICY } from "./intercom-existing-translation-policy";
import {
  importIntercomTargetTranslations,
  remainingIntercomJobTargetLocales,
} from "./import-intercom-target-translations";
import { mapProjectLocalesToIntercom } from "./intercom-locale";
import {
  assertLiveIntercomAutomationConfigVersion,
  withCurrentIntercomAutomationConfig,
} from "./intercom-sync-current";
import {
  INTERCOM_IMPORT_STALE_CONFIG,
  buildIntercomImportScopeKey,
  encodeIntercomImportScopeCursor,
  isIntercomSyncStaleConfigError,
  readIntercomImportScopeCursor,
} from "./intercom-sync-scope";
import { loadIntercomPipesAccessToken } from "./pipes";
import { waitForSourceFileVersionIngest } from "./wait-for-source-file-ingest";

const logger = createLogger("import-intercom-articles");
const ARTICLE_IMPORT_CONCURRENCY = 3;
const RECONCILE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const jobQueue = createTranslationJobEventQueue();

export function intercomArticleImportOutcome(input: {
  sourceUnchanged: boolean;
  translationsImported: number;
  translationsFailed: number;
}): "imported" | "skipped" {
  if (input.sourceUnchanged && input.translationsImported === 0 && input.translationsFailed === 0) {
    return "skipped";
  }
  return "imported";
}

export type ImportIntercomArticlesResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
  translationsImported: number;
  translationsSkipped: number;
  translationsFailed: number;
};

function readIntercomConfig(automation: WorkspaceAutomationRecord) {
  const intercom = automation.toolConfig.intercom;
  if (!intercom?.enabled || !intercom.workosUserId) {
    throw new Error("intercom_not_configured");
  }
  const projectId = automation.projectId?.trim();
  if (!projectId) {
    throw new Error("intercom_project_required");
  }
  const helpCenterId = intercom.helpCenterId?.trim();
  if (!helpCenterId) {
    throw new Error("intercom_help_center_required");
  }
  return { intercom, projectId, helpCenterId };
}

export async function runImportIntercomArticles(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string | null;
}): Promise<ImportIntercomArticlesResult> {
  const { intercom, projectId, helpCenterId } = readIntercomConfig(input.automation);
  const importScopeKey = buildIntercomImportScopeKey({
    projectId,
    helpCenterId,
    collectionIds: intercom.collectionIds,
  });
  const writeIfCurrent = <T>(write: (tx: DatabaseTransaction) => Promise<T>) =>
    withCurrentIntercomAutomationConfig(
      {
        organizationId: input.organizationId,
        automationId: input.automation.id,
        configVersion: input.automation.configVersion,
        scopeKey: importScopeKey,
        staleErrorCode: INTERCOM_IMPORT_STALE_CONFIG,
      },
      write,
    );

  await assertLiveIntercomAutomationConfigVersion(db, {
    organizationId: input.organizationId,
    automationId: input.automation.id,
    configVersion: input.automation.configVersion,
    scopeKey: importScopeKey,
    staleErrorCode: INTERCOM_IMPORT_STALE_CONFIG,
  });

  const tokenResult = await loadIntercomPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: intercom.workosUserId!,
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
    throw new Error("intercom_native_project_required");
  }

  const client = createIntercomArticlesClient({
    accessToken: tokenResult.value,
    restEndpoint: intercom.restEndpoint,
  });
  let helpCenterName: string | null = null;
  try {
    const helpCenters = await listIntercomHelpCenters(client);
    helpCenterName =
      helpCenters.find((center) => String(center.id) === String(helpCenterId))?.displayName ?? null;
  } catch {
    helpCenterName = null;
  }

  const [cursorRow] = await db
    .select()
    .from(schema.intercomSyncCursors)
    .where(eq(schema.intercomSyncCursors.automationId, input.automation.id))
    .limit(1);

  const storedScopeKey = readIntercomImportScopeCursor(cursorRow?.listCursor);
  const importScopeChanged = storedScopeKey !== importScopeKey;

  if (importScopeChanged) {
    await writeIfCurrent((tx) =>
      archiveOutOfScopeMappings({
        organizationId: input.organizationId,
        automationId: input.automation.id,
        projectId,
        helpCenterId,
        client: tx,
      }),
    );
  }

  const watermarkUpdatedAt =
    importScopeChanged || !cursorRow?.watermarkUpdatedAt
      ? null
      : Math.floor(cursorRow.watermarkUpdatedAt.getTime() / 1000);

  const needsReconcile =
    importScopeChanged ||
    !cursorRow?.lastReconcileAt ||
    Date.now() - cursorRow.lastReconcileAt.getTime() > RECONCILE_INTERVAL_MS;

  const listedArticles = await listIntercomArticlesSince({
    client,
    watermarkUpdatedAt: needsReconcile ? null : watermarkUpdatedAt,
    includeDrafts: intercom.includeDrafts,
    helpCenterId,
    collectionIds: intercom.collectionIds,
  });
  if (needsReconcile) {
    await writeIfCurrent((tx) =>
      archiveOutOfScopeMappings({
        organizationId: input.organizationId,
        automationId: input.automation.id,
        projectId,
        helpCenterId,
        inScopeArticleIds: listedArticles.map((article) => article.id),
        client: tx,
      }),
    );
  }
  const failedMappings = await db
    .select({
      articleId: schema.intercomArticleSyncStates.articleId,
    })
    .from(schema.intercomArticleSyncStates)
    .where(
      and(
        eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
        eq(schema.intercomArticleSyncStates.automationId, input.automation.id),
        eq(schema.intercomArticleSyncStates.projectId, projectId),
        eq(schema.intercomArticleSyncStates.helpCenterId, helpCenterId),
        inArray(schema.intercomArticleSyncStates.status, ["import_failed"]),
      ),
    );
  const articlesById = new Map(listedArticles.map((article) => [article.id, article]));
  for (const mapping of failedMappings) {
    if (articlesById.has(mapping.articleId)) {
      continue;
    }
    try {
      const article = await getIntercomArticle(client, mapping.articleId);
      if (article) {
        articlesById.set(article.id, article);
      }
    } catch (error) {
      logger.warn(
        {
          automationId: input.automation.id,
          articleId: mapping.articleId,
          error: error instanceof Error ? error.message : String(error),
        },
        "intercom failed-article retry read failed",
      );
    }
  }
  const articles = [...articlesById.values()];
  const existingMappings = await db
    .select({
      articleId: schema.intercomArticleSyncStates.articleId,
      sourcePath: schema.intercomArticleSyncStates.sourcePath,
      status: schema.intercomArticleSyncStates.status,
      helpCenterId: schema.intercomArticleSyncStates.helpCenterId,
    })
    .from(schema.intercomArticleSyncStates)
    .where(
      and(
        eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
        eq(schema.intercomArticleSyncStates.projectId, projectId),
      ),
    );
  const sourcePathByArticleId = assignIntercomArticleSourcePaths({
    helpCenterId,
    helpCenterName,
    articles,
    existingMappings,
  });

  const helpCenterLocales =
    intercom.helpCenterLocales.length > 0 ? intercom.helpCenterLocales : intercom.targetLocales;

  const localeMapping = mapProjectLocalesToIntercom({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    intercomLocales: helpCenterLocales,
    configuredSourceLocale: intercom.sourceLocale,
    configuredTargetLocales: intercom.targetLocales.length > 0 ? intercom.targetLocales : undefined,
  });

  const sourceIntercomLocale = localeMapping.sourceIntercomLocale;
  if (!sourceIntercomLocale) {
    throw new Error("intercom_source_locale_unmapped");
  }

  const perArticleResults = await mapWithConcurrency(
    articles,
    ARTICLE_IMPORT_CONCURRENCY,
    async (article) => {
      const sourcePath =
        sourcePathByArticleId.get(article.id) ??
        buildIntercomArticleSourcePath({
          helpCenterId,
          articleId: article.id,
          helpCenterName,
          articleTitle: article.title,
        });

      const [existing] = await db
        .select()
        .from(schema.intercomArticleSyncStates)
        .where(
          and(
            eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
            eq(schema.intercomArticleSyncStates.automationId, input.automation.id),
            eq(schema.intercomArticleSyncStates.articleId, article.id),
          ),
        )
        .limit(1);

      try {
        const detailedArticle = await loadIntercomArticleForImport(client, article.id);
        const payload = intercomArticleToImportPayload(detailedArticle, sourceIntercomLocale);
        const contentHash = hashIntercomArticleContent(payload);
        const sourceUnchanged =
          existing?.sourceContentHash === contentHash &&
          existing.status === "active" &&
          existing.sourcePath === sourcePath;

        let sourceFileId: string | null = null;
        if (!sourceUnchanged) {
          const markdownBytes = Buffer.from(serializeIntercomArticleMarkdown(payload), "utf8");
          const upload = await uploadSourceFile({
            organizationId: input.organizationId,
            project,
            sourcePath,
            sourceHash: contentHash,
            workflowRunId: input.workflowRunId ?? null,
            uploadSurface: "intercom_automation",
            file: {
              filename: sourcePath.slice(sourcePath.lastIndexOf("/") + 1),
              contentType: "text/markdown",
              content: markdownBytes,
            },
          });

          if (upload.ok && upload.value.destination !== "native") {
            throw new Error("intercom_external_tms_not_supported");
          }

          const nativeUpload = upload.ok ? upload.value : null;
          if (!nativeUpload || nativeUpload.destination !== "native") {
            throw new Error("intercom_upload_failed");
          }
          sourceFileId = nativeUpload.file.id;

          const ingestOutcome = await waitForSourceFileVersionIngest({
            organizationId: input.organizationId,
            sourceFileVersionId: nativeUpload.file.sourceFileVersionId,
          });

          if (ingestOutcome !== "ingested") {
            await writeIfCurrent((tx) =>
              upsertSyncState({
                organizationId: input.organizationId,
                automationId: input.automation.id,
                projectId,
                helpCenterId,
                article,
                sourcePath,
                contentHash,
                sourceLocale: sourceIntercomLocale,
                status: "import_failed",
                lastError: { ingestOutcome },
                importedTranslationHashes: existing?.importedTranslationHashes ?? {},
                client: tx,
              }),
            );
            return {
              outcome: "failed" as const,
              articleId: article.id,
              updatedAt: article.updatedAt,
              translationsImported: 0,
              translationsSkipped: 0,
              translationsFailed: 0,
            };
          }
        }

        const translationResult = await importIntercomTargetTranslations({
          organizationId: input.organizationId,
          projectId,
          sourcePath,
          localeMapping,
          localeContent: detailedArticle.localeContent,
          policy:
            intercom.existingTranslationPolicy ?? DEFAULT_INTERCOM_EXISTING_TRANSLATION_POLICY,
          storedImportedHashes: existing?.importedTranslationHashes ?? {},
        });

        const didImportTranslations = translationResult.importedLocales.length > 0;
        if (!sourceUnchanged || didImportTranslations) {
          await writeIfCurrent((tx) =>
            upsertSyncState({
              organizationId: input.organizationId,
              automationId: input.automation.id,
              projectId,
              helpCenterId,
              article,
              sourcePath,
              contentHash,
              sourceLocale: sourceIntercomLocale,
              status: "active",
              lastError: null,
              lastImportedAt: new Date(),
              importedTranslationHashes: translationResult.importedTranslationHashes,
              client: tx,
            }),
          );
        }

        let jobId: string | null = null;
        const createJobConfig = input.automation.toolConfig.createNativeTmsJob;
        if (
          !sourceUnchanged &&
          sourceFileId &&
          createJobConfig?.enabled &&
          localeMapping.jobTargetLocales.length > 0
        ) {
          const configuredJobLocales = createJobConfig.useProjectTargetLocales
            ? localeMapping.jobTargetLocales
            : createJobConfig.targetLocales.filter((locale) =>
                localeMapping.jobTargetLocales.includes(locale),
              );
          const jobTargetLocales = remainingIntercomJobTargetLocales({
            jobTargetLocales: configuredJobLocales,
            importedProjectLocales: translationResult.importedLocales,
            pushReadyProjectLocales: translationResult.pushReadyLocales,
          });

          if (jobTargetLocales.length > 0) {
            const jobResult = await createFileTranslationJob({
              organizationId: input.organizationId,
              projectId,
              sourceFileId,
              sourceLocale: project.sourceLocale?.trim() || "en",
              targetLocales: jobTargetLocales,
            });

            if (!jobResult.ok) {
              throw new Error(jobResult.code);
            }

            jobId = jobResult.jobId;

            if (input.automation.toolConfig.assignTranslateWithAgent?.enabled) {
              const enqueueResult = await enqueueExistingFileTranslationJob({
                organizationId: input.organizationId,
                jobId: jobResult.jobId,
                jobQueue,
              });
              if (!enqueueResult.ok) {
                throw new Error(enqueueResult.code);
              }
            }
          }
        }

        return {
          outcome: intercomArticleImportOutcome({
            sourceUnchanged,
            translationsImported: translationResult.importedLocales.length,
            translationsFailed: translationResult.failedLocales.length,
          }),
          articleId: article.id,
          updatedAt: article.updatedAt,
          jobId,
          translationsImported: translationResult.importedLocales.length,
          translationsSkipped: translationResult.skippedLocales.length,
          translationsFailed: translationResult.failedLocales.length,
        };
      } catch (error) {
        if (isIntercomSyncStaleConfigError(error)) {
          throw error;
        }
        logger.warn(
          {
            automationId: input.automation.id,
            articleId: article.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "intercom article import failed",
        );
        await writeIfCurrent((tx) =>
          upsertSyncState({
            organizationId: input.organizationId,
            automationId: input.automation.id,
            projectId,
            helpCenterId,
            article,
            sourcePath,
            contentHash:
              existing?.sourceContentHash ??
              hashIntercomArticleContent({ title: "", description: "", body: "" }),
            sourceLocale: sourceIntercomLocale,
            status: "import_failed",
            lastError: {
              message: error instanceof Error ? error.message : String(error),
            },
            client: tx,
          }),
        );
        return {
          outcome: "failed" as const,
          articleId: article.id,
          updatedAt: article.updatedAt,
          translationsImported: 0,
          translationsSkipped: 0,
          translationsFailed: 0,
        };
      }
    },
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let jobsCreated = 0;
  let translationsImported = 0;
  let translationsSkipped = 0;
  let translationsFailed = 0;
  const jobIds: string[] = [];

  for (const result of perArticleResults) {
    if (!result) {
      continue;
    }
    translationsImported += result.translationsImported;
    translationsSkipped += result.translationsSkipped;
    translationsFailed += result.translationsFailed;
    if (result.outcome === "imported") {
      imported += 1;
      if (result.jobId) {
        jobsCreated += 1;
        jobIds.push(result.jobId);
      }
    } else if (result.outcome === "skipped") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  const handledUpdatedAt = perArticleResults.reduce<number | null>((max, result) => {
    if (!result || result.outcome === "failed" || result.updatedAt == null) {
      return max;
    }
    return max == null ? result.updatedAt : Math.max(max, result.updatedAt);
  }, watermarkUpdatedAt);

  const shouldRecordReconcile = needsReconcile && failed === 0;

  if (handledUpdatedAt != null || shouldRecordReconcile || importScopeChanged) {
    const watermark =
      handledUpdatedAt != null
        ? new Date(handledUpdatedAt * 1000)
        : importScopeChanged
          ? null
          : (cursorRow?.watermarkUpdatedAt ?? null);
    await writeIfCurrent((tx) =>
      tx
        .insert(schema.intercomSyncCursors)
        .values({
          automationId: input.automation.id,
          organizationId: input.organizationId,
          watermarkUpdatedAt: watermark,
          listCursor: encodeIntercomImportScopeCursor(importScopeKey),
          lastReconcileAt: shouldRecordReconcile ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: schema.intercomSyncCursors.automationId,
          set: {
            ...(importScopeChanged || watermark ? { watermarkUpdatedAt: watermark } : {}),
            listCursor: encodeIntercomImportScopeCursor(importScopeKey),
            ...(shouldRecordReconcile
              ? { lastReconcileAt: new Date() }
              : importScopeChanged
                ? { lastReconcileAt: null }
                : {}),
            updatedAt: new Date(),
          },
        }),
    );
  }

  return {
    imported,
    skipped,
    failed,
    jobsCreated,
    jobIds,
    translationsImported,
    translationsSkipped,
    translationsFailed,
  };
}

async function archiveOutOfScopeMappings(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  helpCenterId: string;
  inScopeArticleIds?: readonly string[];
  client: DatabaseClient;
}) {
  const scopeFilter = and(
    eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
    eq(schema.intercomArticleSyncStates.automationId, input.automationId),
    inArray(schema.intercomArticleSyncStates.status, ["active", "import_failed", "push_failed"]),
  );

  if (input.inScopeArticleIds && input.inScopeArticleIds.length === 0) {
    await input.client
      .update(schema.intercomArticleSyncStates)
      .set({
        status: "archived",
        updatedAt: new Date(),
      })
      .where(scopeFilter);
    return;
  }

  const targetMismatch = or(
    ne(schema.intercomArticleSyncStates.projectId, input.projectId),
    ne(schema.intercomArticleSyncStates.helpCenterId, input.helpCenterId),
  );
  const articleOutOfScope =
    input.inScopeArticleIds && input.inScopeArticleIds.length > 0
      ? notInArray(schema.intercomArticleSyncStates.articleId, [...input.inScopeArticleIds])
      : undefined;

  await input.client
    .update(schema.intercomArticleSyncStates)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(
      and(scopeFilter, articleOutOfScope ? or(targetMismatch, articleOutOfScope) : targetMismatch),
    );
}

async function upsertSyncState(input: {
  organizationId: string;
  automationId: string;
  projectId: string;
  helpCenterId: string;
  article: { id: string; updatedAt: number | null };
  sourcePath: string;
  contentHash: string;
  sourceLocale: string;
  status: "active" | "import_failed";
  lastError: Record<string, unknown> | null;
  lastImportedAt?: Date;
  importedTranslationHashes?: Record<string, string>;
  client: DatabaseClient;
}) {
  await input.client
    .insert(schema.intercomArticleSyncStates)
    .values({
      organizationId: input.organizationId,
      automationId: input.automationId,
      projectId: input.projectId,
      helpCenterId: input.helpCenterId,
      articleId: input.article.id,
      sourcePath: input.sourcePath,
      sourceLocale: input.sourceLocale,
      sourceContentHash: input.contentHash,
      sourceUpdatedAt:
        input.article.updatedAt != null ? new Date(input.article.updatedAt * 1000) : null,
      status: input.status,
      lastError: input.lastError,
      lastImportedAt: input.lastImportedAt ?? null,
      importedTranslationHashes: input.importedTranslationHashes ?? {},
    })
    .onConflictDoUpdate({
      target: [
        schema.intercomArticleSyncStates.organizationId,
        schema.intercomArticleSyncStates.automationId,
        schema.intercomArticleSyncStates.articleId,
      ],
      set: {
        projectId: input.projectId,
        helpCenterId: input.helpCenterId,
        sourcePath: input.sourcePath,
        sourceContentHash: input.contentHash,
        sourceUpdatedAt:
          input.article.updatedAt != null ? new Date(input.article.updatedAt * 1000) : null,
        status: input.status,
        lastError: input.lastError,
        lastImportedAt: input.lastImportedAt ?? undefined,
        importedTranslationHashes: input.importedTranslationHashes ?? undefined,
        updatedAt: new Date(),
      },
    });
}
