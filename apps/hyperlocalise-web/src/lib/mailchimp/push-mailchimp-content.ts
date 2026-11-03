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

import { formatMailchimpApiError, type MailchimpClient } from "./client";
import { resolveMailchimpCampaignRecreateForCopy } from "./campaign-recreate";
import { loadMailchimpAutomationClient } from "./credentials";
import { isMailchimpRemoteCopyNewer } from "./existing-translation-policy";
import type { MailchimpCampaignRecreateFields } from "./types";
import {
  applyApprovedMailchimpEnvelope,
  hashMailchimpContent,
  restoreMailchimpEnvelopeForPush,
} from "./html-envelope";
import { mailchimpCopyName } from "./locale";

async function readMailchimpCopyUpdatedAt(input: {
  client: MailchimpClient;
  resourceKind: "campaign" | "template";
  copyId: string;
}): Promise<string | null> {
  if (input.resourceKind === "template") {
    const template = await input.client.getTemplate(input.copyId);
    return (
      template.date_edited?.trim() ||
      template.edited_on?.trim() ||
      template.date_created?.trim() ||
      template.created_on?.trim() ||
      null
    );
  }
  const campaign = await input.client.getCampaign(input.copyId);
  return campaign.create_time?.trim() || null;
}

const logger = createLogger("push-mailchimp-content");

export type PushMailchimpContentResult = {
  pushedLocales: number;
  skippedLocales: number;
  failedLocales: number;
  itemsProcessed: number;
  warnings: string[];
};

export function readMailchimpPushSourcePaths(
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

async function persistCopySuccess(
  mapping: typeof schema.mailchimpContentSyncStates.$inferSelect,
  locale: string,
  copyId: string,
  copyName: string,
  contentHash: string,
): Promise<void> {
  await db
    .update(schema.mailchimpContentSyncStates)
    .set({
      localeCopyIds: { ...mapping.localeCopyIds, [locale]: copyId },
      localeCopyNames: { ...mapping.localeCopyNames, [locale]: copyName },
      lastPushContentHash: { ...mapping.lastPushContentHash, [locale]: contentHash },
      lastPushedAt: new Date(),
      status: "active",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.mailchimpContentSyncStates.id, mapping.id));
}

function pushSkipLabel(
  mapping: { sourceName: string; sourcePath: string },
  locale: string,
): string {
  const name = mapping.sourceName?.trim() || mapping.sourcePath;
  return `${name} [${locale}]`;
}

async function resolveCampaignRecreateForPush(input: {
  client: MailchimpClient;
  mapping: typeof schema.mailchimpContentSyncStates.$inferSelect;
}): Promise<MailchimpCampaignRecreateFields | null> {
  const stored = input.mapping.campaignRecreate;
  if (stored?.listId?.trim() && stored?.replyTo?.trim()) {
    return stored;
  }
  if (input.mapping.resourceKind !== "campaign") {
    return null;
  }
  try {
    const campaign = await input.client.getCampaign(input.mapping.sourceId);
    const resolved = await resolveMailchimpCampaignRecreateForCopy(input.client, campaign);
    if (resolved) {
      await db
        .update(schema.mailchimpContentSyncStates)
        .set({ campaignRecreate: resolved, updatedAt: new Date() })
        .where(eq(schema.mailchimpContentSyncStates.id, input.mapping.id));
    }
    return resolved;
  } catch (error) {
    logger.warn(
      { sourceId: input.mapping.sourceId, error: String(error) },
      "mailchimp campaign recreate resolve failed",
    );
    return stored?.listId && stored?.replyTo ? stored : null;
  }
}

async function markPushFailed(id: string, message: string): Promise<void> {
  await db
    .update(schema.mailchimpContentSyncStates)
    .set({
      status: "push_failed",
      lastError: { message },
      updatedAt: new Date(),
    })
    .where(eq(schema.mailchimpContentSyncStates.id, id));
}

async function pushCampaignLocale(input: {
  client: MailchimpClient;
  mapping: typeof schema.mailchimpContentSyncStates.$inferSelect;
  locale: string;
  storedEnvelopeHtml: string;
  approved: Record<string, string>;
  overwriteWhenRemoteNewer: boolean;
  campaignRecreate: MailchimpCampaignRecreateFields | null;
  pushWarning: (message: string) => void;
}): Promise<"pushed" | "skipped"> {
  const recreate = input.campaignRecreate;
  if (!recreate?.listId || !recreate.replyTo) {
    input.pushWarning(
      `${pushSkipLabel(input.mapping, input.locale)}: could not resolve audience list and reply-to for a new Mailchimp campaign — add an audience with campaign defaults in Mailchimp, set list/reply-to on the source campaign, re-import, then push again.`,
    );
    return "skipped";
  }
  const copyName = mailchimpCopyName(input.mapping.sourceName, input.locale);
  const envelope = restoreMailchimpEnvelopeForPush(
    applyApprovedMailchimpEnvelope(input.storedEnvelopeHtml, input.approved),
    input.mapping.htmlMergeTokens ?? [],
  );
  const contentHash = hashMailchimpContent(
    `${envelope.subject}\n${envelope.previewText}\n${envelope.htmlBody}`,
  );
  const lastHash = input.mapping.lastPushContentHash?.[input.locale];
  if (lastHash && lastHash === contentHash) {
    input.pushWarning(
      `${pushSkipLabel(input.mapping, input.locale)}: already pushed this content (no translation changes since the last push).`,
    );
    return "skipped";
  }

  let copyId = input.mapping.localeCopyIds?.[input.locale];
  if (copyId && !input.overwriteWhenRemoteNewer) {
    const copyUpdatedAt = await readMailchimpCopyUpdatedAt({
      client: input.client,
      resourceKind: "campaign",
      copyId,
    });
    if (
      isMailchimpRemoteCopyNewer({
        lastPushedAt: input.mapping.lastPushedAt,
        copyUpdatedAt,
      })
    ) {
      input.pushWarning(
        `${pushSkipLabel(input.mapping, input.locale)}: Mailchimp copy was edited after the last Hyperlocalise push — turn on overwrite when remote is newer, or edit only in Hyperlocalise.`,
      );
      return "skipped";
    }
  }
  if (!copyId) {
    const created = await input.client.createCampaign({
      listId: recreate.listId,
      title: copyName,
      subjectLine: envelope.subject,
      previewText: envelope.previewText,
      fromName: envelope.fromName || recreate.fromName,
      replyTo: recreate.replyTo,
    });
    copyId = created.id;
    await input.client.setCampaignContent(copyId, envelope.htmlBody);
  } else {
    await input.client.setCampaignContent(copyId, envelope.htmlBody);
  }

  await persistCopySuccess(input.mapping, input.locale, copyId, copyName, contentHash);
  return "pushed";
}

async function pushTemplateLocale(input: {
  client: MailchimpClient;
  mapping: typeof schema.mailchimpContentSyncStates.$inferSelect;
  locale: string;
  storedEnvelopeHtml: string;
  approved: Record<string, string>;
  overwriteWhenRemoteNewer: boolean;
  pushWarning: (message: string) => void;
}): Promise<"pushed" | "skipped"> {
  const copyName = mailchimpCopyName(input.mapping.sourceName, input.locale);
  const envelope = restoreMailchimpEnvelopeForPush(
    applyApprovedMailchimpEnvelope(input.storedEnvelopeHtml, input.approved),
    input.mapping.htmlMergeTokens ?? [],
  );
  const contentHash = hashMailchimpContent(envelope.htmlBody);
  const lastHash = input.mapping.lastPushContentHash?.[input.locale];
  if (lastHash && lastHash === contentHash) {
    input.pushWarning(
      `${pushSkipLabel(input.mapping, input.locale)}: already pushed this content (no translation changes since the last push).`,
    );
    return "skipped";
  }

  let copyId = input.mapping.localeCopyIds?.[input.locale];
  if (copyId && !input.overwriteWhenRemoteNewer) {
    const copyUpdatedAt = await readMailchimpCopyUpdatedAt({
      client: input.client,
      resourceKind: "template",
      copyId,
    });
    if (
      isMailchimpRemoteCopyNewer({
        lastPushedAt: input.mapping.lastPushedAt,
        copyUpdatedAt,
      })
    ) {
      input.pushWarning(
        `${pushSkipLabel(input.mapping, input.locale)}: Mailchimp copy was edited after the last Hyperlocalise push — turn on overwrite when remote is newer, or edit only in Hyperlocalise.`,
      );
      return "skipped";
    }
  }
  if (!copyId) {
    const created = await input.client.createTemplate({
      name: copyName,
      html: envelope.htmlBody,
    });
    copyId = String(created.id);
  } else {
    await input.client.updateTemplate(copyId, {
      name: copyName,
      html: envelope.htmlBody,
    });
  }

  await persistCopySuccess(input.mapping, input.locale, copyId, copyName, contentHash);
  return "pushed";
}

export async function runPushMailchimpContent(input: {
  organizationId: string;
  automation: WorkspaceAutomationRecord;
  sourcePaths?: string[];
  workflowRunId?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<PushMailchimpContentResult> {
  const mailchimp = input.automation.toolConfig.mailchimp;
  if (!mailchimp?.enabled || !mailchimp.workosUserId) {
    throw new Error("mailchimp_not_configured");
  }
  const projectId = input.automation.projectId?.trim();
  if (!projectId) {
    throw new Error("mailchimp_project_required");
  }

  const loaded = await loadMailchimpAutomationClient({
    localOrganizationId: input.organizationId,
    workosUserId: mailchimp.workosUserId,
    fetchImpl: input.fetchImpl,
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
    throw new Error("mailchimp_project_required");
  }

  const sourceLocale = mailchimp.sourceLocale?.trim() || project.sourceLocale?.trim() || "en";
  const pushLocales = resolvePushLocales({
    automation: input.automation,
    projectTargetLocales: project.targetLocales ?? [],
    sourceLocale,
  });

  const pathFilter = input.sourcePaths?.length ? new Set(input.sourcePaths) : null;
  const mappings = await db
    .select()
    .from(schema.mailchimpContentSyncStates)
    .where(
      and(
        eq(schema.mailchimpContentSyncStates.organizationId, input.organizationId),
        eq(schema.mailchimpContentSyncStates.automationId, input.automation.id),
        eq(schema.mailchimpContentSyncStates.projectId, projectId),
        inArray(schema.mailchimpContentSyncStates.status, ["active", "push_failed"]),
      ),
    );

  const translationService = new ProjectTranslationService();
  const overwriteWhenRemoteNewer = mailchimp.overwriteWhenRemoteNewer !== false;
  const result: PushMailchimpContentResult = {
    pushedLocales: 0,
    skippedLocales: 0,
    failedLocales: 0,
    itemsProcessed: 0,
    warnings: [],
  };
  const pushWarning = (message: string) => {
    if (result.warnings.length < 20 && !result.warnings.includes(message)) {
      result.warnings.push(message);
    }
  };

  for (const mapping of mappings) {
    if (pathFilter && !pathFilter.has(mapping.sourcePath)) {
      continue;
    }
    result.itemsProcessed += 1;
    const storedEnvelopeHtml = await loadSourceHtml({
      organizationId: input.organizationId,
      projectId,
      sourcePath: mapping.sourcePath,
    });
    if (!storedEnvelopeHtml) {
      result.skippedLocales += pushLocales.length;
      pushWarning(
        `${mapping.sourceName || mapping.sourcePath}: skipped ${pushLocales.length} locale(s) (no imported source file in the project).`,
      );
      continue;
    }

    const campaignRecreate =
      mapping.resourceKind === "campaign"
        ? await resolveCampaignRecreateForPush({
            client: loaded.value.client,
            mapping,
          })
        : null;

    for (const locale of pushLocales) {
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
        pushWarning(
          `${pushSkipLabel(mapping, locale)}: no approved translations ready to push (translate in Jobs and approve strings first).`,
        );
        continue;
      }

      try {
        const outcome =
          mapping.resourceKind === "campaign"
            ? await pushCampaignLocale({
                client: loaded.value.client,
                mapping,
                locale,
                storedEnvelopeHtml,
                approved: approved.prefilled,
                overwriteWhenRemoteNewer,
                campaignRecreate,
                pushWarning,
              })
            : await pushTemplateLocale({
                client: loaded.value.client,
                mapping,
                locale,
                storedEnvelopeHtml,
                approved: approved.prefilled,
                overwriteWhenRemoteNewer,
                pushWarning,
              });
        if (outcome === "pushed") {
          result.pushedLocales += 1;
        } else {
          result.skippedLocales += 1;
        }
      } catch (error) {
        const message = formatMailchimpApiError(error);
        logger.warn(
          { sourcePath: mapping.sourcePath, locale, error: message },
          "mailchimp push locale failed",
        );
        await markPushFailed(mapping.id, message);
        result.failedLocales += 1;
        pushWarning(`${pushSkipLabel(mapping, locale)}: ${message}`);
      }
    }
  }

  return result;
}
