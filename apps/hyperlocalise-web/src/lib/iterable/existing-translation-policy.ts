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

export const ITERABLE_EXISTING_TRANSLATION_POLICIES = [
  "seed_empty",
  "refresh_imported",
  "overwrite_all",
] as const;

export type IterableExistingTranslationPolicy =
  (typeof ITERABLE_EXISTING_TRANSLATION_POLICIES)[number];

export const DEFAULT_ITERABLE_EXISTING_TRANSLATION_POLICY: IterableExistingTranslationPolicy =
  "seed_empty";

export function isIterableExistingTranslationPolicy(
  value: unknown,
): value is IterableExistingTranslationPolicy {
  return (
    typeof value === "string" &&
    ITERABLE_EXISTING_TRANSLATION_POLICIES.includes(value as IterableExistingTranslationPolicy)
  );
}

export type IterableLocaleTranslationPresence = {
  hasExistingTranslation: boolean;
  importProvenanceOnly: boolean;
  contentHash: string | null;
};

export function iterableTranslationPresence(input: {
  importedHash?: string;
  translatedKeyCount: number;
  provenances?: readonly string[];
}): IterableLocaleTranslationPresence {
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

export function decideIterableExistingTranslationAction(input: {
  policy: IterableExistingTranslationPolicy;
  presence: IterableLocaleTranslationPresence;
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

export function decideIterablePushLocaleAction(input: {
  policy: IterableExistingTranslationPolicy;
  remoteEmpty: boolean;
  lastPushHash?: string;
  contentHash: string;
}): "push" | "skip" {
  if (input.policy === "overwrite_all") {
    return "push";
  }
  if (input.policy === "seed_empty") {
    return input.remoteEmpty ? "push" : "skip";
  }
  if (!input.lastPushHash) {
    return "skip";
  }
  return input.lastPushHash !== input.contentHash ? "push" : "skip";
}
