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

import {
  collectApprovedIntercomArticleValues,
  hashIntercomTranslationValues,
  INTERCOM_ARTICLE_JSON_KEYS,
  mergeIntercomLocalePushPayload,
  parseIntercomLastPushRecord,
  shouldSkipUnchangedIntercomHash,
} from "./article-json";
import { mapProjectLocalesToIntercom, normalizeIntercomLocaleTag } from "./intercom-locale";
import { intercomMappingMatchesTarget } from "./intercom-sync-scope";

export type IntercomPushEligibility = {
  eligibleLocaleCount: number;
  mappedArticleCount: number;
};

export async function getIntercomPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<IntercomPushEligibility | null> {
  const intercom = input.automation.toolConfig.intercom;
  if (!intercom?.enabled) {
    return null;
  }

  const projectId = input.automation.projectId?.trim();
  const helpCenterId = intercom.helpCenterId?.trim();
  if (!projectId || !helpCenterId) {
    return { eligibleLocaleCount: 0, mappedArticleCount: 0 };
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
    return { eligibleLocaleCount: 0, mappedArticleCount: 0 };
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

  if (localeMapping.jobTargetLocales.length === 0) {
    return { eligibleLocaleCount: 0, mappedArticleCount: 0 };
  }

  const mappings = (
    await db
      .select()
      .from(schema.intercomArticleSyncStates)
      .where(
        and(
          eq(schema.intercomArticleSyncStates.organizationId, input.organizationId),
          eq(schema.intercomArticleSyncStates.automationId, input.automation.id),
          inArray(schema.intercomArticleSyncStates.status, ["active", "push_failed"]),
        ),
      )
  ).filter((mapping) =>
    intercomMappingMatchesTarget(mapping, {
      projectId,
      helpCenterId,
    }),
  );

  const approvedByPathAndLocale = await loadApprovedIntercomArticleValuesByPath({
    organizationId: input.organizationId,
    projectId,
    sourcePaths: mappings.map((mapping) => mapping.sourcePath),
    targetLocales: localeMapping.jobTargetLocales,
  });

  let eligibleLocaleCount = 0;
  let mappedArticleCount = 0;

  for (const mapping of mappings) {
    let articleEligible = 0;
    const approvedByLocale = approvedByPathAndLocale.get(mapping.sourcePath);

    for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
      const hlLocale = localeMapping.jobTargetLocales[index]!;
      const intercomLocale = localeMapping.intercomTargetLocales[index]!;
      if (!intercomLocale) {
        continue;
      }

      const approved = collectApprovedIntercomArticleValues(approvedByLocale?.get(hlLocale) ?? {});
      const values = mergeIntercomLocalePushPayload({
        approved,
        remote: null,
      });
      if (!values) {
        continue;
      }

      const hashKey = normalizeIntercomLocaleTag(intercomLocale);
      const hash = hashIntercomTranslationValues({
        title: approved.title,
        description: approved.description,
        body: approved.body,
      });
      const lastPush = parseIntercomLastPushRecord((mapping.lastPushContentHash ?? {})[hashKey]);
      if (
        shouldSkipUnchangedIntercomHash({
          lastHash: lastPush.hash,
          nextHash: hash,
          overwriteIntercomDrafts: intercom.overwriteIntercomDrafts,
        })
      ) {
        continue;
      }

      articleEligible += 1;
      eligibleLocaleCount += 1;
    }

    if (articleEligible > 0) {
      mappedArticleCount += 1;
    }
  }

  return { eligibleLocaleCount, mappedArticleCount };
}

async function loadApprovedIntercomArticleValuesByPath(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
  targetLocales: string[];
}): Promise<Map<string, Map<string, Record<string, string>>>> {
  const valuesByPathAndLocale = new Map<string, Map<string, Record<string, string>>>();
  if (input.sourcePaths.length === 0 || input.targetLocales.length === 0) {
    return valuesByPathAndLocale;
  }

  const sourceFiles = await db
    .select({
      id: schema.repositorySourceFiles.id,
      sourcePath: schema.repositorySourceFiles.sourcePath,
    })
    .from(schema.repositorySourceFiles)
    .where(
      and(
        eq(schema.repositorySourceFiles.organizationId, input.organizationId),
        eq(schema.repositorySourceFiles.projectId, input.projectId),
        inArray(schema.repositorySourceFiles.sourcePath, input.sourcePaths),
      ),
    );

  if (sourceFiles.length === 0) {
    return valuesByPathAndLocale;
  }

  const pathByFileId = new Map(sourceFiles.map((file) => [file.id, file.sourcePath]));
  const keys = await db
    .select({
      id: schema.projectTranslationKeys.id,
      key: schema.projectTranslationKeys.key,
      repositorySourceFileId: schema.projectTranslationKeys.repositorySourceFileId,
    })
    .from(schema.projectTranslationKeys)
    .where(
      and(
        eq(schema.projectTranslationKeys.organizationId, input.organizationId),
        eq(schema.projectTranslationKeys.projectId, input.projectId),
        inArray(
          schema.projectTranslationKeys.repositorySourceFileId,
          sourceFiles.map((file) => file.id),
        ),
        inArray(schema.projectTranslationKeys.key, [...INTERCOM_ARTICLE_JSON_KEYS]),
      ),
    );

  if (keys.length === 0) {
    return valuesByPathAndLocale;
  }

  const keyById = new Map(keys.map((key) => [key.id, key]));
  const translations = await db
    .select({
      translationKeyId: schema.projectTranslations.translationKeyId,
      targetLocale: schema.projectTranslations.targetLocale,
      text: schema.projectTranslations.text,
    })
    .from(schema.projectTranslations)
    .where(
      and(
        eq(schema.projectTranslations.organizationId, input.organizationId),
        eq(schema.projectTranslations.projectId, input.projectId),
        inArray(
          schema.projectTranslations.translationKeyId,
          keys.map((key) => key.id),
        ),
        inArray(schema.projectTranslations.targetLocale, input.targetLocales),
        eq(schema.projectTranslations.status, "approved"),
      ),
    );

  for (const translation of translations) {
    if (translation.text.trim().length === 0) {
      continue;
    }
    const key = keyById.get(translation.translationKeyId);
    if (!key || !isIntercomArticleJsonKey(key.key) || !key.repositorySourceFileId) {
      continue;
    }
    const sourcePath = pathByFileId.get(key.repositorySourceFileId);
    if (!sourcePath) {
      continue;
    }
    let localeValues = valuesByPathAndLocale.get(sourcePath);
    if (!localeValues) {
      localeValues = new Map();
      valuesByPathAndLocale.set(sourcePath, localeValues);
    }
    const approved = localeValues.get(translation.targetLocale) ?? {};
    approved[key.key] = translation.text;
    localeValues.set(translation.targetLocale, approved);
  }

  return valuesByPathAndLocale;
}

function isIntercomArticleJsonKey(key: string): key is (typeof INTERCOM_ARTICLE_JSON_KEYS)[number] {
  return INTERCOM_ARTICLE_JSON_KEYS.includes(key as (typeof INTERCOM_ARTICLE_JSON_KEYS)[number]);
}

export function isIntercomPushRunActive(
  runs: ReadonlyArray<{ status: string; inputSnapshot?: Record<string, unknown> | null }>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    const operation = run.inputSnapshot?.operation;
    return operation === "push_approved";
  });
}
