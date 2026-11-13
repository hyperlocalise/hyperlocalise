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

import { db, schema } from "@/lib/database/client";
import type { DatabaseTransaction } from "@/lib/database/client";
import type { WorkspaceAutomationRecord } from "@/lib/agents/workspace-automation-types";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";

import {
  encodeIntercomLastPushRecord,
  hashIntercomTranslationValues,
  mergeIntercomLocalePushPayload,
  parseIntercomLastPushRecord,
  shouldSkipUnchangedIntercomHash,
} from "./article-markdown";
import {
  createIntercomArticlesClient,
  getIntercomArticle,
  resolveIntercomLocaleRemoteEditedAt,
  updateIntercomArticleTranslatedContent,
} from "./articles-api";
import {
  buildIntercomArticleLocaleMapping,
  mapProjectLocalesToIntercom,
  normalizeIntercomLocaleTag,
  unionIntercomLocales,
} from "./intercom-locale";
import {
  assertLiveIntercomAutomationConfigVersion,
  loadLiveIntercomPushSettings,
  withCurrentIntercomAutomationConfig,
} from "./intercom-sync-current";
import {
  INTERCOM_PUSH_STALE_CONFIG,
  buildIntercomImportScopeKey,
  intercomArticleInConfiguredCollections,
  intercomMappingMatchesTarget,
  isIntercomSyncStaleConfigError,
} from "./intercom-sync-scope";
import { loadIntercomPipesAccessToken } from "./pipes";
import { loadApprovedIntercomArticleValuesByPath } from "./push-eligibility";

const logger = createLogger("push-intercom-translations");
const PUSH_CONCURRENCY = 3;

export type PushIntercomTranslationsResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  articlesProcessed: number;
};

export function readIntercomPushSourcePaths(
  inputSnapshot: Record<string, unknown> | null | undefined,
): string[] | undefined {
  const raw = inputSnapshot?.sourcePaths;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  return raw.filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
}

export function selectIntercomPushMappings<T extends { sourcePath: string }>(
  mappings: T[],
  sourcePaths?: readonly string[],
): T[] {
  if (!sourcePaths) {
    return mappings;
  }
  const selectedSourcePaths = new Set(
    sourcePaths.filter((sourcePath) => sourcePath.trim().length > 0),
  );
  return mappings.filter((mapping) => selectedSourcePaths.has(mapping.sourcePath));
}

export async function runPushIntercomTranslations(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushIntercomTranslationsResult> {
  const intercom = input.automation.toolConfig.intercom;
  if (!intercom?.enabled || !intercom.workosUserId) {
    throw new Error("intercom_not_configured");
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("intercom_project_required");
  }
  const helpCenterId = intercom.helpCenterId?.trim();
  if (!helpCenterId) {
    throw new Error("intercom_help_center_required");
  }

  const pushScopeKey = buildIntercomImportScopeKey({
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
        scopeKey: pushScopeKey,
        staleErrorCode: INTERCOM_PUSH_STALE_CONFIG,
        compare: "scope",
      },
      write,
    );

  await assertLiveIntercomAutomationConfigVersion(db, {
    organizationId: input.organizationId,
    automationId: input.automation.id,
    configVersion: input.automation.configVersion,
    scopeKey: pushScopeKey,
    staleErrorCode: INTERCOM_PUSH_STALE_CONFIG,
    compare: "scope",
  });

  const tokenResult = await loadIntercomPipesAccessToken({
    localOrganizationId: input.organizationId,
    workosUserId: intercom.workosUserId,
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

  if (!project) {
    throw new Error("intercom_project_not_found");
  }

  const helpCenterLocales =
    intercom.helpCenterLocales.length > 0 ? intercom.helpCenterLocales : intercom.targetLocales;

  const localeMappingInput = {
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    configuredSourceLocale: intercom.sourceLocale,
    configuredTargetLocales: intercom.targetLocales.length > 0 ? intercom.targetLocales : undefined,
  };

  const localeMapping = mapProjectLocalesToIntercom({
    ...localeMappingInput,
    intercomLocales: helpCenterLocales,
  });

  const client = createIntercomArticlesClient({
    accessToken: tokenResult.value,
    restEndpoint: intercom.restEndpoint,
  });

  const mappings = selectIntercomPushMappings(
    await db
      .select()
      .from(schema.intercomArticleSyncStates)
      .where(
        and(
          eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
          eq(schema.intercomArticleSyncStates.automationId, input.automation.id),
          inArray(schema.intercomArticleSyncStates.status, ["active", "push_failed"]),
        ),
      ),
    input.sourcePaths,
  );

  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;

  const currentTarget = {
    projectId,
    helpCenterId,
  };
  const approvedTargetLocales = unionIntercomLocales(
    localeMapping.jobTargetLocales,
    mappings.flatMap((mapping) => Object.keys(mapping.importedTranslationHashes ?? {})),
  );

  const approvedByPathAndLocale = await loadApprovedIntercomArticleValuesByPath({
    organizationId: input.organizationId,
    projectId,
    sourcePaths: mappings.map((mapping) => mapping.sourcePath),
    targetLocales: approvedTargetLocales,
  });

  await mapWithConcurrency(mappings, PUSH_CONCURRENCY, async (mapping) => {
    if (!intercomMappingMatchesTarget(mapping, currentTarget)) {
      await writeIfCurrent((tx) =>
        tx
          .update(schema.intercomArticleSyncStates)
          .set({
            status: "archived",
            updatedAt: new Date(),
          })
          .where(eq(schema.intercomArticleSyncStates.id, mapping.id)),
      );
      return;
    }

    let remoteArticle;
    try {
      remoteArticle = await getIntercomArticle(client, mapping.articleId);
    } catch (error) {
      failedLocales += 1;
      logger.warn(
        {
          automationId: input.automation.id,
          articleId: mapping.articleId,
          error: error instanceof Error ? error.message : String(error),
        },
        "intercom article read failed",
      );
      await updateMappingIfCurrentTarget({
        mappingId: mapping.id,
        projectId,
        helpCenterId,
        values: {
          status: "push_failed",
          lastError: {
            message: error instanceof Error ? error.message : String(error),
          },
          updatedAt: new Date(),
        },
        statuses: ["active", "push_failed"],
      });
      return;
    }
    if (
      remoteArticle &&
      !intercomArticleInConfiguredCollections(remoteArticle.parentIds, intercom.collectionIds)
    ) {
      await writeIfCurrent((tx) =>
        tx
          .update(schema.intercomArticleSyncStates)
          .set({
            status: "archived",
            updatedAt: new Date(),
          })
          .where(eq(schema.intercomArticleSyncStates.id, mapping.id)),
      );
      return;
    }
    const authorId = remoteArticle?.authorId ?? null;

    const lastPushHash = { ...mapping.lastPushContentHash };
    let articlePushed = 0;
    let articleSkipped = 0;
    let articleFailed = 0;

    const articleLocaleMapping = buildIntercomArticleLocaleMapping(
      localeMappingInput,
      helpCenterLocales,
      unionIntercomLocales(
        mapping.articleLocaleContentKeys,
        Object.keys(remoteArticle?.localeContent ?? {}),
      ),
    );

    for (let index = 0; index < articleLocaleMapping.jobTargetLocales.length; index += 1) {
      const hlLocale = articleLocaleMapping.jobTargetLocales[index]!;
      const intercomLocale = articleLocaleMapping.intercomTargetLocales[index]!;
      if (!intercomLocale) {
        articleSkipped += 1;
        continue;
      }

      try {
        const approved = approvedByPathAndLocale.get(mapping.sourcePath)?.get(hlLocale);
        const remoteLocale =
          remoteArticle?.localeContent[intercomLocale] ??
          remoteArticle?.localeContent[normalizeIntercomLocaleTag(intercomLocale)] ??
          null;
        const values = mergeIntercomLocalePushPayload({
          approved: approved ?? {},
          remote: remoteLocale,
        });

        if (!approved || !values) {
          articleSkipped += 1;
          continue;
        }

        const hash = hashIntercomTranslationValues({
          title: approved.title,
          description: approved.description,
          body: approved.body,
        });
        const hashKey = normalizeIntercomLocaleTag(intercomLocale);
        const lastPush = parseIntercomLastPushRecord(lastPushHash[hashKey]);
        const livePushSettings = await loadLiveIntercomPushSettings(db, {
          organizationId: input.organizationId,
          automationId: input.automation.id,
          scopeKey: pushScopeKey,
          staleErrorCode: INTERCOM_PUSH_STALE_CONFIG,
        });
        if (
          shouldSkipUnchangedIntercomHash({
            lastHash: lastPush.hash,
            nextHash: hash,
            overwriteIntercomDrafts: livePushSettings.overwriteIntercomDrafts,
          })
        ) {
          articleSkipped += 1;
          continue;
        }

        const remoteLocaleEditedAt = remoteArticle
          ? (resolveIntercomLocaleRemoteEditedAt(remoteArticle, intercomLocale) ??
            resolveIntercomLocaleRemoteEditedAt(remoteArticle, hashKey))
          : null;
        if (
          !livePushSettings.overwriteIntercomDrafts &&
          remoteLocaleEditedAt != null &&
          lastPush.pushedAtSeconds != null &&
          remoteLocaleEditedAt > lastPush.pushedAtSeconds
        ) {
          articleSkipped += 1;
          continue;
        }

        await updateIntercomArticleTranslatedContent({
          client,
          articleId: mapping.articleId,
          authorId,
          locale: intercomLocale,
          title: values.title,
          description: values.description,
          body: values.body,
        });

        lastPushHash[hashKey] = encodeIntercomLastPushRecord(hash, Math.floor(Date.now() / 1000));
        articlePushed += 1;
      } catch (error) {
        if (isIntercomSyncStaleConfigError(error)) {
          await persistPushReceipt({
            mapping,
            projectId,
            helpCenterId,
            lastPushHash,
            articlePushed,
            articleFailed,
          });
          throw error;
        }
        articleFailed += 1;
        logger.warn(
          {
            automationId: input.automation.id,
            articleId: mapping.articleId,
            locale: intercomLocale,
            error: error instanceof Error ? error.message : String(error),
          },
          "intercom locale push failed",
        );
      }
    }

    await persistPushReceipt({
      mapping,
      projectId,
      helpCenterId,
      lastPushHash,
      articlePushed,
      articleFailed,
    });

    pushedLocales += articlePushed;
    skippedLocales += articleSkipped;
    failedLocales += articleFailed;
  });

  return {
    pushedLocales,
    skippedLocales,
    failedLocales,
    articlesProcessed: mappings.length,
  };
}

async function persistPushReceipt(input: {
  mapping: { id: string; lastPushedAt: Date | null };
  projectId: string;
  helpCenterId: string;
  lastPushHash: Record<string, string>;
  articlePushed: number;
  articleFailed: number;
}) {
  await updateMappingIfCurrentTarget({
    mappingId: input.mapping.id,
    projectId: input.projectId,
    helpCenterId: input.helpCenterId,
    values: {
      lastPushedAt: input.articlePushed > 0 ? new Date() : input.mapping.lastPushedAt,
      lastPushContentHash: input.lastPushHash,
      updatedAt: new Date(),
    },
  });
  await updateMappingIfCurrentTarget({
    mappingId: input.mapping.id,
    projectId: input.projectId,
    helpCenterId: input.helpCenterId,
    values: {
      status: input.articleFailed > 0 ? "push_failed" : "active",
      updatedAt: new Date(),
    },
    statuses: ["active", "push_failed"],
  });
}

async function updateMappingIfCurrentTarget(input: {
  mappingId: string;
  projectId: string;
  helpCenterId: string;
  values: {
    status?: "active" | "archived" | "push_failed";
    lastError?: Record<string, unknown> | null;
    lastPushedAt?: Date | null;
    lastPushContentHash?: Record<string, string>;
    updatedAt: Date;
  };
  statuses?: ReadonlyArray<"active" | "push_failed">;
}) {
  await db
    .update(schema.intercomArticleSyncStates)
    .set(input.values)
    .where(
      and(
        eq(schema.intercomArticleSyncStates.id, input.mappingId),
        eq(schema.intercomArticleSyncStates.projectId, input.projectId),
        eq(schema.intercomArticleSyncStates.helpCenterId, input.helpCenterId),
        input.statuses
          ? inArray(schema.intercomArticleSyncStates.status, [...input.statuses])
          : undefined,
      ),
    );
}
