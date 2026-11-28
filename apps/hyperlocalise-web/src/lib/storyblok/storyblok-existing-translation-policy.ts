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

// Storyblok shares the existing-translation policy vocabulary with Intercom
// (and Sanity): seed_empty never overwrites project work, refresh_imported
// refreshes locales previously imported by automation, and overwrite_all
// always seeds the remote content.
export {
  DEFAULT_INTERCOM_EXISTING_TRANSLATION_POLICY as DEFAULT_STORYBLOK_EXISTING_TRANSLATION_POLICY,
  INTERCOM_EXISTING_TRANSLATION_POLICIES as STORYBLOK_EXISTING_TRANSLATION_POLICIES,
  decideIntercomExistingTranslationAction as decideStoryblokExistingTranslationAction,
  isIntercomExistingTranslationPolicy as isStoryblokExistingTranslationPolicy,
  type IntercomExistingTranslationPolicy as StoryblokExistingTranslationPolicy,
  type IntercomLocaleTranslationPresence as StoryblokLocaleTranslationPresence,
} from "@/lib/intercom/intercom-existing-translation-policy";
