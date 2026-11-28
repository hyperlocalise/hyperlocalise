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
import { waitForSourceFileVersionIngest } from "@/lib/intercom/wait-for-source-file-ingest";
import { createLogger } from "@/lib/log";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import { isErr } from "@/lib/primitives/result/results";
import { uploadSourceFile } from "@/lib/projects/files/source-file-upload-service";
import {
  createFileTranslationJob,
  enqueueExistingFileTranslationJob,
} from "@/lib/projects/jobs/enqueue-file-translation-job";
import { nextWebflowImportWatermark } from "@/lib/webflow/import-webflow-items";
import { createTranslationJobEventQueue } from "@/lib/workflow/queues";

import type { StoryblokManagementClient } from "./client";
import { STORYBLOK_IMPORT_CONCURRENCY } from "./constants";
import { isStoryblokTranslationExportUnavailable } from "./discover-storyblok-space";
import {
  buildStoryblokStorySourcePath,
  existingStoryblokTranslations,
  hashStoryblokTranslationMap,
  serializeStoryblokTranslationMap,
  splitStoryblokExport,
} from "./document-json";
import { importStoryblokTargetTranslation } from "./import-storyblok-target-translations";
import { loadStoryblokClientForConnection } from "./storyblok-connection-access";
import {
  DEFAULT_STORYBLOK_EXISTING_TRANSLATION_POLICY,
  isStoryblokExistingTranslationPolicy,
} from "./storyblok-existing-translation-policy";
import { mapProjectLocalesToStoryblok, mappedStoryblokTargets } from "./storyblok-locale";
import type { StoryblokStorySummary } from "./types";

const logger = createLogger("import-storyblok-stories");
const jobQueue = createTranslationJobEventQueue();

export type ImportStoryblokStoriesResult = {
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

function parseUpdatedAt(value: string | null | undefined): Date | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Stable key for the folder scope; the watermark resets when it changes. */
export function storyblokImportScopeKey(folderSlugs: readonly string[]): string {
  return folderSlugs.length === 0 ? "*" : folderSlugs.toSorted().join(",");
}

/**
 * Lists every story in scope. Folder slugs are `starts_with` prefixes; a story
 * under two configured folders is returned once.
 */
async function listStoriesInScope(input: {
  client: StoryblokManagementClient;
  spaceId: string;
  folderSlugs: readonly string[];
  signal?: AbortSignal;
}): Promise<StoryblokStorySummary[]> {
  const prefixes =
    input.folderSlugs.length > 0 ? input.folderSlugs.map((slug) => `${slug}/`) : [undefined];
  const byId = new Map<string, StoryblokStorySummary>();
  for (const startsWith of prefixes) {
    let page = 1;
    for (;;) {
      const result = await input.client.listStories({
        spaceId: input.spaceId,
        page,
        startsWith,
        signal: input.signal,
      });
      if (isErr(result)) {
        throw new Error(result.error.message);
      }
      for (const story of result.value.stories) {
        if (!story.isFolder && story.id) {
          byId.set(story.id, story);
        }
      }
      if (result.value.stories.length === 0 || page * result.value.perPage >= result.value.total) {
        break;
      }
      page += 1;
    }
  }
  return [...byId.values()];
}

export async function runImportStoryblokStories(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  workflowRunId?: string;
  signal?: AbortSignal;
}): Promise<ImportStoryblokStoriesResult> {
  const storyblok = input.automation.toolConfig.storyblok;
  const result: ImportStoryblokStoriesResult = {
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

  if (!storyblok?.enabled || !storyblok.connectionId) {
    throw new Error("import_storyblok_stories_not_configured");
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("import_storyblok_stories_project_required");
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
    throw new Error("import_storyblok_stories_project_required");
  }

  const { connection, client } = await loadStoryblokClientForConnection({
    organizationId: input.organizationId,
    connectionId: storyblok.connectionId,
  });
  const spaceId = connection.spaceId;

  const spaceResult = await client.getSpace(spaceId, { signal: input.signal });
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
  for (const target of localeMapping.targets) {
    if (target.skippedReason) {
      result.skippedTargets.push({ locale: target.projectLocale, reason: target.skippedReason });
    }
  }
  const mappedTargets = mappedStoryblokTargets(localeMapping.targets);

  const existingTranslationPolicy = isStoryblokExistingTranslationPolicy(
    storyblok.existingTranslationPolicy,
  )
    ? storyblok.existingTranslationPolicy
    : DEFAULT_STORYBLOK_EXISTING_TRANSLATION_POLICY;

  const folderSlugs =
    storyblok.folderSlugs.length > 0 ? storyblok.folderSlugs : connection.folderSlugs;
  const scopeKey = storyblokImportScopeKey(folderSlugs);

  const [cursorRow] = await db
    .select()
    .from(schema.storyblokSyncCursors)
    .where(eq(schema.storyblokSyncCursors.automationId, input.automation.id))
    .limit(1);
  const previousWatermark =
    cursorRow?.scopeKey === scopeKey ? (cursorRow.watermarkUpdatedAt ?? null) : null;

  const stories = await listStoriesInScope({
    client,
    spaceId,
    folderSlugs,
    signal: input.signal,
  });

  const succeededUpdatedAt: Date[] = [];
  const failedUpdatedAt: Date[] = [];
  let failedWithoutTimestamp = false;
  let exportUnavailable = false;

  await mapWithConcurrency(stories, STORYBLOK_IMPORT_CONCURRENCY, async (story) => {
    const updatedAt = parseUpdatedAt(story.updatedAt);
    // Stories older than the watermark were imported by an earlier run. The
    // hash check below still guards against re-importing unchanged content.
    if (previousWatermark && updatedAt && updatedAt.getTime() < previousWatermark.getTime()) {
      result.skipped += 1;
      return;
    }

    try {
      const exported = await client.exportStory({
        spaceId,
        storyId: story.id,
        signal: input.signal,
      });
      if (isErr(exported)) {
        if (isStoryblokTranslationExportUnavailable(exported.error)) {
          exportUnavailable = true;
        }
        throw new Error(exported.error.message);
      }
      const { strings } = splitStoryblokExport(exported.value);
      if (Object.keys(strings).length === 0) {
        result.skipped += 1;
        if (updatedAt) {
          succeededUpdatedAt.push(updatedAt);
        }
        return;
      }

      const sourcePath = buildStoryblokStorySourcePath({
        spaceId,
        fullSlug: story.fullSlug,
        storyId: story.id,
      });
      const contentHash = hashStoryblokTranslationMap(strings);

      const [existingSync] = await db
        .select()
        .from(schema.storyblokStorySyncStates)
        .where(
          and(
            eq(schema.storyblokStorySyncStates.automationId, input.automation.id),
            eq(schema.storyblokStorySyncStates.storyId, story.id),
          ),
        )
        .limit(1);
      const latestVersion = await getLatestRepositorySourceFileVersion({
        organizationId: input.organizationId,
        projectId,
        sourcePath,
      });
      if (
        existingSync?.sourceHash === contentHash &&
        existingSync.sourcePath === sourcePath &&
        latestVersion !== null
      ) {
        result.skipped += 1;
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
        uploadSurface: "storyblok_automation",
        file: {
          filename: sourcePath.slice(sourcePath.lastIndexOf("/") + 1),
          contentType: "application/json",
          content: Buffer.from(serializeStoryblokTranslationMap(strings), "utf8"),
        },
      });
      if (!uploadResult.ok || uploadResult.value.destination !== "native") {
        throw new Error("storyblok_source_upload_failed");
      }
      const sourceFileId = uploadResult.value.file.id;

      const ingestOutcome = await waitForSourceFileVersionIngest({
        organizationId: input.organizationId,
        sourceFileVersionId: uploadResult.value.file.sourceFileVersionId,
      });
      if (ingestOutcome !== "ingested") {
        throw new Error("storyblok_source_ingest_failed");
      }

      // Seed translations already in Storyblok, honoring the automation's
      // existing-translation policy. Seeding never fails the story import.
      for (const target of mappedTargets) {
        const targetExport = await client.exportStory({
          spaceId,
          storyId: story.id,
          langCode: target.storyblokLanguage.code,
          signal: input.signal,
        });
        if (isErr(targetExport)) {
          logger.warn(
            { status: targetExport.error.status, storyId: story.id },
            "storyblok_target_export_failed",
          );
          result.translationsFailed += 1;
          continue;
        }
        const incomingEntries = existingStoryblokTranslations({
          source: strings,
          target: targetExport.value,
        });
        if (Object.keys(incomingEntries).length === 0) {
          result.translationsSkipped += 1;
          continue;
        }
        const seed = await importStoryblokTargetTranslation({
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

      const jobTargetLocales = mappedTargets.map((entry) => entry.projectLocale);
      if (jobTargetLocales.length > 0 && input.automation.toolConfig.createNativeTmsJob?.enabled) {
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

      const now = new Date();
      await db
        .insert(schema.storyblokStorySyncStates)
        .values({
          organizationId: input.organizationId,
          automationId: input.automation.id,
          spaceId,
          storyId: story.id,
          fullSlug: story.fullSlug,
          sourcePath,
          sourceHash: contentHash,
          lastImportedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            schema.storyblokStorySyncStates.automationId,
            schema.storyblokStorySyncStates.storyId,
          ],
          set: {
            spaceId,
            fullSlug: story.fullSlug,
            sourcePath,
            sourceHash: contentHash,
            lastImportedAt: now,
            updatedAt: now,
          },
        });

      result.imported += 1;
      if (updatedAt) {
        succeededUpdatedAt.push(updatedAt);
      }
    } catch (error) {
      logger.warn(
        { storyId: story.id, error: error instanceof Error ? error.message : String(error) },
        "storyblok_story_import_failed",
      );
      result.failed += 1;
      if (updatedAt) {
        failedUpdatedAt.push(updatedAt);
      } else {
        failedWithoutTimestamp = true;
      }
    }
  });

  if (exportUnavailable && result.imported === 0) {
    throw new Error("storyblok_translation_export_unavailable");
  }

  const watermark = nextWebflowImportWatermark({
    previous: previousWatermark,
    succeededAt: succeededUpdatedAt,
    failedAt: failedUpdatedAt,
    failedWithoutTimestamp,
    collectionFailed: false,
  });

  await db
    .insert(schema.storyblokSyncCursors)
    .values({
      automationId: input.automation.id,
      organizationId: input.organizationId,
      watermarkUpdatedAt: watermark,
      scopeKey,
    })
    .onConflictDoUpdate({
      target: schema.storyblokSyncCursors.automationId,
      set: { watermarkUpdatedAt: watermark, scopeKey, updatedAt: new Date() },
    });

  return result;
}
