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
export type ProviderGlossaryTermStatusInput = {
  status?: string | null;
  forbidden?: boolean | null;
};

/**
 * Maps provider-specific term status into Hyperlocalise glossary term flags.
 * Preferred terms enforce target usage; forbidden terms block target usage.
 */
export function normalizeProviderGlossaryTermFlags(input: ProviderGlossaryTermStatusInput): {
  forbidden: boolean;
} {
  if (input.forbidden === true) {
    return { forbidden: true };
  }

  if (input.forbidden === false) {
    return { forbidden: false };
  }

  const status = input.status?.trim().toLowerCase().replaceAll("_", " ");
  if (!status) {
    return { forbidden: false };
  }

  if (status === "forbidden" || status === "not recommended" || status === "deprecated") {
    return { forbidden: true };
  }

  return { forbidden: false };
}

function normalizeNativeGlossaryStatus(status: string | null | undefined): string {
  return status?.trim().toLowerCase().replaceAll("_", " ") ?? "";
}

/** Status-only flags for native concept terms. Does not read the DB `forbidden` column. */
export function glossaryTermFlagsFromStatus(status: string | null | undefined): {
  preferred: boolean;
  notRecommended: boolean;
} {
  const normalized = normalizeNativeGlossaryStatus(status);
  return {
    preferred: normalized === "preferred",
    notRecommended:
      normalized === "not recommended" ||
      normalized === "obsolete" ||
      normalized === "deprecated" ||
      normalized === "forbidden",
  };
}

export function normalizedGlossaryTermStatusFromStatus(status: string | null | undefined): {
  forbidden: boolean;
  preferred: boolean;
} {
  const flags = glossaryTermFlagsFromStatus(status);
  return {
    forbidden: flags.notRecommended,
    preferred: flags.preferred,
  };
}
