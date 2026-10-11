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

export const BRAZE_EXISTING_TRANSLATION_POLICIES = [
  "seed_empty",
  "refresh_imported",
  "overwrite_all",
] as const;

export type BrazeExistingTranslationPolicy = (typeof BRAZE_EXISTING_TRANSLATION_POLICIES)[number];

export const DEFAULT_BRAZE_EXISTING_TRANSLATION_POLICY: BrazeExistingTranslationPolicy =
  "seed_empty";

export function isBrazeExistingTranslationPolicy(
  value: unknown,
): value is BrazeExistingTranslationPolicy {
  return (
    typeof value === "string" &&
    BRAZE_EXISTING_TRANSLATION_POLICIES.includes(value as BrazeExistingTranslationPolicy)
  );
}

export type BrazeLocaleTranslationPresence = {
  hasExistingTranslation: boolean;
  importProvenanceOnly: boolean;
  contentHash: string | null;
};

export function brazeTranslationPresence(input: {
  importedHash?: string;
  translatedKeyCount: number;
  provenances?: readonly string[];
}): BrazeLocaleTranslationPresence {
  const hasExistingTranslation = input.translatedKeyCount > 0;
  const provenances = [...new Set((input.provenances ?? []).filter((value) => value.trim()))];
  return {
    hasExistingTranslation,
    importProvenanceOnly:
      hasExistingTranslation &&
      provenances.length > 0 &&
      provenances.every((value) => value === "import"),
    contentHash: input.importedHash ?? null,
  };
}

export function decideBrazeExistingTranslationAction(input: {
  policy: BrazeExistingTranslationPolicy;
  presence: BrazeLocaleTranslationPresence;
  incomingHash: string;
}): "import" | "skip" {
  if (input.policy === "overwrite_all") {
    return "import";
  }

  if (input.policy === "seed_empty") {
    return input.presence.hasExistingTranslation ? "skip" : "import";
  }

  if (!input.presence.hasExistingTranslation) {
    return "import";
  }

  if (!input.presence.importProvenanceOnly) {
    return "skip";
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
