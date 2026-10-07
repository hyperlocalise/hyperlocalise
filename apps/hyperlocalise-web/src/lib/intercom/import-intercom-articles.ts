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
  buildIntercomArticleSourcePath,
  hashIntercomArticleContent,
  serializeIntercomArticleJson,
} from "./article-json";
import {
  createIntercomArticlesClient,
  intercomArticleToImportPayload,
  listIntercomArticlesSince,
} from "./articles-api";
import { mapProjectLocalesToIntercom } from "./intercom-locale";
import { loadIntercomPipesAccessToken } from "./pipes";
import { waitForSourceFileVersionIngest } from "./wait-for-source-file-ingest";

const logger = createLogger("import-intercom-articles");
const ARTICLE_IMPORT_CONCURRENCY = 3;
const RECONCILE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const jobQueue = createTranslationJobEventQueue();

export type ImportIntercomArticlesResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
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

  const [cursorRow] = await db
    .select()
    .from(schema.intercomSyncCursors)
    .where(eq(schema.intercomSyncCursors.automationId, input.automation.id))
    .limit(1);

  const watermarkUpdatedAt = cursorRow?.watermarkUpdatedAt
    ? Math.floor(cursorRow.watermarkUpdatedAt.getTime() / 1000)
    : null;

  const needsReconcile =
    !cursorRow?.lastReconcileAt ||
    Date.now() - cursorRow.lastReconcileAt.getTime() > RECONCILE_INTERVAL_MS;

  const articles = await listIntercomArticlesSince({
    client,
    watermarkUpdatedAt: needsReconcile ? null : watermarkUpdatedAt,
    includeDrafts: intercom.includeDrafts,
    helpCenterId,
    collectionIds: intercom.collectionIds,
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

  if (!localeMapping.sourceIntercomLocale) {
    throw new Error("intercom_source_locale_unmapped");
  }

  const perArticleResults = await mapWithConcurrency(
    articles,
    ARTICLE_IMPORT_CONCURRENCY,
    async (article) => {
      const payload = intercomArticleToImportPayload(article);
      const contentHash = hashIntercomArticleContent(payload);
      const sourcePath = buildIntercomArticleSourcePath({
        helpCenterId,
        articleId: article.id,
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

      if (existing?.sourceContentHash === contentHash && existing.status === "active") {
        return { outcome: "skipped" as const };
      }

      try {
        const jsonBytes = Buffer.from(serializeIntercomArticleJson(payload), "utf8");
        const upload = await uploadSourceFile({
          organizationId: input.organizationId,
          project,
          sourcePath,
          sourceHash: contentHash,
          workflowRunId: input.workflowRunId ?? null,
          uploadSurface: "intercom_automation",
          file: {
            filename: `${article.id}.json`,
            contentType: "application/json",
            content: jsonBytes,
          },
        });

        if (upload.ok && upload.value.destination !== "native") {
          throw new Error("intercom_external_tms_not_supported");
        }

        const nativeUpload = upload.ok ? upload.value : null;
        if (!nativeUpload || nativeUpload.destination !== "native") {
          throw new Error("intercom_upload_failed");
        }

        const ingestOutcome = await waitForSourceFileVersionIngest({
          organizationId: input.organizationId,
          sourceFileVersionId: nativeUpload.file.sourceFileVersionId,
        });

        if (ingestOutcome !== "ingested") {
          await upsertSyncState({
            organizationId: input.organizationId,
            automationId: input.automation.id,
            projectId,
            helpCenterId,
            article,
            sourcePath,
            contentHash,
            sourceLocale: localeMapping.sourceIntercomLocale!,
            status: "import_failed",
            lastError: { ingestOutcome },
          });
          return { outcome: "failed" as const };
        }

        await upsertSyncState({
          organizationId: input.organizationId,
          automationId: input.automation.id,
          projectId,
          helpCenterId,
          article,
          sourcePath,
          contentHash,
          sourceLocale: localeMapping.sourceIntercomLocale!,
          status: "active",
          lastError: null,
          lastImportedAt: new Date(),
        });

        let jobId: string | null = null;
        const createJobConfig = input.automation.toolConfig.createNativeTmsJob;
        if (createJobConfig?.enabled && localeMapping.jobTargetLocales.length > 0) {
          const jobTargetLocales = createJobConfig.useProjectTargetLocales
            ? localeMapping.jobTargetLocales
            : createJobConfig.targetLocales.filter((locale) =>
                localeMapping.jobTargetLocales.includes(locale),
              );

          if (jobTargetLocales.length > 0) {
            const jobResult = await createFileTranslationJob({
              organizationId: input.organizationId,
              projectId,
              sourceFileId: nativeUpload.file.id,
              sourceLocale: project.sourceLocale?.trim() || "en",
              targetLocales: jobTargetLocales,
            });

            if (jobResult.ok) {
              jobId = jobResult.jobId;

              if (input.automation.toolConfig.assignTranslateWithAgent?.enabled) {
                await enqueueExistingFileTranslationJob({
                  organizationId: input.organizationId,
                  jobId: jobResult.jobId,
                  jobQueue,
                });
              }
            }
          }
        }

        return { outcome: "imported" as const, jobId };
      } catch (error) {
        logger.warn(
          {
            automationId: input.automation.id,
            articleId: article.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "intercom article import failed",
        );
        await upsertSyncState({
          organizationId: input.organizationId,
          automationId: input.automation.id,
          projectId,
          helpCenterId,
          article,
          sourcePath,
          contentHash,
          sourceLocale: localeMapping.sourceIntercomLocale!,
          status: "import_failed",
          lastError: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
        return { outcome: "failed" as const };
      }
    },
  );

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let jobsCreated = 0;
  const jobIds: string[] = [];

  for (const result of perArticleResults) {
    if (!result) {
      continue;
    }
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

  const maxUpdatedAt = articles.reduce<number | null>((max, article) => {
    if (article.updatedAt == null) {
      return max;
    }
    return max == null ? article.updatedAt : Math.max(max, article.updatedAt);
  }, watermarkUpdatedAt);

  if (maxUpdatedAt != null || needsReconcile) {
    const watermark =
      maxUpdatedAt != null
        ? new Date(maxUpdatedAt * 1000)
        : (cursorRow?.watermarkUpdatedAt ?? null);
    await db
      .insert(schema.intercomSyncCursors)
      .values({
        automationId: input.automation.id,
        organizationId: input.organizationId,
        watermarkUpdatedAt: watermark,
        ...(needsReconcile ? { lastReconcileAt: new Date() } : {}),
      })
      .onConflictDoUpdate({
        target: schema.intercomSyncCursors.automationId,
        set: {
          ...(watermark ? { watermarkUpdatedAt: watermark } : {}),
          ...(needsReconcile ? { lastReconcileAt: new Date() } : {}),
          updatedAt: new Date(),
        },
      });
  }

  return { imported, skipped, failed, jobsCreated, jobIds };
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
}) {
  await db
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
    })
    .onConflictDoUpdate({
      target: [
        schema.intercomArticleSyncStates.organizationId,
        schema.intercomArticleSyncStates.automationId,
        schema.intercomArticleSyncStates.articleId,
      ],
      set: {
        sourcePath: input.sourcePath,
        sourceContentHash: input.contentHash,
        sourceUpdatedAt:
          input.article.updatedAt != null ? new Date(input.article.updatedAt * 1000) : null,
        status: input.status,
        lastError: input.lastError,
        lastImportedAt: input.lastImportedAt ?? undefined,
        updatedAt: new Date(),
      },
    });
}
