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
import { and, eq, sql } from "drizzle-orm";

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

import { STORYBLOK_PUSH_CONCURRENCY } from "./constants";
import {
  buildStoryblokImportPayload,
  hashStoryblokTranslationMap,
  parseStoryblokTranslationMapJson,
  splitStoryblokExport,
} from "./document-json";
import { loadStoryblokClientForConnection } from "./storyblok-connection-access";
import { mapProjectLocalesToStoryblok } from "./storyblok-locale";

const logger = createLogger("push-storyblok-translations");

export type PushStoryblokTranslationsResult = {
  pushedLocales: number;
  failedLocales: number;
  skippedLocales: number;
  outcomes: Array<{
    storyId: string;
    locale: string;
    status: "translated" | "skipped" | "failed";
    reason?: string;
  }>;
};

export function readStoryblokPushSourcePaths(
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

export function selectStoryblokPushSyncStates<T extends { sourcePath: string }>(
  syncStates: T[],
  sourcePaths?: readonly string[],
): T[] {
  if (!sourcePaths) {
    return syncStates;
  }
  const selected = new Set(sourcePaths.filter((path) => path.trim().length > 0));
  return syncStates.filter((state) => selected.has(state.sourcePath));
}

/**
 * Writes approved translations back onto each imported story, one Storyblok
 * language at a time, through the translation import API. Fields without an
 * approved translation keep their current value. Never publishes.
 */
export async function runPushStoryblokTranslations(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: readonly string[];
  signal?: AbortSignal;
}): Promise<PushStoryblokTranslationsResult> {
  const storyblok = input.automation.toolConfig.storyblok;
  const result: PushStoryblokTranslationsResult = {
    pushedLocales: 0,
    failedLocales: 0,
    skippedLocales: 0,
    outcomes: [],
  };

  if (!storyblok?.enabled || !storyblok.connectionId) {
    throw new Error("push_storyblok_translations_not_configured");
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("push_storyblok_translations_project_required");
  }

  const [project] = await db
    .select({ targetLocales: schema.projects.targetLocales })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.organizationId, input.organizationId),
        eq(schema.projects.id, projectId),
      ),
    )
    .limit(1);
  if (!project) {
    throw new Error("push_storyblok_translations_project_required");
  }

  const { connection, client } = await loadStoryblokClientForConnection({
    organizationId: input.organizationId,
    connectionId: storyblok.connectionId,
  });

  const spaceResult = await client.getSpace(connection.spaceId, { signal: input.signal });
  if (isErr(spaceResult)) {
    throw new Error(spaceResult.error.message);
  }

  const localeMapping = mapProjectLocalesToStoryblok({
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    languages: spaceResult.value.languages,
    configuredTargetLocales: storyblok.targetLocales,
  });

  const syncStates = selectStoryblokPushSyncStates(
    await db
      .select()
      .from(schema.storyblokStorySyncStates)
      .where(eq(schema.storyblokStorySyncStates.automationId, input.automation.id)),
    input.sourcePaths,
  );

  const translationService = new ProjectTranslationService();

  const recordOutcome = (
    storyId: string,
    locale: string,
    status: "translated" | "skipped" | "failed",
    reason?: string,
  ) => {
    if (status === "translated") {
      result.pushedLocales += 1;
    } else if (status === "failed") {
      result.failedLocales += 1;
    } else {
      result.skippedLocales += 1;
    }
    result.outcomes.push({ storyId, locale, status, ...(reason ? { reason } : {}) });
  };

  await mapWithConcurrency(syncStates, STORYBLOK_PUSH_CONCURRENCY, async (syncState) => {
    const latestVersion = await getLatestRepositorySourceFileVersion({
      organizationId: input.organizationId,
      projectId,
      sourcePath: syncState.sourcePath,
    });
    if (!latestVersion?.storedFileId) {
      return;
    }
    const sourceContent = await getStoredFileContent({
      organizationId: input.organizationId,
      projectId,
      fileId: latestVersion.storedFileId,
    });
    const sourceMap = parseStoryblokTranslationMapJson(sourceContent.content.toString("utf8"));

    // Pushing onto a story whose source text changed since import would write
    // translations of the old text. Skip it until the next import.
    const liveSource = await client.exportStory({
      spaceId: syncState.spaceId,
      storyId: syncState.storyId,
      signal: input.signal,
    });
    if (isErr(liveSource)) {
      for (const target of localeMapping.targets) {
        recordOutcome(syncState.storyId, target.projectLocale, "failed", liveSource.error.message);
      }
      return;
    }
    if (
      hashStoryblokTranslationMap(splitStoryblokExport(liveSource.value).strings) !==
      syncState.sourceHash
    ) {
      for (const target of localeMapping.targets) {
        recordOutcome(syncState.storyId, target.projectLocale, "skipped", "source_changed");
      }
      return;
    }

    const pushedLocales: Record<string, string> = {};
    for (const target of localeMapping.targets) {
      if (!target.storyblokLanguage) {
        recordOutcome(
          syncState.storyId,
          target.projectLocale,
          "skipped",
          target.skippedReason ?? "target_locale_unmapped",
        );
        continue;
      }

      try {
        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: syncState.sourcePath,
          targetLocale: target.projectLocale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        const approvedMap = approved.prefilled as Record<string, string>;

        const currentTarget = await client.exportStory({
          spaceId: syncState.spaceId,
          storyId: syncState.storyId,
          langCode: target.storyblokLanguage.code,
          signal: input.signal,
        });
        if (isErr(currentTarget)) {
          recordOutcome(
            syncState.storyId,
            target.projectLocale,
            "failed",
            currentTarget.error.message,
          );
          continue;
        }

        const { payload, changedKeys } = buildStoryblokImportPayload({
          currentTarget: currentTarget.value,
          source: sourceMap,
          approved: approvedMap,
          langCode: target.storyblokLanguage.code,
        });
        if (changedKeys === 0) {
          recordOutcome(syncState.storyId, target.projectLocale, "skipped", "unchanged");
          continue;
        }

        const imported = await client.importStoryTranslation({
          spaceId: syncState.spaceId,
          storyId: syncState.storyId,
          langCode: target.storyblokLanguage.code,
          payload,
          signal: input.signal,
        });
        if (isErr(imported)) {
          recordOutcome(syncState.storyId, target.projectLocale, "failed", imported.error.message);
          continue;
        }

        pushedLocales[target.projectLocale] = new Date().toISOString();
        recordOutcome(syncState.storyId, target.projectLocale, "translated");
      } catch (error) {
        logger.warn(
          {
            storyId: syncState.storyId,
            error: error instanceof Error ? error.message : String(error),
          },
          "storyblok_push_locale_failed",
        );
        recordOutcome(syncState.storyId, target.projectLocale, "failed", "push_failed");
      }
    }

    if (Object.keys(pushedLocales).length > 0) {
      await db
        .update(schema.storyblokStorySyncStates)
        .set({
          lastPushedAt: new Date(),
          pushRecords: sql`${schema.storyblokStorySyncStates.pushRecords} || ${JSON.stringify(pushedLocales)}::jsonb`,
        })
        .where(eq(schema.storyblokStorySyncStates.id, syncState.id));
    }
  });

  return result;
}
