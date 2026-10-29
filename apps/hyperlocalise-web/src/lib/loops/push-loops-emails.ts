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

import { isLoopsLanguageLabelUnsupportedError, type LoopsClient } from "./client";
import { loadLoopsAutomationClient } from "./credentials";
import { resolveCampaignCopy, resolveTransactionalCopy } from "./push-copy-resolution";
import {
  applyLoopsSegmentTranslations,
  hashLoopsContent,
  isLoopsLanguageCodeMismatch,
  loopsEmailCopyName,
  parseLoopsEmailEnvelope,
  toLoopsLanguageCode,
} from "./html-envelope";

const logger = createLogger("push-loops-emails");

export type PushLoopsEmailsResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
  warnings: string[];
};

export function readLoopsPushSourcePaths(
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

function resolvePushLocales(input: {
  automation: WorkspaceAutomationRecord;
  projectTargetLocales: readonly string[];
  sourceLocale: string;
}): string[] {
  const createJob = input.automation.toolConfig.createNativeTmsJob;
  const configured =
    createJob?.useProjectTargetLocales === false && createJob?.targetLocales?.length
      ? createJob.targetLocales
      : [...input.projectTargetLocales];
  return configured
    .map((locale) => locale.trim())
    .filter((locale) => locale && locale.toLowerCase() !== input.sourceLocale.toLowerCase());
}

async function updateCopyEmailMessage(input: {
  client: LoopsClient;
  draftEmailMessageId: string;
  expectedRevisionId: string;
  subject: string;
  previewText?: string;
  languageCode: string;
  lmx: string;
  onLanguageLabelDropped?: (reason: string) => void;
}): Promise<{ storedLanguageCode?: string | null; languageLabelDropped: boolean }> {
  try {
    const updated = await input.client.updateEmailMessage({
      emailMessageId: input.draftEmailMessageId,
      expectedRevisionId: input.expectedRevisionId,
      subject: input.subject,
      previewText: input.previewText,
      languageCode: input.languageCode,
      lmx: input.lmx,
    });
    return { storedLanguageCode: updated.languageCode, languageLabelDropped: false };
  } catch (error) {
    if (isLoopsLanguageLabelUnsupportedError(error)) {
      // Translation may not be enabled for this team; content still lands, language label does not.
      // Keep the rejection reason so the warning tells the operator what to fix.
      const reason = error instanceof Error ? error.message : String(error);
      const updated = await input.client.updateEmailMessage({
        emailMessageId: input.draftEmailMessageId,
        expectedRevisionId: input.expectedRevisionId,
        subject: input.subject,
        previewText: input.previewText,
        lmx: input.lmx,
      });
      input.onLanguageLabelDropped?.(reason);
      return { storedLanguageCode: updated.languageCode, languageLabelDropped: true };
    }
    throw error;
  }
}

function languageLabelDroppedWarning(copyName: string, locale: string, reason?: string): string {
  const suffix = reason ? ` (Loops said: ${reason})` : "";
  return (
    `${copyName}: pushed without a language label because Loops rejected it ` +
    `for ${locale}; enable LLM translation in the Loops dashboard (Settings → Sending), then re-push${suffix}`
  );
}

function warnWhenLanguageLabelMissing(input: {
  storedLanguageCode?: string | null;
  languageLabelDropped: boolean;
  languageCode: string;
  copyName: string;
  locale: string;
  pushWarning: (message: string) => void;
}): void {
  // The update response echoes the stored label. When Loops accepts the write
  // but keeps EN (or leaves the label unset), surface it instead of reporting
  // a clean success — the dashboard picker reads this same field.
  if (
    !input.languageLabelDropped &&
    isLoopsLanguageCodeMismatch(input.storedLanguageCode, input.languageCode)
  ) {
    input.pushWarning(languageLabelDroppedWarning(input.copyName, input.locale));
  }
}

async function pushTransactionalLocale(input: {
  client: LoopsClient;
  mapping: typeof schema.loopsEmailSyncStates.$inferSelect;
  locale: string;
  subject: string;
  previewText?: string;
  lmx: string;
  pushWarning: (message: string) => void;
}): Promise<void> {
  const copyName = loopsEmailCopyName(input.mapping.sourceName, input.locale);
  const languageCode = toLoopsLanguageCode(input.locale);
  const resolved = await resolveTransactionalCopy({
    client: input.client,
    storedCopyId: input.mapping.localeCopyIds?.[input.locale],
    copyName,
    pushWarning: input.pushWarning,
  });
  const copyId = resolved.copyId;
  let draftEmailMessageId = resolved.draftEmailMessageId;
  let expectedRevisionId = resolved.expectedRevisionId;

  if (!copyId) {
    throw new Error("loops_copy_create_failed");
  }
  if (!draftEmailMessageId || !expectedRevisionId) {
    const draft = await input.client.ensureTransactionalDraft(copyId);
    draftEmailMessageId = draft.draftEmailMessageId;
    expectedRevisionId = draft.draftEmailMessageContentRevisionId;
  }
  if (!draftEmailMessageId || !expectedRevisionId) {
    throw new Error("loops_draft_unavailable");
  }
  const update = await updateCopyEmailMessage({
    client: input.client,
    draftEmailMessageId,
    expectedRevisionId,
    subject: input.subject,
    previewText: input.previewText,
    languageCode,
    lmx: input.lmx,
    onLanguageLabelDropped: (reason) =>
      input.pushWarning(languageLabelDroppedWarning(copyName, input.locale, reason)),
  });
  warnWhenLanguageLabelMissing({
    storedLanguageCode: update.storedLanguageCode,
    languageLabelDropped: update.languageLabelDropped,
    languageCode,
    copyName,
    locale: input.locale,
    pushWarning: input.pushWarning,
  });
  await persistCopySuccess(
    input.mapping,
    input.locale,
    copyId,
    copyName,
    hashLoopsContent(input.lmx),
  );
}

async function pushCampaignLocale(input: {
  client: LoopsClient;
  mapping: typeof schema.loopsEmailSyncStates.$inferSelect;
  locale: string;
  subject: string;
  previewText?: string;
  lmx: string;
  pushWarning: (message: string) => void;
}): Promise<void> {
  const copyName = loopsEmailCopyName(input.mapping.sourceName, input.locale);
  const languageCode = toLoopsLanguageCode(input.locale);
  const resolved = await resolveCampaignCopy({
    client: input.client,
    storedCopyId: input.mapping.localeCopyIds?.[input.locale],
    copyName,
    pushWarning: input.pushWarning,
  });
  const copyId = resolved.copyId;
  const emailMessageId = resolved.emailMessageId;
  const expectedRevisionId = resolved.expectedRevisionId;

  if (!copyId || !emailMessageId || !expectedRevisionId) {
    throw new Error("loops_copy_create_failed");
  }
  const update = await updateCopyEmailMessage({
    client: input.client,
    draftEmailMessageId: emailMessageId,
    expectedRevisionId,
    subject: input.subject,
    previewText: input.previewText,
    languageCode,
    lmx: input.lmx,
    onLanguageLabelDropped: (reason) =>
      input.pushWarning(languageLabelDroppedWarning(copyName, input.locale, reason)),
  });
  warnWhenLanguageLabelMissing({
    storedLanguageCode: update.storedLanguageCode,
    languageLabelDropped: update.languageLabelDropped,
    languageCode,
    copyName,
    locale: input.locale,
    pushWarning: input.pushWarning,
  });
  await persistCopySuccess(
    input.mapping,
    input.locale,
    copyId,
    copyName,
    hashLoopsContent(input.lmx),
  );
}

async function persistCopySuccess(
  mapping: typeof schema.loopsEmailSyncStates.$inferSelect,
  locale: string,
  copyId: string,
  copyName: string,
  contentHash: string,
): Promise<void> {
  await db
    .update(schema.loopsEmailSyncStates)
    .set({
      localeCopyIds: { ...mapping.localeCopyIds, [locale]: copyId },
      localeCopyNames: { ...mapping.localeCopyNames, [locale]: copyName },
      lastPushContentHash: { ...mapping.lastPushContentHash, [locale]: contentHash },
      lastPushedAt: new Date(),
      status: "active",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.loopsEmailSyncStates.id, mapping.id));
}

export async function runPushLoopsEmails(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
  workflowRunId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<PushLoopsEmailsResult> {
  const loops = input.automation.toolConfig.loops;
  if (!loops?.enabled || !loops.workosUserId) {
    throw new Error("loops_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("loops_project_required");
  }

  const loaded = await loadLoopsAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: loops.workosUserId,
    fetchImpl: input.fetchImpl,
  });
  if (isErr(loaded)) {
    throw new Error(loaded.error.code);
  }

  const [project] = await db
    .select({
      id: schema.projects.id,
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
    throw new Error("loops_project_required");
  }

  const sourceLocale = loops.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const locales = resolvePushLocales({
    automation: input.automation,
    projectTargetLocales: project.targetLocales ?? [],
    sourceLocale,
  });

  const filters = [
    eq(schema.loopsEmailSyncStates.organizationId, input.organizationId),
    eq(schema.loopsEmailSyncStates.automationId, input.automation.id),
  ];
  if (input.sourcePaths?.length) {
    filters.push(inArray(schema.loopsEmailSyncStates.sourcePath, input.sourcePaths));
  }
  const mappings = await db
    .select()
    .from(schema.loopsEmailSyncStates)
    .where(and(...filters));

  const result: PushLoopsEmailsResult = {
    pushedLocales: 0,
    skippedLocales: 0,
    failedLocales: 0,
    itemsProcessed: mappings.length,
    warnings: [],
  };
  const pushWarning = (message: string) => {
    if (result.warnings.length < 20 && !result.warnings.includes(message)) {
      result.warnings.push(message);
    }
  };
  const translationService = new ProjectTranslationService();

  for (const mapping of mappings) {
    const label = mapping.sourceName || mapping.sourcePath;
    const sourceHtml = await loadSourceHtml({
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
    });
    if (!sourceHtml) {
      result.failedLocales += locales.length;
      pushWarning(`${label}: failed for ${locales.length} locales (no imported source file)`);
      continue;
    }
    const storedSegments = Number(mapping.segmentCount || "0");
    const storedLmx = mapping.sourceLmx || "";
    if (!storedLmx) {
      result.failedLocales += locales.length;
      pushWarning(`${label}: failed for ${locales.length} locales (no stored email content)`);
      continue;
    }

    for (const locale of locales) {
      try {
        const approved = await translationService.loadAsPrefilledEntries({
          organizationId: input.organizationId,
          projectId,
          sourcePath: mapping.sourcePath,
          targetLocale: locale,
          approvedTranslationsOnly: true,
          readyTranslationsOnly: true,
        });
        if (approved.translatedKeyCount === 0 || approved.loadedKeyCount === 0) {
          result.skippedLocales += 1;
          continue;
        }
        const translatedHtml = applyHtmlIngestTranslations(sourceHtml, approved.prefilled);
        const parsed = parseLoopsEmailEnvelope(translatedHtml);
        if (parsed.segments.length !== storedSegments) {
          logger.warn(
            { syncStateId: mapping.id, sourceId: mapping.sourceId, locale },
            "loops push skipped: segment count changed, re-run ingest",
          );
          result.skippedLocales += 1;
          continue;
        }
        const tokensBySegment = (mapping.variableTokens ?? []) as string[][];
        const translatedLmx = applyLoopsSegmentTranslations({
          lmx: storedLmx,
          translatedSegments: parsed.segments,
          tokensBySegment,
        });

        if (mapping.resourceKind === "campaign") {
          await pushCampaignLocale({
            client: loaded.value.client,
            mapping,
            locale,
            subject: parsed.subject,
            previewText: parsed.previewText,
            lmx: translatedLmx,
            pushWarning,
          });
        } else {
          // Transactional copies stay unpublished. Workflow sources also land as
          // unpublished transactional copies named `{workflow} / {email} [{locale}]`
          // because Loops has no safe duplicate-workflow endpoint for live triggers.
          await pushTransactionalLocale({
            client: loaded.value.client,
            mapping,
            locale,
            subject: parsed.subject,
            previewText: parsed.previewText,
            lmx: translatedLmx,
            pushWarning,
          });
        }
        result.pushedLocales += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "push_failed";
        logger.warn(
          { syncStateId: mapping.id, sourceId: mapping.sourceId, locale, error: String(error) },
          "loops push locale failed",
        );
        result.failedLocales += 1;
        pushWarning(`${label} [${locale}]: failed (${message})`);
        await db
          .update(schema.loopsEmailSyncStates)
          .set({
            status: "push_failed",
            lastError: { message },
            updatedAt: new Date(),
          })
          .where(eq(schema.loopsEmailSyncStates.id, mapping.id));
      }
    }
  }

  return result;
}
