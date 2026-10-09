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
  getLatestRepositorySourceFileVersion,
  getStoredFileContent,
} from "@/lib/file-storage/records";
import { isMarkdownCalloutFenceEntry } from "@/lib/markdown/markdown-callout-fence";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import {
  hashIntercomTranslationValues,
  mergeIntercomLocalePushPayload,
  parseIntercomArticleMarkdown,
  parseIntercomLastPushRecord,
  shouldSkipUnchangedIntercomHash,
  type IntercomArticleFields,
} from "./article-markdown";
import {
  buildIntercomArticleLocaleMapping,
  mapProjectLocalesToIntercom,
  normalizeIntercomLocaleTag,
  unionIntercomLocales,
} from "./intercom-locale";
import { intercomMappingMatchesTarget } from "./intercom-sync-scope";
import { composeIntercomArticleFromApprovedKeyedUnits } from "./keyed-article-compose";

const APPROVED_VARIANT_READ_CONCURRENCY = 8;
const APPROVED_KEYED_SOURCE_READ_CONCURRENCY = 8;
const APPROVED_KEY_PAGE_SIZE = 2_000;

export type IntercomPushArticle = {
  articleId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type IntercomPushEligibility = {
  eligibleLocaleCount: number;
  mappedArticleCount: number;
  articles: IntercomPushArticle[];
};

const EMPTY_INTERCOM_PUSH_ELIGIBILITY: IntercomPushEligibility = {
  eligibleLocaleCount: 0,
  mappedArticleCount: 0,
  articles: [],
};

function intercomPushLastErrorMessage(lastError: Record<string, unknown> | null | undefined) {
  if (!lastError) {
    return null;
  }
  const message = lastError.message;
  return typeof message === "string" && message.trim().length > 0 ? message : null;
}

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
    return EMPTY_INTERCOM_PUSH_ELIGIBILITY;
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
    return EMPTY_INTERCOM_PUSH_ELIGIBILITY;
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

  if (localeMapping.jobTargetLocales.length === 0) {
    return EMPTY_INTERCOM_PUSH_ELIGIBILITY;
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

  let eligibleLocaleCount = 0;
  let mappedArticleCount = 0;
  const articles: IntercomPushArticle[] = [];

  for (const mapping of mappings) {
    const eligibleLocales: string[] = [];
    const approvedByLocale = approvedByPathAndLocale.get(mapping.sourcePath);
    const articleLocaleMapping = buildIntercomArticleLocaleMapping(
      localeMappingInput,
      helpCenterLocales,
      mapping.articleLocaleContentKeys,
    );
    const targetLocaleCount = articleLocaleMapping.jobTargetLocales.length;

    for (let index = 0; index < articleLocaleMapping.jobTargetLocales.length; index += 1) {
      const hlLocale = articleLocaleMapping.jobTargetLocales[index]!;
      const intercomLocale = articleLocaleMapping.intercomTargetLocales[index]!;
      if (!intercomLocale) {
        continue;
      }

      const approved = approvedByLocale?.get(hlLocale);
      if (!approved) {
        continue;
      }
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

      eligibleLocales.push(hlLocale);
      eligibleLocaleCount += 1;
    }

    if (eligibleLocales.length > 0) {
      mappedArticleCount += 1;
    }

    articles.push({
      articleId: mapping.articleId,
      sourcePath: mapping.sourcePath,
      status: mapping.status === "push_failed" ? "push_failed" : "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount,
      eligibleLocales,
      lastPushedAt: mapping.lastPushedAt?.toISOString() ?? null,
      lastError: intercomPushLastErrorMessage(mapping.lastError),
    });
  }

  return { eligibleLocaleCount, mappedArticleCount, articles };
}

export async function loadApprovedIntercomArticleValuesByPath(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
  targetLocales: string[];
}): Promise<Map<string, Map<string, IntercomArticleFields>>> {
  const valuesByPathAndLocale = new Map<string, Map<string, IntercomArticleFields>>();
  if (input.sourcePaths.length === 0 || input.targetLocales.length === 0) {
    return valuesByPathAndLocale;
  }

  const variants = await db
    .select({
      sourcePath: schema.projectImageVariants.sourcePath,
      targetLocale: schema.projectImageVariants.targetLocale,
      storedFileId: schema.projectImageVariants.storedFileId,
    })
    .from(schema.projectImageVariants)
    .where(
      and(
        eq(schema.projectImageVariants.organizationId, input.organizationId),
        eq(schema.projectImageVariants.projectId, input.projectId),
        inArray(schema.projectImageVariants.sourcePath, input.sourcePaths),
        inArray(schema.projectImageVariants.targetLocale, input.targetLocales),
        eq(schema.projectImageVariants.status, "approved"),
      ),
    );

  const readableVariants = variants.filter(
    (variant): variant is typeof variant & { storedFileId: string } =>
      typeof variant.storedFileId === "string" && variant.storedFileId.length > 0,
  );

  await mapWithConcurrency(readableVariants, APPROVED_VARIANT_READ_CONCURRENCY, async (variant) => {
    try {
      const stored = await getStoredFileContent({
        organizationId: input.organizationId,
        projectId: input.projectId,
        fileId: variant.storedFileId,
      });
      const approved = mergeIntercomLocalePushPayload({
        approved: parseIntercomArticleMarkdown(stored.content.toString("utf8")),
        remote: null,
      });
      if (!approved) {
        return;
      }
      let localeValues = valuesByPathAndLocale.get(variant.sourcePath);
      if (!localeValues) {
        localeValues = new Map();
        valuesByPathAndLocale.set(variant.sourcePath, localeValues);
      }
      localeValues.set(variant.targetLocale, approved);
    } catch {
      // Missing or unreadable variant bytes are treated as not approved.
    }
  });

  await mergeApprovedKeyedIntercomArticleValues({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePaths: input.sourcePaths,
    targetLocales: input.targetLocales,
    valuesByPathAndLocale,
  });

  return valuesByPathAndLocale;
}

async function mergeApprovedKeyedIntercomArticleValues(input: {
  organizationId: string;
  projectId: string;
  sourcePaths: string[];
  targetLocales: string[];
  valuesByPathAndLocale: Map<string, Map<string, IntercomArticleFields>>;
}) {
  if (input.sourcePaths.length === 0) {
    return;
  }

  const translationService = new ProjectTranslationService();
  const keys: Array<{
    id: string;
    key: string;
    sourceText: string;
    isHidden: boolean;
    sourcePath: string;
  }> = [];
  let offset = 0;
  while (true) {
    const page = await translationService.listKeysForProject({
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePaths: input.sourcePaths,
      limit: APPROVED_KEY_PAGE_SIZE,
      offset,
    });
    keys.push(...page);
    if (page.length < APPROVED_KEY_PAGE_SIZE) {
      break;
    }
    offset += page.length;
  }
  if (keys.length === 0) {
    return;
  }

  const keysByPath = new Map<string, typeof keys>();
  for (const key of keys) {
    const existing = keysByPath.get(key.sourcePath);
    if (existing) {
      existing.push(key);
      continue;
    }
    keysByPath.set(key.sourcePath, [key]);
  }

  const sourceMarkdownByPath = new Map<string, string>();
  await mapWithConcurrency(
    [...keysByPath.keys()],
    APPROVED_KEYED_SOURCE_READ_CONCURRENCY,
    async (sourcePath) => {
      const version = await getLatestRepositorySourceFileVersion({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath,
      });
      if (!version?.storedFileId) {
        return;
      }
      try {
        const stored = await getStoredFileContent({
          organizationId: input.organizationId,
          projectId: input.projectId,
          fileId: version.storedFileId,
        });
        sourceMarkdownByPath.set(sourcePath, stored.content.toString("utf8"));
      } catch {
        // Missing source bytes cannot be marshaled back into an Intercom article.
      }
    },
  );

  for (const targetLocale of input.targetLocales) {
    const translations = await translationService.getTranslationsByKeyIds({
      organizationId: input.organizationId,
      projectId: input.projectId,
      translationKeyIds: keys.map((key) => key.id),
      targetLocale,
    });
    const translationByKeyId = new Map(
      translations.map((translation) => [translation.translationKeyId, translation]),
    );

    for (const [sourcePath, pathKeys] of keysByPath) {
      const sourceMarkdown = sourceMarkdownByPath.get(sourcePath);
      if (!sourceMarkdown || pathKeys.length === 0) {
        continue;
      }

      const units: Array<{
        key: string;
        sourceText: string;
        targetText: string;
        isHidden: boolean;
      }> = [];
      let allVisibleApproved = true;
      for (const key of pathKeys) {
        if (isMarkdownCalloutFenceEntry(key.key, key.sourceText)) {
          continue;
        }
        const translation = translationByKeyId.get(key.id);
        const approvedText =
          translation?.status === "approved" && translation.text.trim().length > 0
            ? translation.text
            : null;
        if (!key.isHidden && !approvedText) {
          allVisibleApproved = false;
          break;
        }
        if (approvedText) {
          units.push({
            key: key.key,
            sourceText: key.sourceText,
            targetText: approvedText,
            isHidden: key.isHidden,
          });
        }
      }
      if (!allVisibleApproved) {
        continue;
      }

      const composed = composeIntercomArticleFromApprovedKeyedUnits({
        sourceMarkdown,
        units,
      });
      if (!composed) {
        continue;
      }

      let localeValues = input.valuesByPathAndLocale.get(sourcePath);
      if (!localeValues) {
        localeValues = new Map();
        input.valuesByPathAndLocale.set(sourcePath, localeValues);
      }
      localeValues.set(targetLocale, composed);
    }
  }
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
