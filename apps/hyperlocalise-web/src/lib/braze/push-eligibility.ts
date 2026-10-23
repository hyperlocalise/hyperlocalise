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
  loadPushLocaleTranslationProgress,
  toPushLocaleProgressRow,
  type PushLocaleProgressRow,
} from "@/lib/projects/locale-progress/push-translation-progress";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import {
  selectInScopeBrazeCampaignMappings,
  selectInScopeBrazeMappings,
} from "./discover-locale-copies";
import { mapProjectLocalesToBraze } from "./locale";

export type BrazePushItem = {
  sourceId: string;
  sourcePath: string;
  resourceKind: "email_template" | "content_block" | "campaign" | "canvas_step";
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type BrazePushEligibility = {
  eligibleLocaleCount: number;
  mappedItemCount: number;
  items: BrazePushItem[];
};

export async function getBrazePushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<BrazePushEligibility | null> {
  const braze = input.automation.toolConfig.braze;
  if (!braze?.enabled) {
    return null;
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return null;
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
    return { eligibleLocaleCount: 0, mappedItemCount: 0, items: [] };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToBraze({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: braze.sourceLocale,
  });

  const mappings = selectInScopeBrazeMappings(
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
  );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: BrazePushItem[] = [];

  for (const mapping of mappings) {
    const eligibleLocales: string[] = [];
    const locales: PushLocaleProgressRow[] = [];
    for (const projectLocale of localeMapping.jobTargetLocales) {
      const localeProgress = await loadPushLocaleTranslationProgress(
        (request) => translationService.loadAsPrefilledEntries(request),
        {
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: projectLocale,
        },
      );
      locales.push(toPushLocaleProgressRow(projectLocale, localeProgress));
      if (localeProgress.approvedKeyCount > 0) {
        eligibleLocales.push(projectLocale);
      }
    }
    eligibleLocaleCount += eligibleLocales.length;
    if (eligibleLocales.length > 0) {
      mappedItemCount += 1;
    }
    items.push({
      sourceId: mapping.sourceId,
      sourcePath: mapping.sourcePath,
      resourceKind: mapping.resourceKind,
      status: mapping.status === "push_failed" ? "push_failed" : "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount: localeMapping.jobTargetLocales.length,
      eligibleLocales,
      locales,
      lastPushedAt: mapping.lastPushedAt?.toISOString() ?? null,
      lastError:
        mapping.lastError && typeof mapping.lastError.message === "string"
          ? mapping.lastError.message
          : null,
    });
  }

  return { eligibleLocaleCount, mappedItemCount, items };
}

export async function getBrazeCampaignPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<BrazePushEligibility | null> {
  const braze = input.automation.toolConfig.brazeCampaigns;
  if (!braze?.enabled) {
    return null;
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return null;
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
    return { eligibleLocaleCount: 0, mappedItemCount: 0, items: [] };
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const localeMapping = mapProjectLocalesToBraze({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: braze.sourceLocale,
  });

  const mappings = selectInScopeBrazeCampaignMappings(
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
    {
      campaignIds: braze.campaignIds,
      canvasIds: braze.canvasIds,
    },
  );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: BrazePushItem[] = [];

  for (const mapping of mappings) {
    const eligibleLocales: string[] = [];
    const locales: PushLocaleProgressRow[] = [];
    for (const projectLocale of localeMapping.jobTargetLocales) {
      if (!mapping.localeIds[projectLocale]) {
        continue;
      }
      const localeProgress = await loadPushLocaleTranslationProgress(
        (request) => translationService.loadAsPrefilledEntries(request),
        {
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: projectLocale,
        },
      );
      locales.push(toPushLocaleProgressRow(projectLocale, localeProgress));
      if (localeProgress.approvedKeyCount > 0) {
        eligibleLocales.push(projectLocale);
      }
    }
    eligibleLocaleCount += eligibleLocales.length;
    if (eligibleLocales.length > 0) {
      mappedItemCount += 1;
    }
    items.push({
      sourceId: mapping.sourceId,
      sourcePath: mapping.sourcePath,
      resourceKind: mapping.resourceKind,
      status: mapping.status === "push_failed" ? "push_failed" : "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount: localeMapping.jobTargetLocales.length,
      eligibleLocales,
      locales,
      lastPushedAt: mapping.lastPushedAt?.toISOString() ?? null,
      lastError:
        mapping.lastError && typeof mapping.lastError.message === "string"
          ? mapping.lastError.message
          : null,
    });
  }

  return { eligibleLocaleCount, mappedItemCount, items };
}

export function isBrazePushRunActive(
  runs: ReadonlyArray<{ status: string; inputSnapshot?: Record<string, unknown> | null }>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    return run.inputSnapshot?.operation === "push_approved";
  });
}

export function isBrazeAutomationRunActive(runs: ReadonlyArray<{ status: string }>): boolean {
  return runs.some((run) => run.status === "queued" || run.status === "running");
}
