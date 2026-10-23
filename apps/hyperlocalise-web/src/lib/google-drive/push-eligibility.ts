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

import { resolveGoogleDrivePushTargetLocales } from "./push-google-drive-translations";

export type GoogleDrivePushFile = {
  driveFileId: string;
  sourcePath: string;
  status: "active" | "push_failed";
  eligibleLocaleCount: number;
  targetLocaleCount: number;
  eligibleLocales: string[];
  locales: PushLocaleProgressRow[];
  lastPushedAt: string | null;
  lastError: string | null;
};

export type GoogleDrivePushEligibility = {
  eligibleLocaleCount: number;
  mappedFileCount: number;
  files: GoogleDrivePushFile[];
};

const EMPTY_GOOGLE_DRIVE_PUSH_ELIGIBILITY: GoogleDrivePushEligibility = {
  eligibleLocaleCount: 0,
  mappedFileCount: 0,
  files: [],
};

function googleDrivePushLastErrorMessage(lastError: Record<string, unknown> | null | undefined) {
  if (!lastError) {
    return null;
  }
  const message = lastError.message;
  return typeof message === "string" && message.trim().length > 0 ? message : null;
}

export async function getGoogleDrivePushEligibility(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
}): Promise<GoogleDrivePushEligibility | null> {
  const googleDrive = input.automation.toolConfig.googleDrive;
  if (!googleDrive?.enabled) {
    return null;
  }

  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    return EMPTY_GOOGLE_DRIVE_PUSH_ELIGIBILITY;
  }

  const [project] = await db
    .select({
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
    return EMPTY_GOOGLE_DRIVE_PUSH_ELIGIBILITY;
  }

  const projectTargetLocales = Array.isArray(project.targetLocales)
    ? project.targetLocales.filter((locale): locale is string => typeof locale === "string")
    : [];
  const targetLocales = resolveGoogleDrivePushTargetLocales(input.automation, projectTargetLocales);
  if (targetLocales.length === 0) {
    return EMPTY_GOOGLE_DRIVE_PUSH_ELIGIBILITY;
  }

  const mappings = await db
    .select()
    .from(schema.googleDriveFileSyncStates)
    .where(
      and(
        eq(schema.googleDriveFileSyncStates.organizationId, input.organizationId),
        eq(schema.googleDriveFileSyncStates.automationId, input.automation.id),
        inArray(schema.googleDriveFileSyncStates.status, ["active", "push_failed"]),
      ),
    );

  const translationService = new ProjectTranslationService();
  let eligibleLocaleCount = 0;
  let mappedFileCount = 0;
  const files: GoogleDrivePushFile[] = [];

  for (const mapping of mappings) {
    const eligibleLocales: string[] = [];
    const locales: PushLocaleProgressRow[] = [];
    for (const projectLocale of targetLocales) {
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
      mappedFileCount += 1;
    }
    files.push({
      driveFileId: mapping.driveFileId,
      sourcePath: mapping.sourcePath,
      status: mapping.status === "push_failed" ? "push_failed" : "active",
      eligibleLocaleCount: eligibleLocales.length,
      targetLocaleCount: targetLocales.length,
      eligibleLocales,
      locales,
      lastPushedAt: mapping.lastPushedAt?.toISOString() ?? null,
      lastError: googleDrivePushLastErrorMessage(mapping.lastError),
    });
  }

  return { eligibleLocaleCount, mappedFileCount, files };
}

export function isGoogleDrivePushRunActive(
  runs: ReadonlyArray<{ status: string; inputSnapshot?: Record<string, unknown> | null }>,
): boolean {
  return runs.some((run) => {
    if (run.status !== "queued" && run.status !== "running") {
      return false;
    }
    return run.inputSnapshot?.operation === "push_approved";
  });
}
