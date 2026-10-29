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
import {
  loadPushLocaleTranslationProgress,
  toPushLocaleProgressRow,
  type PushLocaleProgressRow,
} from "@/lib/projects/locale-progress/push-translation-progress";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";
import { sourceKeysMissingApprovedTranslations } from "@/lib/sanity/push-sanity-translations";

import { buildWebflowItemSourcePath, parseWebflowTranslationMapJson } from "./document-json";
import { isWebflowJsonSourcePath, type WebflowPushItem } from "./webflow-push-item";

export { isWebflowJsonSourcePath, type WebflowPushItem };

export type WebflowPushEligibility = {
  eligibleLocaleCount: number;
  mappedItemCount: number;
  items: WebflowPushItem[];
};

const EMPTY_WEBFLOW_PUSH_ELIGIBILITY: WebflowPushEligibility = {
  eligibleLocaleCount: 0,
  mappedItemCount: 0,
  items: [],
};

export async function getWebflowPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  includeLocaleProgress?: boolean;
}): Promise<WebflowPushEligibility | null> {
  const includeLocaleProgress = input.includeLocaleProgress ?? false;
  const webflow = input.automation.toolConfig.webflow;
  if (!webflow?.enabled) {
    return null;
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return EMPTY_WEBFLOW_PUSH_ELIGIBILITY;
  }

  const [project] = await db
    .select({
      sourceLocale: schema.projects.sourceLocale,
      targetLocales: schema.projects.targetLocales,
    })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!project) {
    return EMPTY_WEBFLOW_PUSH_ELIGIBILITY;
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const jobTargetLocales =
    webflow.targetLocales.length > 0 ? [...webflow.targetLocales] : projectTargetLocales;

  if (jobTargetLocales.length === 0) {
    return EMPTY_WEBFLOW_PUSH_ELIGIBILITY;
  }

  const syncStates = await db
    .select()
    .from(schema.webflowItemSyncStates)
    .where(
      and(
        eq(schema.webflowItemSyncStates.organizationId, input.organizationId),
        eq(schema.webflowItemSyncStates.automationId, input.automation.id),
      ),
    );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: WebflowPushItem[] = [];

  for (const syncState of syncStates) {
    const sourcePath = buildWebflowItemSourcePath({
      siteId: syncState.siteId,
      collectionId: syncState.collectionId,
      slug: syncState.slug,
    });

    const latest = await getLatestRepositorySourceFileVersion({
      organizationId: input.organizationId,
      projectId,
      sourcePath,
    });
    let sourceKeys: string[] = [];
    if (latest?.storedFileId) {
      const stored = await getStoredFileContent({
        organizationId: input.organizationId,
        projectId,
        fileId: latest.storedFileId,
      });
      sourceKeys = Object.keys(parseWebflowTranslationMapJson(stored.content.toString("utf8")));
    }

    const eligibleLocales: string[] = [];
    const locales: PushLocaleProgressRow[] = [];
    for (const projectLocale of jobTargetLocales) {
      if (sourceKeys.length === 0) {
        continue;
      }
      const localeInput = {
        organizationId: input.organizationId,
        projectId,
        sourcePath,
        targetLocale: projectLocale,
      };
      const loadPrefilled = (
        request: Parameters<typeof translationService.loadAsPrefilledEntries>[0],
      ) => translationService.loadAsPrefilledEntries(request);
      if (includeLocaleProgress) {
        const localeProgress = await loadPushLocaleTranslationProgress(loadPrefilled, localeInput);
        locales.push(toPushLocaleProgressRow(projectLocale, localeProgress));
        const approvedMap = localeProgress.approvedPrefilled as Record<string, string>;
        if (sourceKeysMissingApprovedTranslations(sourceKeys, approvedMap) === 0) {
          eligibleLocales.push(projectLocale);
        }
        continue;
      }
      const approved = await translationService.loadAsPrefilledEntries({
        ...localeInput,
        approvedTranslationsOnly: true,
        readyTranslationsOnly: true,
      });
      const approvedMap = approved.prefilled as Record<string, string>;
      if (sourceKeysMissingApprovedTranslations(sourceKeys, approvedMap) === 0) {
        eligibleLocales.push(projectLocale);
      }
    }

    eligibleLocaleCount += eligibleLocales.length;
    if (eligibleLocales.length > 0) {
      mappedItemCount += 1;
    }

    items.push({
      documentId: syncState.itemId,
      sourcePath,
      status: "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount: jobTargetLocales.length,
      eligibleLocales,
      locales,
      lastPushedAt: syncState.lastPushedAt?.toISOString() ?? null,
      lastError: null,
    });
  }

  return { eligibleLocaleCount, mappedItemCount, items };
}

export function isWebflowPushRunActive(
  runs: ReadonlyArray<{ status: string; inputSnapshot?: object | null }>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    if (!run.inputSnapshot || !("operation" in run.inputSnapshot)) {
      return false;
    }
    const operation = (run.inputSnapshot as { operation?: unknown }).operation;
    return operation === "push_approved";
  });
}
