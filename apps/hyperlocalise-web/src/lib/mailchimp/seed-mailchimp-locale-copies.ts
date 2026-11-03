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
import { createLogger } from "@/lib/log";
import { extractHtmlIngestEntries } from "@/lib/projects/files/html-ingest-entries";
import {
  importApprovedProjectTranslationsFromEntries,
  ProjectTranslationService,
} from "@/lib/projects/translations/project-translation-service";

import type { MailchimpClient } from "./client";
import type { MailchimpResourceKind } from "./constants";
import {
  decideMailchimpExistingTranslationAction,
  mailchimpTranslationPresence,
  type MailchimpExistingTranslationPolicy,
} from "./existing-translation-policy";
import { hashMailchimpContent, serializeMailchimpEnvelope } from "./html-envelope";
import { mailchimpCopyName } from "./locale";

const logger = createLogger("seed-mailchimp-locale-copies");

async function loadLocalePresence(input: {
  translationService: ProjectTranslationService;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  targetLocale: string;
  importedHash?: string;
}) {
  const sourceFile = await input.translationService.getRepositorySourceFileByPath({
    organizationId: input.organizationId,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
  });
  if (!sourceFile) {
    return {
      presence: mailchimpTranslationPresence({
        importedHash: input.importedHash,
        translatedKeyCount: 0,
      }),
      sourceKeyCount: 0,
    };
  }
  const keys = await input.translationService.listKeysForFile({
    organizationId: input.organizationId,
    projectId: input.projectId,
    repositorySourceFileId: sourceFile.id,
    targetLocale: input.targetLocale,
  });
  const translations = await input.translationService.getTranslationsByKeyIds({
    organizationId: input.organizationId,
    projectId: input.projectId,
    translationKeyIds: keys.map((key) => key.id),
    targetLocale: input.targetLocale,
  });
  return {
    presence: mailchimpTranslationPresence({
      importedHash: input.importedHash,
      translatedKeyCount: translations.filter((row) => (row.text ?? "").trim().length > 0).length,
      provenances: translations.map((row) => row.provenance),
    }),
    sourceKeyCount: keys.filter((key) => !key.isHidden).length,
  };
}

async function loadCopyEnvelopeHtml(input: {
  client: MailchimpClient;
  resourceKind: MailchimpResourceKind;
  copyId: string;
}): Promise<string | null> {
  if (input.resourceKind === "campaign") {
    const [campaign, content] = await Promise.all([
      input.client.getCampaign(input.copyId),
      input.client.getCampaignContent(input.copyId),
    ]);
    const html = content.html?.trim() ?? "";
    if (!html) {
      return null;
    }
    const envelope = serializeMailchimpEnvelope({
      subject: campaign.settings.subject_line ?? "",
      previewText: campaign.settings.preview_text,
      fromName: campaign.settings.from_name,
      html,
    });
    return envelope.html;
  }
  const template = await input.client.getTemplate(input.copyId);
  const html = template.html?.trim() ?? "";
  if (!html) {
    return null;
  }
  const envelope = serializeMailchimpEnvelope({
    subject: template.name,
    html,
  });
  return envelope.html;
}

export async function seedMailchimpLocaleCopies(input: {
  client: MailchimpClient;
  organizationId: string;
  projectId: string;
  sourcePath: string;
  sourceName: string;
  resourceKind: MailchimpResourceKind;
  targetLocales: readonly string[];
  policy: MailchimpExistingTranslationPolicy;
  campaignByTitle: ReadonlyMap<string, string>;
  templateByName: ReadonlyMap<string, string>;
}): Promise<{
  seeded: number;
  skipped: number;
  failed: number;
  localeCopyIds: Record<string, string>;
}> {
  let seeded = 0;
  let skipped = 0;
  let failed = 0;
  const localeCopyIds: Record<string, string> = {};
  const translationService = new ProjectTranslationService();

  for (const locale of input.targetLocales) {
    const copyName = mailchimpCopyName(input.sourceName, locale);
    const copyId =
      input.resourceKind === "campaign"
        ? input.campaignByTitle.get(copyName)
        : input.templateByName.get(copyName);
    if (!copyId) {
      skipped += 1;
      continue;
    }
    localeCopyIds[locale] = copyId;

    try {
      const envelopeHtml = await loadCopyEnvelopeHtml({
        client: input.client,
        resourceKind: input.resourceKind,
        copyId,
      });
      if (!envelopeHtml) {
        skipped += 1;
        continue;
      }
      const incomingHash = hashMailchimpContent(envelopeHtml);
      const loadedPresence = await loadLocalePresence({
        translationService,
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: locale,
        importedHash: incomingHash,
      });
      const action = decideMailchimpExistingTranslationAction({
        policy: input.policy,
        incomingHash,
        presence: loadedPresence.presence,
      });
      if (action === "skip") {
        skipped += 1;
        continue;
      }
      const seededResult = await importApprovedProjectTranslationsFromEntries({
        organizationId: input.organizationId,
        projectId: input.projectId,
        sourcePath: input.sourcePath,
        targetLocale: locale,
        entries: extractHtmlIngestEntries(envelopeHtml),
      });
      if (seededResult.imported > 0) {
        seeded += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      logger.warn(
        { copyId, locale, error: error instanceof Error ? error.message : String(error) },
        "mailchimp locale copy seed failed",
      );
      failed += 1;
    }
  }

  return { seeded, skipped, failed, localeCopyIds };
}
