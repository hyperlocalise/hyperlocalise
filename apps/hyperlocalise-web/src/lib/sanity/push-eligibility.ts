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
import {
  loadPushLocaleTranslationProgress,
  toPushLocaleProgressRow,
  type PushLocaleProgressRow,
} from "@/lib/projects/locale-progress/push-translation-progress";
import { ProjectTranslationService } from "@/lib/projects/translations/project-translation-service";

import { parseSanityTranslationMapJson, readSanityTranslationMap } from "./document-json";
import { isSanityPluginSourcePath } from "./segment-file";
import { sourceKeysMissingApprovedTranslations } from "./push-sanity-translations";
import { isSanityLocaleSupportedForDocumentType } from "./locale-catalog";
import type { SanityFieldValue } from "./sanity-field-value";
import { mapProjectLocalesToSanity } from "./sanity-locale";
import { sanityMappingMatchesTarget } from "./sanity-sync-scope";

export type SanityPushDocument = {
  documentId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type SanityPushEligibility = {
  eligibleLocaleCount: number;
  mappedDocumentCount: number;
  documents: SanityPushDocument[];
};

const EMPTY_SANITY_PUSH_ELIGIBILITY: SanityPushEligibility = {
  eligibleLocaleCount: 0,
  mappedDocumentCount: 0,
  documents: [],
};

function sanityPushLastErrorMessage(lastError: object | null | undefined) {
  if (!lastError || !("message" in lastError)) {
    return null;
  }
  const message = (lastError as { message?: SanityFieldValue }).message;
  return typeof message === "string" && message.trim().length > 0 ? message : null;
}

export async function getSanityPushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<SanityPushEligibility | null> {
  const sanity = input.automation.toolConfig.sanity;
  if (!sanity?.enabled) {
    return null;
  }

  const projectId = input.automation.projectId?.trim();
  const sanityProjectId = sanity.projectId?.trim();
  const dataset = sanity.dataset?.trim();
  if (!projectId || !sanityProjectId || !dataset) {
    return EMPTY_SANITY_PUSH_ELIGIBILITY;
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
    return EMPTY_SANITY_PUSH_ELIGIBILITY;
  }

  const sanityLanguages =
    sanity.languages.length > 0
      ? sanity.languages
      : sanity.targetLocales.concat(sanity.sourceLocale);
  const localeMapping = mapProjectLocalesToSanity({
    projectSourceLocale: project.sourceLocale ?? "en",
    projectTargetLocales: Array.isArray(project.targetLocales)
      ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
      : [],
    intercomLocales: sanityLanguages,
    configuredSourceLocale: sanity.sourceLocale,
    configuredTargetLocales: sanity.targetLocales.length > 0 ? sanity.targetLocales : undefined,
  });

  if (localeMapping.jobTargetLocales.length === 0) {
    return EMPTY_SANITY_PUSH_ELIGIBILITY;
  }

  const mappings = (
    await db
      .select()
      .from(schema.sanityDocumentSyncStates)
      .where(
        and(
          eq(schema.sanityDocumentSyncStates.organizationId, input.organizationId),
          eq(schema.sanityDocumentSyncStates.automationId, input.automation.id),
          inArray(schema.sanityDocumentSyncStates.status, ["active", "push_failed"]),
        ),
      )
  ).filter((mapping) =>
    sanityMappingMatchesTarget(mapping, {
      projectId,
      sanityProjectId,
      dataset,
    }),
  );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedDocumentCount = 0;
  const documents: SanityPushDocument[] = [];

  for (const mapping of mappings) {
    if (isSanityPluginSourcePath(mapping.sourcePath)) {
      continue;
    }
    const latest = await getLatestRepositorySourceFileVersion({
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
    });
    let sourceKeys: string[] = [];
    if (latest?.storedFileId) {
      const stored = await getStoredFileContent({
        organizationId: input.organizationId,
        projectId,
        fileId: latest.storedFileId,
      });
      sourceKeys = Object.keys(parseSanityTranslationMapJson(stored.content.toString("utf8")));
    }

    const eligibleLocales: string[] = [];
    const locales: PushLocaleProgressRow[] = [];
    for (let index = 0; index < localeMapping.jobTargetLocales.length; index += 1) {
      const projectLocale = localeMapping.jobTargetLocales[index]!;
      const sanityLocale = localeMapping.intercomTargetLocales[index];
      if (sourceKeys.length === 0) {
        continue;
      }
      if (
        !sanityLocale ||
        !isSanityLocaleSupportedForDocumentType({
          sanityLocale,
          documentType: mapping.documentType,
          languagesByType: sanity.languagesByType ?? {},
          fallbackLanguages: sanityLanguages,
        })
      ) {
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
      const approvedMap = readSanityTranslationMap(localeProgress.approvedPrefilled);
      if (sourceKeysMissingApprovedTranslations(sourceKeys, approvedMap) === 0) {
        eligibleLocales.push(projectLocale);
      }
    }

    eligibleLocaleCount += eligibleLocales.length;
    if (eligibleLocales.length > 0) {
      mappedDocumentCount += 1;
    }

    documents.push({
      documentId: mapping.documentId,
      sourcePath: mapping.sourcePath,
      status: mapping.status === "push_failed" ? "push_failed" : "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount: localeMapping.jobTargetLocales.length,
      eligibleLocales,
      locales,
      lastPushedAt: mapping.lastPushedAt?.toISOString() ?? null,
      lastError: sanityPushLastErrorMessage(mapping.lastError),
    });
  }

  return { eligibleLocaleCount, mappedDocumentCount, documents };
}

export function isSanityPushRunActive(
  runs: ReadonlyArray<{ status: string; inputSnapshot?: object | null }>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    if (!run.inputSnapshot || !("operation" in run.inputSnapshot)) {
      return false;
    }
    const operation = (run.inputSnapshot as { operation?: SanityFieldValue }).operation;
    return operation === "push_approved";
  });
}
