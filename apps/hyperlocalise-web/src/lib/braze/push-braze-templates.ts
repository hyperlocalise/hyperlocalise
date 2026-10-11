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
import { createLogger } from "@/lib/log";
import { isErr } from "@/lib/primitives/result/results";
import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { BrazeApiError, listAllBrazeContentBlocks, type BrazeTemplatesClient } from "./client";
import { loadBrazeAutomationClient } from "./credentials";
import {
  hashBrazeContent,
  parseBrazeContentBlockEnvelope,
  parseBrazeEmailEnvelope,
  restoreBrazeContentBlockEnvelope,
  restoreBrazeEmailEnvelope,
} from "./html-envelope";
import { selectInScopeBrazeMappings } from "./discover-locale-copies";
import { mapProjectLocalesToBraze } from "./locale";
import { brazeContentBlockCopyName, brazeEmailCopyName } from "./names";

const logger = createLogger("push-braze-templates");

export type PushBrazeTemplatesResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
};

export function readBrazePushSourcePaths(
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

export function selectBrazePushMappings<T extends { sourcePath: string }>(
  mappings: T[],
  sourcePaths?: readonly string[],
): T[] {
  if (!sourcePaths) {
    return mappings;
  }
  const selected = new Set(sourcePaths.filter((path) => path.trim().length > 0));
  return mappings.filter((mapping) => selected.has(mapping.sourcePath));
}

export const BRAZE_REMOTE_NEWER_SLACK_MS = 5000;

export function shouldSkipUnchangedBrazePush(
  lastHash: string | undefined,
  contentHash: string,
): boolean {
  return lastHash === contentHash;
}

const LAST_PUSHED_AT_BY_LOCALE_KEY = "lastPushedAtByLocale";

function readLastPushedAtByLocale(
  extra: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const raw = extra?.[LAST_PUSHED_AT_BY_LOCALE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const next: Record<string, string> = {};
  for (const [suffix, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      next[suffix] = value;
    }
  }
  return next;
}

export function lastPushedAtForBrazeLocale(
  mapping: {
    lastPushedAt: Date | null;
    extra?: Record<string, unknown> | null;
  },
  suffix: string,
): Date | null {
  const raw = readLastPushedAtByLocale(mapping.extra)[suffix];
  if (raw) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return mapping.lastPushedAt;
}

export function shouldSkipBrazeLocalePush(input: {
  lastHash: string | undefined;
  contentHash: string;
  overwriteWhenRemoteNewer: boolean;
  remoteUpdatedAt?: string;
  lastPushedAt: Date | null;
}): boolean {
  const unchanged = shouldSkipUnchangedBrazePush(input.lastHash, input.contentHash);
  const remoteNewer = isRemoteNewer(input.remoteUpdatedAt, input.lastPushedAt);
  if (unchanged) {
    return !input.overwriteWhenRemoteNewer || !remoteNewer;
  }
  return !input.overwriteWhenRemoteNewer && remoteNewer;
}

export function countMappedBrazeTargetLocales(localeMapping: {
  jobTargetLocales: readonly string[];
  brazeSuffixes: readonly string[];
}): number {
  let count = 0;
  for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
    if (localeMapping.jobTargetLocales[index] && localeMapping.brazeSuffixes[index]) {
      count += 1;
    }
  }
  return count;
}

export function isRemoteNewer(
  remoteUpdatedAt: string | undefined,
  lastPushedAt: Date | null,
): boolean {
  if (!remoteUpdatedAt || !lastPushedAt) {
    return false;
  }
  const remote = new Date(remoteUpdatedAt);
  return (
    !Number.isNaN(remote.getTime()) &&
    remote.getTime() > lastPushedAt.getTime() + BRAZE_REMOTE_NEWER_SLACK_MS
  );
}

type BrazePushCopyResult = { status: "pushed" | "skipped" };

export async function runPushBrazeTemplates(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushBrazeTemplatesResult> {
  const braze = input.automation.toolConfig.braze;
  if (!braze?.enabled || !braze.workosUserId) {
    throw new Error("braze_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("braze_project_required");
  }

  const loaded = await loadBrazeAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: braze.workosUserId,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.code);
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
    throw new Error("braze_native_project_required");
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToBraze({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: braze.sourceLocale,
  });

  const mappings = selectBrazePushMappings(
    selectInScopeBrazeMappings(
      await db
        .select()
        .from(schema.brazeTemplateSyncStates)
        .where(
          and(
            eq(schema.brazeTemplateSyncStates.organizationId, input.organizationId),
            eq(schema.brazeTemplateSyncStates.automationId, input.automation.id),
            inArray(schema.brazeTemplateSyncStates.status, ["active", "push_failed"]),
          ),
        ),
      {
        templateIds: braze.templateIds,
        contentBlockIds: braze.contentBlockIds,
      },
    ),
    input.sourcePaths,
  );

  const result: PushBrazeTemplatesResult = {
    pushedLocales: 0,
    skippedLocales: 0,
    failedLocales: 0,
    itemsProcessed: mappings.length,
  };
  const overwriteWhenRemoteNewer = braze.overwriteWhenRemoteNewer !== false;
  const translationService = new ProjectTranslationService();

  for (const mapping of mappings) {
    const sourceHtml = await loadSourceHtml({
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
    });
    if (!sourceHtml) {
      result.failedLocales += countMappedBrazeTargetLocales(localeMapping);
      continue;
    }

    for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
      const projectLocale = localeMapping.jobTargetLocales[index];
      const suffix = localeMapping.brazeSuffixes[index];
      if (!projectLocale || !suffix) {
        continue;
      }
      try {
        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: projectLocale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        if (approved.translatedKeyCount === 0 || approved.loadedKeyCount === 0) {
          result.skippedLocales += 1;
          continue;
        }
        const translatedHtml = applyHtmlIngestTranslations(sourceHtml, approved.prefilled);
        const contentHash = hashBrazeContent(translatedHtml);
        const lastHash = (mapping.lastPushContentHash ?? {})[suffix];
        if (shouldSkipUnchangedBrazePush(lastHash, contentHash) && !overwriteWhenRemoteNewer) {
          result.skippedLocales += 1;
          continue;
        }

        const copyResult =
          mapping.resourceKind === "email_template"
            ? await pushEmailCopy({
                client: loaded.value.client,
                mapping,
                suffix,
                html: translatedHtml,
                lastHash,
                contentHash,
                overwriteWhenRemoteNewer,
              })
            : await pushContentBlockCopy({
                client: loaded.value.client,
                mapping,
                suffix,
                html: translatedHtml,
                lastHash,
                contentHash,
                overwriteWhenRemoteNewer,
              });
        if (copyResult.status === "skipped") {
          result.skippedLocales += 1;
        } else {
          result.pushedLocales += 1;
        }
      } catch (error) {
        logger.warn(
          {
            sourceId: mapping.sourceId,
            error: error instanceof Error ? error.message : String(error),
          },
          "braze push locale failed",
        );
        result.failedLocales += 1;
        await db
          .update(schema.brazeTemplateSyncStates)
          .set({
            status: "push_failed",
            lastError: { message: error instanceof Error ? error.message : "push_failed" },
            updatedAt: new Date(),
          })
          .where(eq(schema.brazeTemplateSyncStates.id, mapping.id));
      }
    }
  }

  return result;
}

async function loadSourceHtml(input: {
  organizationId: string;
  projectId: string;
  sourcePath: string;
}): Promise<string | null> {
  const latest = await getLatestRepositorySourceFileVersion(input);
  if (!latest) {
    return null;
  }
  const stored = await getStoredFileContent({
    organizationId: input.organizationId,
    projectId: input.projectId,
    fileId: latest.storedFileId,
  });
  return stored.content.toString("utf8");
}

async function pushEmailCopy(input: {
  client: BrazeTemplatesClient;
  mapping: typeof schema.brazeTemplateSyncStates.$inferSelect;
  suffix: string;
  html: string;
  lastHash: string | undefined;
  contentHash: string;
  overwriteWhenRemoteNewer: boolean;
}): Promise<BrazePushCopyResult> {
  const fields = restoreBrazeEmailEnvelope(
    parseBrazeEmailEnvelope(input.html),
    input.mapping.liquidTokens ?? {},
  );
  const copyName = brazeEmailCopyName(input.mapping.sourceName, input.suffix);
  const extra = (input.mapping.extra ?? {}) as {
    shouldInlineCss?: boolean | null;
    tags?: string[];
  };
  let copyId = input.mapping.localeCopyIds?.[input.suffix];
  if (copyId) {
    const unchanged = shouldSkipUnchangedBrazePush(input.lastHash, input.contentHash);
    if (unchanged && !input.overwriteWhenRemoteNewer) {
      return { status: "skipped" };
    }
    if (!input.overwriteWhenRemoteNewer || unchanged) {
      const remote = await input.client.getEmailTemplate(copyId);
      if (
        shouldSkipBrazeLocalePush({
          lastHash: input.lastHash,
          contentHash: input.contentHash,
          overwriteWhenRemoteNewer: input.overwriteWhenRemoteNewer,
          remoteUpdatedAt: remote.updated_at,
          lastPushedAt: lastPushedAtForBrazeLocale(input.mapping, input.suffix),
        })
      ) {
        return { status: "skipped" };
      }
    }
    await input.client.updateEmailTemplate({
      email_template_id: copyId,
      subject: fields.subject,
      body: fields.body,
      plaintext_body: fields.plaintext_body,
      preheader: fields.preheader,
    });
  } else {
    const created = await input.client.createEmailTemplate({
      template_name: copyName,
      subject: fields.subject,
      body: fields.body,
      plaintext_body: fields.plaintext_body,
      preheader: fields.preheader,
      tags: extra.tags,
      should_inline_css: extra.shouldInlineCss ?? undefined,
    });
    copyId = created.email_template_id;
  }
  const contentHash = hashBrazeContent(input.html);
  rememberCopy(input.mapping, input.suffix, copyId, copyName, contentHash);
  await persistCopySuccess(input.mapping, input.suffix, copyId, copyName, contentHash);
  return { status: "pushed" };
}

async function pushContentBlockCopy(input: {
  client: BrazeTemplatesClient;
  mapping: typeof schema.brazeTemplateSyncStates.$inferSelect;
  suffix: string;
  html: string;
  lastHash: string | undefined;
  contentHash: string;
  overwriteWhenRemoteNewer: boolean;
}): Promise<BrazePushCopyResult> {
  const fields = restoreBrazeContentBlockEnvelope(
    parseBrazeContentBlockEnvelope(input.html),
    input.mapping.liquidTokens ?? {},
  );
  const copyName = brazeContentBlockCopyName(input.mapping.sourceName, input.suffix);
  let copyId = input.mapping.localeCopyIds?.[input.suffix];
  if (copyId) {
    const unchanged = shouldSkipUnchangedBrazePush(input.lastHash, input.contentHash);
    if (unchanged && !input.overwriteWhenRemoteNewer) {
      return { status: "skipped" };
    }
    if (!input.overwriteWhenRemoteNewer || unchanged) {
      const remote = await input.client.getContentBlock(copyId);
      if (
        shouldSkipBrazeLocalePush({
          lastHash: input.lastHash,
          contentHash: input.contentHash,
          overwriteWhenRemoteNewer: input.overwriteWhenRemoteNewer,
          remoteUpdatedAt: remote.last_edited,
          lastPushedAt: lastPushedAtForBrazeLocale(input.mapping, input.suffix),
        })
      ) {
        return { status: "skipped" };
      }
    }
    await input.client.updateContentBlock({
      content_block_id: copyId,
      content: fields.content,
    });
  } else {
    try {
      const created = await input.client.createContentBlock({
        name: copyName,
        content: fields.content,
        state: "draft",
      });
      copyId = created.content_block_id;
    } catch (error) {
      if (!(error instanceof BrazeApiError) || error.code !== "braze_name_exists") {
        throw error;
      }
      const existing = await findContentBlockIdByName(input.client, copyName);
      if (!existing) {
        throw error;
      }
      copyId = existing;
      await input.client.updateContentBlock({
        content_block_id: copyId,
        content: fields.content,
      });
    }
  }
  const contentHash = hashBrazeContent(input.html);
  rememberCopy(input.mapping, input.suffix, copyId, copyName, contentHash);
  await persistCopySuccess(input.mapping, input.suffix, copyId, copyName, contentHash);
  return { status: "pushed" };
}

async function findContentBlockIdByName(client: BrazeTemplatesClient, name: string) {
  const blocks = await listAllBrazeContentBlocks(client);
  return blocks.find((block) => block.name === name)?.content_block_id ?? null;
}

function rememberCopy(
  mapping: typeof schema.brazeTemplateSyncStates.$inferSelect,
  suffix: string,
  copyId: string,
  copyName: string,
  contentHash: string,
) {
  const pushedAt = new Date();
  mapping.localeCopyIds = { ...mapping.localeCopyIds, [suffix]: copyId };
  mapping.localeCopyNames = { ...mapping.localeCopyNames, [suffix]: copyName };
  mapping.lastPushContentHash = { ...mapping.lastPushContentHash, [suffix]: contentHash };
  mapping.lastPushedAt = pushedAt;
  mapping.extra = {
    ...mapping.extra,
    [LAST_PUSHED_AT_BY_LOCALE_KEY]: {
      ...readLastPushedAtByLocale(mapping.extra),
      [suffix]: pushedAt.toISOString(),
    },
  };
}

async function persistCopySuccess(
  mapping: typeof schema.brazeTemplateSyncStates.$inferSelect,
  suffix: string,
  copyId: string,
  copyName: string,
  contentHash: string,
) {
  await db
    .update(schema.brazeTemplateSyncStates)
    .set({
      localeCopyIds: { ...mapping.localeCopyIds, [suffix]: copyId },
      localeCopyNames: { ...mapping.localeCopyNames, [suffix]: copyName },
      lastPushContentHash: { ...mapping.lastPushContentHash, [suffix]: contentHash },
      lastPushedAt: mapping.lastPushedAt,
      extra: mapping.extra ?? {},
      status: "active",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.brazeTemplateSyncStates.id, mapping.id));
}
