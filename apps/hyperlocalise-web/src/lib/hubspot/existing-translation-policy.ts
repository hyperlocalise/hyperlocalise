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

export const HUBSPOT_EXISTING_TRANSLATION_POLICIES = [
  "seed_empty",
  "refresh_imported",
  "overwrite_all",
] as const;

export type HubspotExistingTranslationPolicy =
  (typeof HUBSPOT_EXISTING_TRANSLATION_POLICIES)[number];

export const DEFAULT_HUBSPOT_EXISTING_TRANSLATION_POLICY: HubspotExistingTranslationPolicy =
  "seed_empty";

export function isHubspotExistingTranslationPolicy(
  value: unknown,
): value is HubspotExistingTranslationPolicy {
  return (
    typeof value === "string" &&
    HUBSPOT_EXISTING_TRANSLATION_POLICIES.includes(value as HubspotExistingTranslationPolicy)
  );
}

export type HubspotLocaleTranslationPresence = {
  hasExistingTranslation: boolean;
  importProvenanceOnly: boolean;
  contentHash: string | null;
};

export function hubspotTranslationPresence(input: {
  importedHash?: string;
  translatedKeyCount: number;
  provenances?: readonly string[];
}): HubspotLocaleTranslationPresence {
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

export function decideHubspotExistingTranslationAction(input: {
  policy: HubspotExistingTranslationPolicy;
  presence: HubspotLocaleTranslationPresence;
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

export function decideHubspotPushLocaleAction(input: {
  policy: HubspotExistingTranslationPolicy;
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

/**
 * Grace window for HubSpot stamping a copy after our own push. Without it a
 * copy we just pushed would always look newer than `lastPushedAt`.
 */
export const HUBSPOT_REMOTE_NEWER_SKEW_MS = 5 * 60 * 1000;

/**
 * Whether a locale copy changed in HubSpot after our last push. Unknown
 * timestamps count as newer so callers protect the remote copy instead of
 * clobbering teammate edits.
 */
export function isHubspotRemoteCopyNewer(input: {
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
  return copyTime > input.lastPushedAt.getTime() + HUBSPOT_REMOTE_NEWER_SKEW_MS;
}
