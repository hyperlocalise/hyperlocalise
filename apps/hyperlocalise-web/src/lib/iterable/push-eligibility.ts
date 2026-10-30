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
  pushLocaleHasApprovedTranslations,
  toPushLocaleProgressRow,
  type PushLocaleProgressRow,
} from "@/lib/projects/locale-progress/push-translation-progress";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { selectInScopeIterableMappings } from "./discover-scope";
import { mapProjectLocalesToIterable } from "./locale";

export type IterablePushItem = {
  sourceId: string;
  name: string;
  sourcePath: string;
  resourceKind: "email" | "in_app" | "push" | "sms" | "snippet";
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type IterablePushEligibility = {
  eligibleLocaleCount: number;
  mappedItemCount: number;
  items: IterablePushItem[];
};

async function collectIterablePushLocales(input: {
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

export async function getIterablePushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  includeLocaleProgress?: boolean;
}): Promise<IterablePushEligibility | null> {
  const includeLocaleProgress = input.includeLocaleProgress ?? false;
  const iterable = input.automation.toolConfig.iterable;
  if (!iterable?.enabled) {
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
  const localeMapping = mapProjectLocalesToIterable({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales,
    configuredSourceLocale: iterable.sourceLocale,
  });

  const mappings = selectInScopeIterableMappings(
    await db
      .select()
      .from(schema.iterableTemplateSyncStates)
      .where(
        and(
          eq(schema.iterableTemplateSyncStates.organizationId, input.organizationId),
          eq(schema.iterableTemplateSyncStates.automationId, input.automation.id),
          inArray(schema.iterableTemplateSyncStates.status, ["active", "push_failed"]),
        ),
      ),
    {
      templateIds: iterable.templateIds,
      snippetIds: iterable.snippetIds,
    },
  );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedItemCount = 0;
  const items: IterablePushItem[] = [];

  for (const mapping of mappings) {
    const { eligibleLocales, locales } = await collectIterablePushLocales({
      includeLocaleProgress,
      translationService,
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
      jobTargetLocales: localeMapping.jobTargetLocales,
    });
    eligibleLocaleCount += eligibleLocales.length;
    if (eligibleLocales.length > 0) {
      mappedItemCount += 1;
    }
    items.push({
      sourceId: mapping.sourceId,
      name: mapping.sourceName,
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

export function isIterablePushRunActive(
  runs: ReadonlyArray<{ status: string; inputSnapshot?: Record<string, unknown> | null }>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    return run.inputSnapshot?.operation === "push_approved";
  });
}
