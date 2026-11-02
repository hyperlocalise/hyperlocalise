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

import type {
  WorkspaceAutomationRecord,
  WorkspaceAutomationRunRecord,
} from "@/lib/agents/workspace-automation-types";
import { db, schema } from "@/lib/database/client";
import {
  loadPushLocaleTranslationProgress,
  pushLocaleHasApprovedTranslations,
  toPushLocaleProgressRow,
  type PushLocaleProgressRow,
} from "@/lib/projects/locale-progress/push-translation-progress";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import type { HubspotResourceKind } from "./constants";

export type HubspotPushItem = {
  sourceId: string;
  sourcePath: string;
  resourceKind: HubspotResourceKind;
  name: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type HubspotPushEligibility = {
  eligibleLocaleCount: number;
  mappedItemCount: number;
  items: HubspotPushItem[];
};

function resolveEligibleTargetLocales(input: {
  automation: WorkspaceAutomationRecord;
  projectTargetLocales: readonly string[];
  sourceLocale: string;
}): string[] {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  const configured =
    createJob?.useProjectTargetLocales === false && createJob?.targetLocales?.length
      ? createJob.targetLocales
      : [...input.projectTargetLocales];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const locale of configured) {
    const trimmed = locale.trim();
    if (!trimmed || trimmed.toLowerCase() === input.sourceLocale.toLowerCase()) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export async function getHubspotPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  includeLocaleProgress?: boolean;
}): Promise<HubspotPushEligibility | null> {
  const includeLocaleProgress = input.includeLocaleProgress ?? false;
  const hubspot = input.automation.toolConfig.hubspot;
  if (!hubspot?.enabled) {
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
  const sourceLocale = hubspot.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const jobTargetLocales = resolveEligibleTargetLocales({
    automation: input.automation,
    projectTargetLocales,
    sourceLocale,
  });
  const mappings = await db
    .select()
    .from(schema.hubspotContentSyncStates)
    .where(
      and(
        eq(schema.hubspotContentSyncStates.organizationId, input.organizationId),
        eq(schema.hubspotContentSyncStates.automationId, input.automation.id),
        inArray(schema.hubspotContentSyncStates.status, ["active", "push_failed"]),
      ),
    );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: HubspotPushItem[] = [];
  const loadPrefilled = (
    request: Parameters<ProjectTranslationService["loadAsPrefilledEntries"]>[0],
  ) => translationService.loadAsPrefilledEntries(request);

  for (const mapping of mappings) {
    const eligibleLocales: string[] = [];
    const locales: PushLocaleProgressRow[] = [];
    for (const projectLocale of jobTargetLocales) {
      const localeInput = {
        organizationId: input.organizationId,
        projectId,
        sourcePath: mapping.sourcePath,
        targetLocale: projectLocale,
      };
      if (includeLocaleProgress) {
        const localeProgress = await loadPushLocaleTranslationProgress(loadPrefilled, localeInput);
        locales.push(toPushLocaleProgressRow(projectLocale, localeProgress));
        if (localeProgress.approvedKeyCount > 0) {
          eligibleLocales.push(projectLocale);
        }
        continue;
      }
      if (await pushLocaleHasApprovedTranslations(loadPrefilled, localeInput)) {
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
      name: mapping.sourceName || mapping.sourceId,
      status: mapping.status === "push_failed" ? "push_failed" : "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount: jobTargetLocales.length,
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

export function isHubspotPushRunActive(
  runs: ReadonlyArray<Pick<WorkspaceAutomationRunRecord, "status" | "inputSnapshot">>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    const operation = (run.inputSnapshot as { operation?: unknown } | null)?.operation;
    return operation === "push_approved";
  });
}
