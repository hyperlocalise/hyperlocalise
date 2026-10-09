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

export const INTERCOM_EXISTING_TRANSLATION_POLICIES = [
  "seed_empty",
  "refresh_imported",
  "overwrite_all",
] as const;

export type IntercomExistingTranslationPolicy =
  (typeof INTERCOM_EXISTING_TRANSLATION_POLICIES)[number];

export const DEFAULT_INTERCOM_EXISTING_TRANSLATION_POLICY: IntercomExistingTranslationPolicy =
  "seed_empty";

export function isIntercomExistingTranslationPolicy(
  value: unknown,
): value is IntercomExistingTranslationPolicy {
  return (
    typeof value === "string" &&
    INTERCOM_EXISTING_TRANSLATION_POLICIES.includes(value as IntercomExistingTranslationPolicy)
  );
}

export type IntercomLocaleTranslationPresence = {
  pushReady: boolean;
  importProvenanceOnly: boolean;
  contentHash: string | null;
};

export function decideIntercomExistingTranslationAction(input: {
  policy: IntercomExistingTranslationPolicy;
  presence: IntercomLocaleTranslationPresence;
  incomingHash: string;
}): "import" | "skip" {
  if (input.policy === "overwrite_all") {
    return "import";
  }

  if (input.policy === "seed_empty") {
    return input.presence.pushReady ? "skip" : "import";
  }

  if (!input.presence.pushReady) {
    return "import";
  }

  if (
    input.presence.importProvenanceOnly &&
    input.presence.contentHash != null &&
    input.presence.contentHash !== input.incomingHash
  ) {
    return "import";
  }

  return "skip";
}
