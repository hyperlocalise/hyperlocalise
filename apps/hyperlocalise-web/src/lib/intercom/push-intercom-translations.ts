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
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";

import {
  collectApprovedIntercomArticleValues,
  encodeIntercomLastPushRecord,
  hashIntercomTranslationValues,
  mergeIntercomLocalePushPayload,
  parseIntercomLastPushRecord,
  shouldSkipUnchangedIntercomHash,
} from "./article-json";
import {
  createIntercomArticlesClient,
  getIntercomArticle,
  resolveIntercomLocaleRemoteEditedAt,
  updateIntercomArticleTranslatedContent,
} from "./articles-api";
import { mapProjectLocalesToIntercom, normalizeIntercomLocaleTag } from "./intercom-locale";
import {
  assertLiveIntercomAutomationConfigVersion,
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

const logger = createLogger("push-intercom-translations");
const PUSH_CONCURRENCY = 3;

export type PushIntercomTranslationsResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  articlesProcessed: number;
};

export async function runPushIntercomTranslations(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
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
      },
      write,
    );

  await assertLiveIntercomAutomationConfigVersion(db, {
    organizationId: input.organizationId,
    automationId: input.automation.id,
    configVersion: input.automation.configVersion,
    scopeKey: pushScopeKey,
    staleErrorCode: INTERCOM_PUSH_STALE_CONFIG,
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

  const localeMapping = mapProjectLocalesToIntercom({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    intercomLocales: helpCenterLocales,
    configuredSourceLocale: intercom.sourceLocale,
    configuredTargetLocales: intercom.targetLocales.length > 0 ? intercom.targetLocales : undefined,
  });

  const client = createIntercomArticlesClient({
    accessToken: tokenResult.value,
    restEndpoint: intercom.restEndpoint,
  });

  const mappings = await db
    .select()
    .from(schema.intercomArticleSyncStates)
    .where(
      and(
        eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
        eq(schema.intercomArticleSyncStates.automationId, input.automation.id),
        inArray(schema.intercomArticleSyncStates.status, ["active", "push_failed"]),
      ),
    );

  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;

  const currentTarget = {
    projectId,
    helpCenterId,
  };

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
      await writeIfCurrent((tx) =>
        tx
          .update(schema.intercomArticleSyncStates)
          .set({
            status: "push_failed",
            lastError: {
              message: error instanceof Error ? error.message : String(error),
            },
            updatedAt: new Date(),
          })
          .where(eq(schema.intercomArticleSyncStates.id, mapping.id)),
      );
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

    for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
      const hlLocale = localeMapping.jobTargetLocales[index]!;
      const intercomLocale = localeMapping.intercomTargetLocales[index]!;
      if (!intercomLocale) {
        articleSkipped += 1;
        continue;
      }

      try {
        const prefilledResult = await loadProjectTranslationsAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: hlLocale,
          readyTranslationsOnly: true,
          approvedTranslationsOnly: true,
        });
        const approved = collectApprovedIntercomArticleValues(prefilledResult.prefilled);
        const remoteLocale =
          remoteArticle?.localeContent[intercomLocale] ??
          remoteArticle?.localeContent[normalizeIntercomLocaleTag(intercomLocale)] ??
          null;
        const values = mergeIntercomLocalePushPayload({
          approved,
          remote: remoteLocale,
        });

        if (!values) {
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
        if (
          shouldSkipUnchangedIntercomHash({
            lastHash: lastPush.hash,
            nextHash: hash,
            overwriteIntercomDrafts: intercom.overwriteIntercomDrafts,
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
          !intercom.overwriteIntercomDrafts &&
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

    await writeIfCurrent((tx) =>
      tx
        .update(schema.intercomArticleSyncStates)
        .set({
          lastPushedAt: articlePushed > 0 ? new Date() : mapping.lastPushedAt,
          lastPushContentHash: lastPushHash,
          status: articleFailed > 0 ? "push_failed" : "active",
          updatedAt: new Date(),
        })
        .where(eq(schema.intercomArticleSyncStates.id, mapping.id)),
    );

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
