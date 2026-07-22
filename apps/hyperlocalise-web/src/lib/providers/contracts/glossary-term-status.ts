/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
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

  const status = input.status?.trim().toLowerCase();
  if (!status) {
    return { forbidden: false };
  }

  if (status === "forbidden" || status === "not recommended" || status === "deprecated") {
    return { forbidden: true };
  }

  return { forbidden: false };
}
