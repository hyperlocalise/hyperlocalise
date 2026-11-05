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

import type {
  MailchimpAudienceCampaignDefaults,
  MailchimpCampaignSummary,
  MailchimpClient,
} from "./client";
import type { MailchimpCampaignRecreateFields } from "./types";

export type { MailchimpAudienceCampaignDefaults };

export function resolveCampaignRecreateFields(input: {
  campaign: MailchimpCampaignSummary;
  audienceDefaults?: MailchimpAudienceCampaignDefaults | null;
}): MailchimpCampaignRecreateFields | null {
  const listId = input.campaign.recipients?.list_id?.trim() || "";
  const replyTo =
    input.campaign.settings.reply_to?.trim() ||
    input.campaign.settings.from_email?.trim() ||
    input.audienceDefaults?.from_email?.trim() ||
    "";
  const fromName =
    input.campaign.settings.from_name?.trim() || input.audienceDefaults?.from_name?.trim() || "";
  const fromEmail =
    input.campaign.settings.from_email?.trim() ||
    replyTo ||
    input.audienceDefaults?.from_email?.trim() ||
    "";

  if (!listId || !replyTo) {
    return null;
  }

  return {
    listId,
    replyTo,
    fromEmail,
    fromName,
  };
}

export async function loadMailchimpAudienceDefaultsForCampaign(
  client: MailchimpClient,
  campaign: MailchimpCampaignSummary,
): Promise<MailchimpAudienceCampaignDefaults | null> {
  const listId = campaign.recipients?.list_id?.trim();
  if (!listId) {
    return null;
  }
  const hasReplyTo =
    Boolean(campaign.settings.reply_to?.trim()) || Boolean(campaign.settings.from_email?.trim());
  const hasFromName = Boolean(campaign.settings.from_name?.trim());
  if (hasReplyTo && hasFromName) {
    return null;
  }
  const audience = await client.getAudience(listId).catch(() => null);
  return audience?.campaign_defaults ?? null;
}

export async function loadFirstAudienceDefaults(
  client: MailchimpClient,
): Promise<{ listId: string; defaults: MailchimpAudienceCampaignDefaults } | null> {
  const audiences = await client.listAudiences().catch(() => []);
  const first = audiences.find((row) => row.id?.trim());
  if (!first?.id?.trim()) {
    return null;
  }
  const detail = await client.getAudience(first.id).catch(() => first);
  return {
    listId: first.id.trim(),
    defaults: detail.campaign_defaults ?? first.campaign_defaults ?? {},
  };
}

/** Resolve list + reply-to for creating draft locale campaign copies in Mailchimp. */
export async function resolveMailchimpCampaignRecreateForCopy(
  client: MailchimpClient,
  campaign: MailchimpCampaignSummary,
): Promise<MailchimpCampaignRecreateFields | null> {
  const audienceDefaults = await loadMailchimpAudienceDefaultsForCampaign(client, campaign);
  const fromCampaign = resolveCampaignRecreateFields({ campaign, audienceDefaults });
  if (fromCampaign) {
    return fromCampaign;
  }

  const listId = campaign.recipients?.list_id?.trim();
  if (listId) {
    const audience = await client.getAudience(listId).catch(() => null);
    const withAudienceDefaults = resolveCampaignRecreateFields({
      campaign,
      audienceDefaults: audience?.campaign_defaults ?? null,
    });
    if (withAudienceDefaults) {
      return withAudienceDefaults;
    }
  }

  const fallbackAudience = await loadFirstAudienceDefaults(client);
  if (!fallbackAudience?.defaults.from_email?.trim()) {
    return null;
  }

  return resolveCampaignRecreateFields({
    campaign: {
      ...campaign,
      recipients: { list_id: listId || fallbackAudience.listId },
    },
    audienceDefaults: fallbackAudience.defaults,
  });
}
