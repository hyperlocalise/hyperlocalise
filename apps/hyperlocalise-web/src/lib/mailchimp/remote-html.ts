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

import { loadFirstAudienceDefaults } from "./campaign-recreate";
import type { MailchimpCampaignSummary, MailchimpClient, MailchimpTemplateDetail } from "./client";
import type { MailchimpResourceKind } from "./constants";
import type { MailchimpRemoteCopyFields } from "./html-envelope";

export type MailchimpCampaignContentPayload = {
  html?: string;
  archive_html?: string;
  variate_contents?: Array<{ html?: string }>;
};

export function resolveCampaignHtml(content: MailchimpCampaignContentPayload): string {
  const primary = content.html?.trim();
  if (primary) {
    return primary;
  }
  const archive = content.archive_html?.trim();
  if (archive) {
    return archive;
  }
  for (const variate of content.variate_contents ?? []) {
    const html = variate.html?.trim();
    if (html) {
      return html;
    }
  }
  return "";
}

function looksLikeHtmlFragment(value: string): boolean {
  return (
    value.includes("<") ||
    value.includes("&lt;") ||
    value.includes("<!") ||
    value.toLowerCase().includes("<html")
  );
}

export function htmlFromTemplateSections(sections: unknown): string {
  if (!sections || typeof sections !== "object") {
    return "";
  }
  const chunks: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }
      // Top-level section values are editable defaults; Mailchimp may entity-encode them.
      if (depth === 0 || looksLikeHtmlFragment(trimmed)) {
        chunks.push(trimmed);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    for (const key of ["html", "content", "default", "value"] as const) {
      const field = record[key];
      if (typeof field === "string") {
        const trimmed = field.trim();
        if (trimmed) {
          chunks.push(trimmed);
        }
      }
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === "html" || key === "content" || key === "default" || key === "value") {
        continue;
      }
      visit(child, depth + 1);
    }
  };

  if (Array.isArray(sections)) {
    for (const item of sections) {
      visit(item, 0);
    }
  } else {
    for (const child of Object.values(sections as Record<string, unknown>)) {
      visit(child, 0);
    }
  }
  return chunks.join("\n");
}

function firstNonEmptyHtml(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim() ?? "";
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

async function htmlFromCampaignsUsingTemplate(
  client: MailchimpClient,
  templateId: string,
  campaigns: readonly MailchimpCampaignSummary[],
): Promise<string> {
  const wanted = String(templateId);
  for (const campaign of campaigns) {
    if (String(campaign.settings.template_id ?? "") !== wanted) {
      continue;
    }
    const content = await client.getCampaignContent(campaign.id).catch(() => null);
    const html = content ? resolveCampaignHtml(content) : "";
    if (html) {
      return html;
    }
  }
  return "";
}

/** Mailchimp 3.0 does not return raw HTML for most templates. Render onto a draft, then delete it. */
async function htmlFromTemporaryCampaign(
  client: MailchimpClient,
  templateId: string,
): Promise<string> {
  const numericId = Number(templateId);
  if (!Number.isFinite(numericId)) {
    return "";
  }
  const audience = await loadFirstAudienceDefaults(client);
  const replyTo = audience?.defaults.from_email?.trim() ?? "";
  if (!audience || !replyTo) {
    return "";
  }
  const created = await client
    .createCampaign({
      listId: audience.listId,
      title: `HL template preview ${templateId}`,
      subjectLine: "HL template preview",
      fromName: audience.defaults.from_name?.trim() || "Hyperlocalise",
      replyTo,
      templateId: numericId,
    })
    .catch(() => null);
  if (!created?.id) {
    return "";
  }
  try {
    await client.applyCampaignTemplate(created.id, numericId).catch(() => undefined);
    const content = await client.getCampaignContent(created.id);
    return resolveCampaignHtml(content);
  } catch {
    return "";
  } finally {
    await client.deleteCampaign(created.id).catch(() => undefined);
  }
}

/** Live locale-copy fields used as the push merge base. */
export async function loadMailchimpCopyRemoteFields(input: {
  client: MailchimpClient;
  resourceKind: MailchimpResourceKind;
  copyId: string;
}): Promise<MailchimpRemoteCopyFields | null> {
  if (input.resourceKind === "campaign") {
    const [campaign, content] = await Promise.all([
      input.client.getCampaign(input.copyId),
      input.client.getCampaignContent(input.copyId),
    ]);
    const html = resolveCampaignHtml(content);
    if (!html) {
      return null;
    }
    return {
      subject: campaign.settings.subject_line ?? "",
      previewText: campaign.settings.preview_text,
      fromName: campaign.settings.from_name,
      html,
    };
  }

  const template = await input.client.getTemplate(input.copyId);
  const html = template.html?.trim() ?? "";
  if (!html) {
    return null;
  }
  return {
    subject: template.name,
    html,
  };
}

export async function resolveTemplateHtml(
  client: MailchimpClient,
  templateId: string,
  detail?: MailchimpTemplateDetail,
  campaigns: readonly MailchimpCampaignSummary[] = [],
): Promise<string> {
  const meta = detail ?? (await client.getTemplate(templateId));
  const fromMeta = firstNonEmptyHtml(meta.html, htmlFromTemplateSections(meta.sections));
  if (fromMeta) {
    return fromMeta;
  }
  const defaults = await client.getTemplateDefaultContent(templateId).catch(() => null);
  const fromDefaults = firstNonEmptyHtml(
    defaults?.html,
    defaults?.archive_html,
    htmlFromTemplateSections(defaults?.sections),
    htmlFromTemplateSections(defaults),
  );
  if (fromDefaults) {
    return fromDefaults;
  }
  const fromExistingCampaign = await htmlFromCampaignsUsingTemplate(client, templateId, campaigns);
  if (fromExistingCampaign) {
    return fromExistingCampaign;
  }
  return htmlFromTemporaryCampaign(client, templateId);
}
