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
