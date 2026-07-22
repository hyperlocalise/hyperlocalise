/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
export type TermCapabilitySupport = {
  preferred: boolean | null;
  forbidden: boolean | null;
};

function readCapabilityFlag(
  capabilities: Record<string, unknown>,
  keys: readonly string[],
): boolean | null {
  for (const key of keys) {
    const value = capabilities[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

export function parseTermCapabilitySupport(
  termCapabilities: Record<string, unknown>,
  source: "native" | "external_tms",
): TermCapabilitySupport {
  if (source === "native") {
    return { preferred: true, forbidden: true };
  }

  return {
    preferred: readCapabilityFlag(termCapabilities, [
      "preferredTerms",
      "preferred_terms",
      "supportsPreferredTerms",
    ]),
    forbidden: readCapabilityFlag(termCapabilities, [
      "forbiddenTerms",
      "forbidden_terms",
      "supportsForbiddenTerms",
    ]),
  };
}

export function formatTermCapabilityLabel(support: TermCapabilitySupport) {
  const parts: string[] = [];

  if (support.preferred === true) {
    parts.push("Preferred");
  } else if (support.preferred === false) {
    parts.push("No preferred");
  }

  if (support.forbidden === true) {
    parts.push("Forbidden");
  } else if (support.forbidden === false) {
    parts.push("No forbidden");
  }

  if (parts.length === 0) {
    return "Capabilities unknown";
  }

  return parts.join(" · ");
}
