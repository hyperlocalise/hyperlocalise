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
import { loadProjectTranslationsAsPrefilledEntries } from "@/lib/projects/translations/project-translation-service";

import {
  collectApprovedIntercomArticleValues,
  hashIntercomTranslationValues,
  mergeIntercomLocalePushPayload,
  parseIntercomLastPushRecord,
} from "./article-json";
import { mapProjectLocalesToIntercom, normalizeIntercomLocaleTag } from "./intercom-locale";

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
  if (!projectId) {
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

  let eligibleLocaleCount = 0;
  let mappedArticleCount = 0;

  for (const mapping of mappings) {
    let articleEligible = 0;

    for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
      const hlLocale = localeMapping.jobTargetLocales[index]!;
      const intercomLocale = localeMapping.intercomTargetLocales[index]!;
      if (!intercomLocale) {
        continue;
      }

      const prefilledResult = await loadProjectTranslationsAsPrefilledEntries({
        organizationId: input.organizationId,
        projectId,
        sourcePath: mapping.sourcePath,
        targetLocale: hlLocale,
        readyTranslationsOnly: true,
        approvedTranslationsOnly: true,
      });

      const values = mergeIntercomLocalePushPayload({
        approved: collectApprovedIntercomArticleValues(prefilledResult.prefilled),
        remote: null,
      });
      if (!values) {
        continue;
      }

      const hashKey = normalizeIntercomLocaleTag(intercomLocale);
      const hash = hashIntercomTranslationValues(values);
      const lastPush = parseIntercomLastPushRecord((mapping.lastPushContentHash ?? {})[hashKey]);
      if (lastPush.hash === hash) {
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
