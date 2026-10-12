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
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { brazePermissionNameFromError, type BrazeTemplatesClient } from "./client";
import { loadBrazeAutomationClient } from "./credentials";
import { mapProjectLocalesToBraze } from "./locale";
import {
  readBrazePushSourcePaths,
  selectBrazePushMappings,
  shouldSkipBrazeLocalePush,
} from "./push-braze-templates";
import {
  hashBrazeTranslationMap,
  parseBrazeTranslationMapJson,
  readBrazeTranslationMap,
} from "./translation-map";

const logger = createLogger("push-braze-campaigns");

export type PushBrazeCampaignsResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
};

export { readBrazePushSourcePaths, selectBrazePushMappings };

function permissionErrorMessage(error: unknown): string {
  const permission = brazePermissionNameFromError(error);
  if (permission) {
    return `This API key is missing Braze permission ${permission}.`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function runPushBrazeCampaigns(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
}): Promise<PushBrazeCampaignsResult> {
  const config = input.automation.toolConfig.brazeCampaigns;
  if (!config?.enabled) {
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
  }

  const loaded = await loadBrazeAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: config.workosUserId,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.message);
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
    return { pushedLocales: 0, skippedLocales: 0, failedLocales: 0, itemsProcessed: 0 };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToBraze({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: config.sourceLocale,
  });

  const mappings = selectBrazePushMappings(
    await db
      .select()
      .from(schema.brazeCampaignSyncStates)
      .where(
        and(
          eq(schema.brazeCampaignSyncStates.organizationId, input.organizationId),
          eq(schema.brazeCampaignSyncStates.automationId, input.automation.id),
          inArray(schema.brazeCampaignSyncStates.status, ["active", "push_failed"]),
        ),
      ),
    input.sourcePaths,
  );

  const translationService = new ProjectTranslationService();
  let pushedLocales = 0;
  let skippedLocales = 0;
  let failedLocales = 0;
  let itemsProcessed = 0;

  for (const mapping of mappings) {
    itemsProcessed += 1;
    const lastPushHashes = { ...mapping.lastPushContentHash };
    let lastError: Record<string, unknown> | null = null;
    let status: "active" | "push_failed" = "active";

    for (const projectLocale of localeMapping.jobTargetLocales) {
      const localeId = mapping.localeIds[projectLocale];
      if (!localeId) {
        skippedLocales += 1;
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
        if (approved.translatedKeyCount === 0) {
          skippedLocales += 1;
          continue;
        }

        const latest = await getLatestRepositorySourceFileVersion({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
        });
        const stored =
          latest == null
            ? null
            : await getStoredFileContent({
                organizationId: input.organizationId,
                projectId,
                fileId: latest.storedFileId,
              });
        const sourceMap = parseBrazeTranslationMapJson(stored?.content.toString("utf8") ?? "");
        const translationMap = {
          ...sourceMap,
          ...approved.prefilled,
        };
        const contentHash = hashBrazeTranslationMap(readBrazeTranslationMap(translationMap));
        const remote = await loadRemoteTranslation({
          mapping,
          localeId,
          client: loaded.value.client,
        });
        if (
          shouldSkipBrazeLocalePush({
            lastHash: lastPushHashes[projectLocale],
            contentHash,
            overwriteWhenRemoteNewer: config.overwriteWhenRemoteNewer !== false,
            remoteUpdatedAt: remote.updatedAt,
            lastPushedAt: mapping.lastPushedAt,
          })
        ) {
          skippedLocales += 1;
          continue;
        }

        if (mapping.resourceKind === "campaign" && mapping.campaignId) {
          await loaded.value.client.updateCampaignTranslation({
            campaignId: mapping.campaignId,
            messageVariationId: mapping.messageVariationId,
            localeId,
            translationMap,
          });
        } else if (mapping.workflowId && mapping.stepId) {
          await loaded.value.client.updateCanvasTranslation({
            workflowId: mapping.workflowId,
            stepId: mapping.stepId,
            messageVariationId: mapping.messageVariationId,
            localeId,
            translationMap,
          });
        } else {
          skippedLocales += 1;
          continue;
        }
        lastPushHashes[projectLocale] = contentHash;
        pushedLocales += 1;
      } catch (error) {
        logger.warn({ error: permissionErrorMessage(error) }, "braze campaign push failed");
        failedLocales += 1;
        status = "push_failed";
        lastError = { message: permissionErrorMessage(error) };
      }
    }

    await db
      .update(schema.brazeCampaignSyncStates)
      .set({
        lastPushContentHash: lastPushHashes,
        lastPushedAt: pushedLocales > 0 ? new Date() : mapping.lastPushedAt,
        status,
        lastError,
        updatedAt: new Date(),
      })
      .where(eq(schema.brazeCampaignSyncStates.id, mapping.id));
  }

  return { pushedLocales, skippedLocales, failedLocales, itemsProcessed };
}

async function loadRemoteTranslation(input: {
  mapping: typeof schema.brazeCampaignSyncStates.$inferSelect;
  localeId: string;
  client: BrazeTemplatesClient;
}): Promise<{ updatedAt?: string }> {
  try {
    const translations =
      input.mapping.resourceKind === "campaign" && input.mapping.campaignId
        ? await input.client.getCampaignTranslations({
            campaignId: input.mapping.campaignId,
            messageVariationId: input.mapping.messageVariationId,
            localeId: input.localeId,
            postLaunchDraftVersion: true,
          })
        : input.mapping.workflowId && input.mapping.stepId
          ? await input.client.getCanvasTranslations({
              workflowId: input.mapping.workflowId,
              stepId: input.mapping.stepId,
              messageVariationId: input.mapping.messageVariationId,
              localeId: input.localeId,
              postLaunchDraftVersion: true,
            })
          : [];
    const match = translations.find((entry) => entry.locale.uuid === input.localeId);
    return { updatedAt: match ? undefined : undefined };
  } catch {
    return {};
  }
}
