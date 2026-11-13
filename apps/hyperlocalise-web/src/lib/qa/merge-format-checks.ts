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
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

import { SCAN_FORMAT_CHECK_IDS } from "./map-finding-to-format-check";

const LIVE_UNAVAILABLE_CHECK_ID = "validation-unavailable";

const CHECK_FAMILY_BY_ID: Record<string, string> = {
  "qa-not-localized": "not_localized",
  "qa-whitespace-only": "whitespace_only",
  "qa-same-as-source": "same_as_source",
  "qa-escaped-char-mismatch": "escaped_char_mismatch",
  length: "length",
  "scan-placeholder-mismatch": "placeholder",
  "scan-glossary-violation": "glossary",
  "glossary-compliance": "glossary",
};

for (const [checkType, id] of Object.entries(SCAN_FORMAT_CHECK_IDS)) {
  CHECK_FAMILY_BY_ID[id] = checkType === "placeholder_mismatch" ? "placeholder" : checkType;
  CHECK_FAMILY_BY_ID[checkType] = checkType === "placeholder_mismatch" ? "placeholder" : checkType;
}

function familyForCheck(check: ContentEditorFormatCheck) {
  if (CHECK_FAMILY_BY_ID[check.id]) {
    return CHECK_FAMILY_BY_ID[check.id];
  }
  if (check.id.startsWith("glossary-")) {
    return "glossary";
  }
  if (check.category === "placeholder" || check.category === "icu" || check.category === "syntax") {
    return "placeholder";
  }
  if (check.category === "glossary") {
    return "glossary";
  }
  if (check.category === "length") {
    return "length";
  }
  return check.id;
}

function liveCoversFamily(live: readonly ContentEditorFormatCheck[], family: string) {
  if (family === "placeholder") {
    return live.some(
      (check) =>
        check.category === "placeholder" ||
        check.category === "icu" ||
        check.category === "syntax" ||
        familyForCheck(check) === "placeholder",
    );
  }
  if (family === "glossary") {
    return live.some((check) => familyForCheck(check) === "glossary");
  }
  return live.some((check) => familyForCheck(check) === family);
}

/**
 * Prefer live CAT / go-svc checks. Keep on-demand scan findings when live
 * did not evaluate that family, or when go-svc is unavailable.
 */
export function mergeLiveAndScanFormatChecks(
  live: readonly ContentEditorFormatCheck[],
  scan: readonly ContentEditorFormatCheck[],
): ContentEditorFormatCheck[] {
  if (scan.length === 0) {
    return [...live];
  }
  if (live.length === 0) {
    return [...scan];
  }

  const liveFailed = live.some((check) => check.id === LIVE_UNAVAILABLE_CHECK_ID);
  if (liveFailed) {
    const seen = new Set(live.map((check) => familyForCheck(check)));
    return [
      ...live,
      ...scan.filter((check) => {
        const family = familyForCheck(check);
        if (seen.has(family)) {
          return false;
        }
        seen.add(family);
        return true;
      }),
    ];
  }

  const merged = [...live];
  const seen = new Set(live.map((check) => familyForCheck(check)));
  for (const check of scan) {
    const family = familyForCheck(check);
    if (seen.has(family) || liveCoversFamily(live, family)) {
      continue;
    }
    seen.add(family);
    merged.push(check);
  }
  return merged;
}
