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
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { mapProjectLocalesToBraze } from "./locale";

export type BrazePushItem = {
  sourceId: string;
  sourcePath: string;
  resourceKind: "email_template" | "content_block";
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
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

  const mappings = await db
    .select()
    .from(schema.brazeTemplateSyncStates)
    .where(
      and(
        eq(schema.brazeTemplateSyncStates.organizationId, input.organizationId),
        eq(schema.brazeTemplateSyncStates.automationId, input.automation.id),
        inArray(schema.brazeTemplateSyncStates.status, ["active", "push_failed"]),
      ),
    );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: BrazePushItem[] = [];

  for (const mapping of mappings) {
    const eligibleLocales: string[] = [];
    for (const projectLocale of localeMapping.jobTargetLocales) {
      const approved = await translationService.loadAsPrefilledEntries({
        organizationId: input.organizationId,
        projectId,
        sourcePath: mapping.sourcePath,
        targetLocale: projectLocale,
        approvedTranslationsOnly: true,
        readyTranslationsOnly: true,
      });
      if (approved.translatedKeyCount > 0) {
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
