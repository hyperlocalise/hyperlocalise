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

import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
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

import { WebflowDataClient } from "./client";
import { WEBFLOW_IMPORT_CONCURRENCY } from "./constants";
import {
  buildWebflowItemSourcePath,
  hashWebflowTranslationMap,
  readWebflowItemSlug,
  serializeWebflowTranslationMap,
} from "./document-json";
import { extractWebflowFieldStrings, listTranslatableWebflowFields } from "./field-detector";
import { importWebflowTargetTranslation } from "./import-webflow-target-translations";
import { loadWebflowConnectionWithToken } from "./webflow-connection-access";
import {
  DEFAULT_WEBFLOW_EXISTING_TRANSLATION_POLICY,
  isWebflowExistingTranslationPolicy,
} from "./webflow-existing-translation-policy";
import { mapProjectLocalesToWebflow, type WebflowLocaleMappingTarget } from "./webflow-locale";

const logger = createLogger("import-webflow-items");
const jobQueue = createTranslationJobEventQueue();

export type ImportWebflowItemsResult = {
  imported: number;
  skipped: number;
  failed: number;
  jobsCreated: number;
  jobIds: string[];
  skippedTargets: Array<{ locale: string; reason: string }>;
  translationsImported: number;
  translationsSkipped: number;
  translationsFailed: number;
};

function parseItemUpdatedAt(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function nextWebflowImportWatermark(input: {
  previous: Date | null;
  succeededAt: Date[];
  failedAt: Date[];
  failedWithoutTimestamp: boolean;
  collectionFailed: boolean;
}): Date | null {
  if (input.failedWithoutTimestamp || input.collectionFailed) {
    return input.previous;
  }
  if (input.failedAt.length > 0) {
    // Items are listed oldest-first and filtered with `lastUpdated[gte]`, so
    // advancing past a failed item would skip it forever once a later item
    // succeeds. Hold the watermark at the earliest failure to retry it.
    const earliestFailure = input.failedAt.reduce((earliest, current) =>
      current.getTime() < earliest.getTime() ? current : earliest,
    );
    if (input.previous && earliestFailure.getTime() <= input.previous.getTime()) {
      return input.previous;
    }
    return earliestFailure;
  }
  const candidates = [...input.succeededAt];
  if (candidates.length === 0) {
    return input.previous;
  }
  const max = candidates.reduce((latest, current) =>
    current.getTime() > latest.getTime() ? current : latest,
  );
  if (input.previous && max.getTime() <= input.previous.getTime()) {
    return input.previous;
  }
  return max;
}

export async function runImportWebflowItems(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string;
}): Promise<ImportWebflowItemsResult> {
  const webflow = input.automation.toolConfig.webflow;
  const result: ImportWebflowItemsResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    jobsCreated: 0,
    jobIds: [],
    skippedTargets: [],
    translationsImported: 0,
    translationsSkipped: 0,
    translationsFailed: 0,
  };

  if (!webflow?.enabled || !webflow.connectionId) {
    throw new Error("import_webflow_items_not_configured");
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("import_webflow_items_project_required");
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, projectId),
      ),
    )
    .limit(1);

  if (!project || project.source !== "native") {
    throw new Error("import_webflow_items_project_required");
  }

  const loaded = await loadWebflowConnectionWithToken({
    organizationId: input.organizationId,
    connectionId: webflow.connectionId,
  });
  if (!loaded?.token) {
    throw new Error("webflow_not_connected");
  }

  const siteResult = await new WebflowDataClient({ accessToken: loaded.token }).getSite(
    webflow.siteId || loaded.connection.siteId,
  );
  if (isErr(siteResult)) {
    throw new Error(siteResult.error.message);
  }

  const localeMapping = mapProjectLocalesToWebflow({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    webflowLocales: siteResult.value.locales,
    configuredSourceLocale: webflow.sourceLocale,
    configuredTargetLocales: webflow.targetLocales,
  });

  if (!localeMapping.sourceCmsLocaleId) {
    throw new Error("webflow_source_locale_mismatch");
  }

  const existingTranslationPolicy = isWebflowExistingTranslationPolicy(
    webflow.existingTranslationPolicy,
  )
    ? webflow.existingTranslationPolicy
    : DEFAULT_WEBFLOW_EXISTING_TRANSLATION_POLICY;

  for (const target of localeMapping.targets) {
    if ("skippedReason" in target && target.skippedReason) {
      result.skippedTargets.push({
        locale: target.projectLocale,
        reason: target.skippedReason,
      });
    }
  }

  const [cursorRow] = await db
    .select()
    .from(schema.webflowSyncCursors)
    .where(eq(schema.webflowSyncCursors.automationId, input.automation.id))
    .limit(1);

  const watermarkIso = cursorRow?.watermarkUpdatedAt?.toISOString();

  const collectionIds =
    webflow.collectionIds.length > 0 ? webflow.collectionIds : loaded.connection.collectionIds;

  const client = new WebflowDataClient({ accessToken: loaded.token });
  const succeededUpdatedAt: Date[] = [];
  const failedUpdatedAt: Date[] = [];
  let failedWithoutTimestamp = false;
  // A collection that fails to load contributes no item timestamps, so the
  // watermark must not advance past its unseen items on this run.
  let collectionFailed = false;

  for (const collectionId of collectionIds) {
    const collectionResult = await client.getCollection(collectionId);
    if (isErr(collectionResult)) {
      logger.warn(
        { collectionId, error: collectionResult.error },
        "webflow_collection_load_failed",
      );
      collectionFailed = true;
      continue;
    }
    const translatableFields = listTranslatableWebflowFields(collectionResult.value);

    let offset = 0;
    let total = Number.POSITIVE_INFINITY;
    while (offset < total) {
      const listResult = await client.listCollectionItems({
        collectionId,
        cmsLocaleId: localeMapping.sourceCmsLocaleId,
        offset,
        lastUpdatedGte: watermarkIso,
        sortLastUpdatedAsc: true,
      });
      if (isErr(listResult)) {
        throw new Error(listResult.error.message);
      }
      total = listResult.value.pagination.total;
      offset += listResult.value.pagination.limit;

      await mapWithConcurrency(listResult.value.items, WEBFLOW_IMPORT_CONCURRENCY, async (item) => {
        try {
          const fieldStrings = extractWebflowFieldStrings({
            fields: translatableFields,
            fieldData: item.fieldData,
          });
          if (Object.keys(fieldStrings).length === 0) {
            result.skipped += 1;
            return;
          }

          const slug = readWebflowItemSlug(item.fieldData);
          const sourcePath = buildWebflowItemSourcePath({
            siteId: siteResult.value.id,
            collectionId,
            slug,
          });
          const contentHash = hashWebflowTranslationMap(fieldStrings);

          const [existingSync] = await db
            .select()
            .from(schema.webflowItemSyncStates)
            .where(
              and(
                eq(schema.webflowItemSyncStates.automationId, input.automation.id),
                eq(schema.webflowItemSyncStates.itemId, item.id),
              ),
            )
            .limit(1);

          const latestVersion = await getLatestRepositorySourceFileVersion({
            organizationId: input.organizationId,
            projectId,
            sourcePath,
          });
          const sourceUnchanged =
            existingSync?.sourceHash === contentHash &&
            latestVersion !== null &&
            existingSync !== undefined;

          if (sourceUnchanged) {
            result.skipped += 1;
            const updatedAt = parseItemUpdatedAt(item.lastUpdated);
            if (updatedAt) {
              succeededUpdatedAt.push(updatedAt);
            }
            return;
          }

          const uploadResult = await uploadSourceFile({
            organizationId: input.organizationId,
            project,
            sourcePath,
            sourceHash: contentHash,
            workflowRunId: input.workflowRunId ?? null,
            uploadSurface: "webflow_automation",
            file: {
              filename: sourcePath.slice(sourcePath.lastIndexOf("/") + 1),
              contentType: "application/json",
              content: Buffer.from(serializeWebflowTranslationMap(fieldStrings), "utf8"),
            },
          });
          if (!uploadResult.ok || uploadResult.value.destination !== "native") {
            throw new Error("webflow_source_upload_failed");
          }
          const sourceFileId = uploadResult.value.file.id;

          const ingestOutcome = await waitForSourceFileVersionIngest({
            organizationId: input.organizationId,
            sourceFileVersionId: uploadResult.value.file.sourceFileVersionId,
          });
          if (ingestOutcome !== "ingested") {
            throw new Error("webflow_source_ingest_failed");
          }

          // Seed translations that already exist in Webflow secondary
          // locales, honoring the automation's existing-translation policy.
          // Source keys exist now that ingest completed, so imported entries
          // match. Seeding never fails the item import itself.
          for (const target of localeMapping.targets) {
            if (!target.webflowLocale) {
              continue;
            }
            const variantResult = await client.getCollectionItem({
              collectionId,
              itemId: item.id,
              cmsLocaleId: target.webflowLocale.cmsLocaleId,
            });
            if (isErr(variantResult)) {
              if (variantResult.error.status === 404) {
                result.translationsSkipped += 1;
              } else {
                logger.warn(
                  { error: variantResult.error, itemId: item.id },
                  "webflow_target_variant_load_failed",
                );
                result.translationsFailed += 1;
              }
              continue;
            }
            const incomingEntries = extractWebflowFieldStrings({
              fields: translatableFields,
              fieldData: variantResult.value.fieldData,
            });
            if (Object.keys(incomingEntries).length === 0) {
              result.translationsSkipped += 1;
              continue;
            }
            const seed = await importWebflowTargetTranslation({
              organizationId: input.organizationId,
              projectId,
              sourcePath,
              targetLocale: target.projectLocale,
              incomingEntries,
              policy: existingTranslationPolicy,
            });
            if (seed.status === "imported") {
              result.translationsImported += 1;
            } else if (seed.status === "failed") {
              result.translationsFailed += 1;
            } else {
              result.translationsSkipped += 1;
            }
          }

          const jobTargetLocales = localeMapping.targets
            .filter((entry): entry is WebflowLocaleMappingTarget => entry.webflowLocale !== null)
            .map((entry) => entry.projectLocale);

          if (
            jobTargetLocales.length > 0 &&
            input.automation.toolConfig.createNativeTmsJob?.enabled
          ) {
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
            result.jobsCreated += 1;
            result.jobIds.push(jobResult.jobId);
            if (input.automation.toolConfig.assignTranslateWithAgent?.enabled) {
              await enqueueExistingFileTranslationJob({
                organizationId: input.organizationId,
                jobId: jobResult.jobId,
                jobQueue,
              });
            }
          }

          await db
            .insert(schema.webflowItemSyncStates)
            .values({
              organizationId: input.organizationId,
              automationId: input.automation.id,
              siteId: siteResult.value.id,
              collectionId,
              itemId: item.id,
              slug,
              sourceHash: contentHash,
              lastImportedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [
                schema.webflowItemSyncStates.automationId,
                schema.webflowItemSyncStates.itemId,
              ],
              set: {
                sourceHash: contentHash,
                slug,
                lastImportedAt: new Date(),
                updatedAt: new Date(),
              },
            });

          result.imported += 1;
          const updatedAt = parseItemUpdatedAt(item.lastUpdated);
          if (updatedAt) {
            succeededUpdatedAt.push(updatedAt);
          }
        } catch (error) {
          logger.warn({ error, itemId: item.id }, "webflow_item_import_failed");
          result.failed += 1;
          const updatedAt = parseItemUpdatedAt(item.lastUpdated);
          if (updatedAt) {
            failedUpdatedAt.push(updatedAt);
          } else {
            failedWithoutTimestamp = true;
          }
        }
      });
    }
  }

  const maxWatermark = nextWebflowImportWatermark({
    previous: cursorRow?.watermarkUpdatedAt ?? null,
    succeededAt: succeededUpdatedAt,
    failedAt: failedUpdatedAt,
    failedWithoutTimestamp,
    collectionFailed,
  });

  await db
    .insert(schema.webflowSyncCursors)
    .values({
      automationId: input.automation.id,
      organizationId: input.organizationId,
      watermarkUpdatedAt: maxWatermark,
      listCursor: collectionIds.join(","),
    })
    .onConflictDoUpdate({
      target: schema.webflowSyncCursors.automationId,
      set: {
        watermarkUpdatedAt: maxWatermark,
        listCursor: collectionIds.join(","),
        updatedAt: new Date(),
      },
    });

  return result;
}
