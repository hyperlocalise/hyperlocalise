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

import type { LoopsResourceKind } from "./constants";

export type LoopsPushItem = {
  sourceId: string;
  sourcePath: string;
  resourceKind: LoopsResourceKind;
  name: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type LoopsPushEligibility = {
  eligibleLocaleCount: number;
  mappedItemCount: number;
  items: LoopsPushItem[];
};

async function collectLoopsPushLocales(input: {
  includeLocaleProgress: boolean;
  translationService: ProjectTranslationService;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  jobTargetLocales: readonly string[];
}) {
  const eligibleLocales: string[] = [];
  const locales: PushLocaleProgressRow[] = [];
  const loadPrefilled = (
    request: Parameters<ProjectTranslationService["loadAsPrefilledEntries"]>[0],
  ) => input.translationService.loadAsPrefilledEntries(request);
  for (const projectLocale of input.jobTargetLocales) {
    const localeInput = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      sourcePath: input.sourcePath,
      targetLocale: projectLocale,
    };
    if (input.includeLocaleProgress) {
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
  return { eligibleLocales, locales };
}

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

export async function getLoopsPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  includeLocaleProgress?: boolean;
}): Promise<LoopsPushEligibility | null> {
  const includeLocaleProgress = input.includeLocaleProgress ?? false;
  const loops = input.automation.toolConfig.loops;
  if (!loops?.enabled) {
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
  const sourceLocale = loops.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const jobTargetLocales = resolveEligibleTargetLocales({
    automation: input.automation,
    projectTargetLocales,
    sourceLocale,
  });

  const mappings = await db
    .select()
    .from(schema.loopsEmailSyncStates)
    .where(
      and(
        eq(schema.loopsEmailSyncStates.organizationId, input.organizationId),
        eq(schema.loopsEmailSyncStates.automationId, input.automation.id),
        inArray(schema.loopsEmailSyncStates.status, ["active", "push_failed"]),
      ),
    );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: LoopsPushItem[] = [];

  for (const mapping of mappings) {
    const { eligibleLocales, locales } = await collectLoopsPushLocales({
      includeLocaleProgress,
      translationService,
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
      jobTargetLocales,
    });
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

export function isLoopsPushRunActive(
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
