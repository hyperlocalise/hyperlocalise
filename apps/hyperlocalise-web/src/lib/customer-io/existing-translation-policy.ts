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

export const CUSTOMER_IO_EXISTING_TRANSLATION_POLICIES = [
  "seed_empty",
  "refresh_imported",
  "overwrite_all",
] as const;

export type CustomerIoExistingTranslationPolicy =
  (typeof CUSTOMER_IO_EXISTING_TRANSLATION_POLICIES)[number];

export const DEFAULT_CUSTOMER_IO_EXISTING_TRANSLATION_POLICY: CustomerIoExistingTranslationPolicy =
  "seed_empty";

export function isCustomerIoExistingTranslationPolicy(
  value: unknown,
): value is CustomerIoExistingTranslationPolicy {
  return (
    typeof value === "string" &&
    CUSTOMER_IO_EXISTING_TRANSLATION_POLICIES.includes(value as CustomerIoExistingTranslationPolicy)
  );
}

export type CustomerIoLocaleTranslationPresence = {
  hasExistingTranslation: boolean;
  importProvenanceOnly: boolean;
  contentHash: string | null;
};

export function customerIoTranslationPresence(input: {
  importedHash?: string;
  translatedKeyCount: number;
  provenances?: readonly string[];
}): CustomerIoLocaleTranslationPresence {
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

export function decideCustomerIoExistingTranslationAction(input: {
  policy: CustomerIoExistingTranslationPolicy;
  presence: CustomerIoLocaleTranslationPresence;
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
