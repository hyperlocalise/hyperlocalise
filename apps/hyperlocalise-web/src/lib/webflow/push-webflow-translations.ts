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
import {
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { WebflowDataClient } from "./client";
import { WEBFLOW_PUSH_CONCURRENCY } from "./constants";
import {
  buildWebflowItemSourcePath,
  hashWebflowTranslationMap,
  parseWebflowTranslationMapJson,
  serializeWebflowTranslationMap,
} from "./document-json";
import { extractWebflowFieldStrings, listTranslatableWebflowFields } from "./field-detector";
import { loadWebflowConnectionWithToken } from "./webflow-connection-access";
import { mapProjectLocalesToWebflow } from "./webflow-locale";
import { validateSecondaryLocaleComponentWrite } from "./wf-component";

const logger = createLogger("push-webflow-translations");

export type PushWebflowTranslationsResult = {
  pushedLocales: number;
  failedLocales: number;
  skippedLocales: number;
  outcomes: Array<{
    itemId: string;
    locale: string;
    status: "translated" | "skipped" | "failed";
    reason?: string;
  }>;
};

export function readWebflowPushSourcePaths(
  inputSnapshot: object | null | undefined,
): string[] | undefined {
  if (!inputSnapshot || !("sourcePaths" in inputSnapshot)) {
    return undefined;
  }
  const raw = (inputSnapshot as { sourcePaths?: unknown }).sourcePaths;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

function selectWebflowPushSyncStates<
  T extends { siteId: string; collectionId: string; slug: string },
>(syncStates: T[], sourcePaths?: readonly string[]): T[] {
  if (!sourcePaths) {
    return syncStates;
  }
  const selected = new Set(sourcePaths.filter((path) => path.trim().length > 0));
  return syncStates.filter((state) =>
    selected.has(
      buildWebflowItemSourcePath({
        siteId: state.siteId,
        collectionId: state.collectionId,
        slug: state.slug,
      }),
    ),
  );
}

export async function runPushWebflowTranslations(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: readonly string[];
  sourceFileId?: string;
}): Promise<PushWebflowTranslationsResult> {
  const webflow = input.automation.toolConfig.webflow;
  const result: PushWebflowTranslationsResult = {
    pushedLocales: 0,
    failedLocales: 0,
    skippedLocales: 0,
    outcomes: [],
  };

  if (!webflow?.enabled || !webflow.connectionId) {
    throw new Error("push_webflow_translations_not_configured");
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("push_webflow_translations_project_required");
  }

  const loaded = await loadWebflowConnectionWithToken({
    organizationId: input.organizationId,
    connectionId: webflow.connectionId,
  });
  if (!loaded?.token) {
    throw new Error("webflow_not_connected");
  }

  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, projectId),
      ),
    )
    .limit(1);

  if (!project) {
    throw new Error("push_webflow_translations_project_required");
  }

  const client = new WebflowDataClient({ accessToken: loaded.token });
  const siteResult = await client.getSite(webflow.siteId || loaded.connection.siteId);
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

  const syncStates = selectWebflowPushSyncStates(
    await db
      .select()
      .from(schema.webflowItemSyncStates)
      .where(eq(schema.webflowItemSyncStates.automationId, input.automation.id)),
    input.sourcePaths,
  );

  const translationService = new ProjectTranslationService();

  await mapWithConcurrency(syncStates, WEBFLOW_PUSH_CONCURRENCY, async (syncState) => {
    const collectionResult = await client.getCollection(syncState.collectionId);
    if (isErr(collectionResult)) {
      return;
    }
    const translatableFields = listTranslatableWebflowFields(collectionResult.value);

    const sourcePath = buildWebflowItemSourcePath({
      siteId: syncState.siteId,
      collectionId: syncState.collectionId,
      slug: syncState.slug,
    });
    const latestVersion = await getLatestRepositorySourceFileVersion({
      organizationId: input.organizationId,
      projectId,
      sourcePath,
    });
    if (!latestVersion?.storedFileId) {
      return;
    }

    const sourceContent = await getStoredFileContent({
      organizationId: input.organizationId,
      projectId,
      fileId: latestVersion.storedFileId,
    });
    const sourceMap = parseWebflowTranslationMapJson(sourceContent.content.toString("utf8"));
    const liveSource = await client.getCollectionItem({
      collectionId: syncState.collectionId,
      itemId: syncState.itemId,
      cmsLocaleId: localeMapping.sourceCmsLocaleId!,
    });
    if (isErr(liveSource)) {
      return;
    }
    const liveMap = extractWebflowFieldStrings({
      fields: translatableFields,
      fieldData: liveSource.value.fieldData,
    });
    if (hashWebflowTranslationMap(liveMap) !== syncState.sourceHash) {
      for (const target of localeMapping.targets) {
        if (!target.webflowLocale) {
          continue;
        }
        result.skippedLocales += 1;
        result.outcomes.push({
          itemId: syncState.itemId,
          locale: target.projectLocale,
          status: "skipped",
          reason: "source_changed",
        });
      }
      return;
    }

    for (const target of localeMapping.targets) {
      if (!target.webflowLocale) {
        result.skippedLocales += 1;
        result.outcomes.push({
          itemId: syncState.itemId,
          locale: target.projectLocale,
          status: "skipped",
          reason: target.skippedReason ?? "target_locale_unmapped",
        });
        continue;
      }

      try {
        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath,
          targetLocale: target.projectLocale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        const approvedMap = approved.prefilled as Record<string, string>;

        const patchFieldData: Record<string, string> = {};
        for (const field of translatableFields) {
          const translated = approvedMap[field.slug];
          if (typeof translated !== "string") {
            continue;
          }
          const sourceValue = sourceMap[field.slug];
          if (typeof sourceValue === "string" && field.type === "RichText") {
            const guard = validateSecondaryLocaleComponentWrite({
              sourceHtml: sourceValue,
              patchHtml: translated,
            });
            if (!guard.ok) {
              result.failedLocales += 1;
              result.outcomes.push({
                itemId: syncState.itemId,
                locale: target.projectLocale,
                status: "failed",
                reason: guard.code,
              });
              continue;
            }
          }
          patchFieldData[field.slug] = translated;
        }

        if (Object.keys(patchFieldData).length === 0) {
          result.skippedLocales += 1;
          result.outcomes.push({
            itemId: syncState.itemId,
            locale: target.projectLocale,
            status: "skipped",
            reason: "unchanged",
          });
          continue;
        }

        const patchResult = await client.patchCollectionItem({
          collectionId: syncState.collectionId,
          itemId: syncState.itemId,
          cmsLocaleId: target.webflowLocale.cmsLocaleId,
          fieldData: patchFieldData,
        });
        if (isErr(patchResult)) {
          result.failedLocales += 1;
          result.outcomes.push({
            itemId: syncState.itemId,
            locale: target.projectLocale,
            status: "failed",
            reason: patchResult.error.message,
          });
          continue;
        }

        const publishResult = await client.publishCollectionItem({
          collectionId: syncState.collectionId,
          itemId: syncState.itemId,
          cmsLocaleIds: [target.webflowLocale.cmsLocaleId],
        });
        if (isErr(publishResult)) {
          result.failedLocales += 1;
          result.outcomes.push({
            itemId: syncState.itemId,
            locale: target.projectLocale,
            status: "failed",
            reason: publishResult.error.message,
          });
          continue;
        }

        result.pushedLocales += 1;
        result.outcomes.push({
          itemId: syncState.itemId,
          locale: target.projectLocale,
          status: "translated",
        });
      } catch (error) {
        logger.warn({ error, itemId: syncState.itemId }, "webflow_push_locale_failed");
        result.failedLocales += 1;
        result.outcomes.push({
          itemId: syncState.itemId,
          locale: target.projectLocale,
          status: "failed",
          reason: "push_failed",
        });
      }
    }
  });

  return result;
}
