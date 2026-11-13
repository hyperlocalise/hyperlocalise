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
  DEFAULT_INTERCOM_EXISTING_TRANSLATION_POLICY as DEFAULT_SANITY_EXISTING_TRANSLATION_POLICY,
  INTERCOM_EXISTING_TRANSLATION_POLICIES as SANITY_EXISTING_TRANSLATION_POLICIES,
  decideIntercomExistingTranslationAction as decideSanityExistingTranslationAction,
  isIntercomExistingTranslationPolicy as isSanityExistingTranslationPolicy,
  type IntercomExistingTranslationPolicy as SanityExistingTranslationPolicy,
  type IntercomLocaleTranslationPresence as SanityLocaleTranslationPresence,
} from "@/lib/intercom/intercom-existing-translation-policy";
