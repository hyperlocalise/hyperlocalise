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

export {
  DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY as DEFAULT_MAILCHIMP_EXISTING_TRANSLATION_POLICY,
  decideBrazeExistingTranslationAction as decideMailchimpExistingTranslationAction,
  brazeTranslationPresence as mailchimpTranslationPresence,
  isBrazeExistingTranslationPolicy as isMailchimpExistingTranslationPolicy,
  type BrazeExistingTranslationPolicy as MailchimpExistingTranslationPolicy,
} from "@/lib/braze/existing-translation-policy";

const REMOTE_NEWER_SKEW_MS = 60_000;

export function isMailchimpRemoteCopyNewer(input: {
  lastPushedAt: Date | null;
  copyUpdatedAt: string | null;
}): boolean {
  if (!input.lastPushedAt || !input.copyUpdatedAt) {
    return true;
  }
  const copyTime = Date.parse(input.copyUpdatedAt);
  if (Number.isNaN(copyTime)) {
    return true;
  }
  return copyTime > input.lastPushedAt.getTime() + REMOTE_NEWER_SKEW_MS;
}

export function shouldSkipUnchangedMailchimpPush(
  lastHash: string | undefined,
  contentHash: string,
): boolean {
  return Boolean(lastHash && lastHash === contentHash);
}

export function shouldSkipMailchimpRemoteNewerCopy(input: {
  hasCopy: boolean;
  overwriteWhenRemoteNewer: boolean;
  lastPushedAt: Date | null;
  copyUpdatedAt: string | null;
}): boolean {
  if (!input.hasCopy || input.overwriteWhenRemoteNewer) {
    return false;
  }
  return isMailchimpRemoteCopyNewer({
    lastPushedAt: input.lastPushedAt,
    copyUpdatedAt: input.copyUpdatedAt,
  });
}

export function mailchimpCampaignCanRecreate<
  T extends { listId?: string | null; replyTo?: string | null },
>(recreate: T | null): recreate is T & { listId: string; replyTo: string } {
  return Boolean(recreate?.listId && recreate.replyTo);
}

type MailchimpCopyTimestampClient = {
  getTemplate(templateId: string): Promise<{
    date_edited?: string;
    edited_on?: string;
    date_created?: string;
    created_on?: string;
  }>;
};

/** Campaigns only expose create_time, which is not an edit signal. */
export async function readMailchimpCopyUpdatedAt(input: {
  client: MailchimpCopyTimestampClient;
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
  return null;
}
