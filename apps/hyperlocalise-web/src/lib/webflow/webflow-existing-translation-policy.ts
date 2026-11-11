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

// Webflow shares the existing-translation policy vocabulary with Intercom
// (and Sanity): seed_empty never overwrites project work, refresh_imported
// refreshes locales previously imported by automation, and overwrite_all
// always seeds the remote content.
export {
  DEFAULT_INTERCOM_EXISTING_TRANSLATION_POLICY as DEFAULT_WEBFLOW_EXISTING_TRANSLATION_POLICY,
  INTERCOM_EXISTING_TRANSLATION_POLICIES as WEBFLOW_EXISTING_TRANSLATION_POLICIES,
  decideIntercomExistingTranslationAction as decideWebflowExistingTranslationAction,
  isIntercomExistingTranslationPolicy as isWebflowExistingTranslationPolicy,
  type IntercomExistingTranslationPolicy as WebflowExistingTranslationPolicy,
  type IntercomLocaleTranslationPresence as WebflowLocaleTranslationPresence,
} from "@/lib/intercom/intercom-existing-translation-policy";
