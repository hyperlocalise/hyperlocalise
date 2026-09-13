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
import type {
  ContentEditorFormatCheck,
  ContentEditorFormatCheckCategory,
} from "@/components/content-editor/shared/types";

import type { TranslationQaCheckType, TranslationQaSeverity } from "./types";

const CHECK_LABELS: Record<TranslationQaCheckType, string> = {
  not_localized: "Translation",
  whitespace_only: "Whitespace",
  same_as_source: "Same as source",
  escaped_char_mismatch: "Escaped characters",
  length: "Length",
  placeholder_mismatch: "Placeholders",
  glossary_violation: "Glossary",
};

const CHECK_CATEGORIES: Record<TranslationQaCheckType, ContentEditorFormatCheckCategory> = {
  not_localized: "qa",
  whitespace_only: "qa",
  same_as_source: "qa",
  escaped_char_mismatch: "qa",
  length: "length",
  placeholder_mismatch: "placeholder",
  glossary_violation: "glossary",
};

/** IDs that match go-svc so CAT can dedupe live and scan rows. */
export const SCAN_FORMAT_CHECK_IDS: Record<TranslationQaCheckType, string> = {
  not_localized: "qa-not-localized",
  whitespace_only: "qa-whitespace-only",
  same_as_source: "qa-same-as-source",
  escaped_char_mismatch: "qa-escaped-char-mismatch",
  length: "length",
  placeholder_mismatch: "scan-placeholder-mismatch",
  glossary_violation: "scan-glossary-violation",
};

export type TranslationQaFindingLike = {
  checkType: string;
  severity: TranslationQaSeverity;
  category: string;
  message: string;
  relatedTokens: string[];
  sourceText: string;
  targetText: string;
  translationKeyId?: string | null;
  key: string;
  targetLocale: string;
  sourcePath?: string | null;
};

export function mapQaFindingToFormatCheck(
  finding: TranslationQaFindingLike,
): ContentEditorFormatCheck | null {
  if (!isTranslationQaCheckType(finding.checkType)) {
    return null;
  }

  return {
    id: SCAN_FORMAT_CHECK_IDS[finding.checkType],
    label: CHECK_LABELS[finding.checkType],
    status: finding.severity === "error" ? "fail" : "warn",
    message: finding.message,
    category: CHECK_CATEGORIES[finding.checkType],
    relatedTokens: finding.relatedTokens,
  };
}

export function isTranslationQaCheckType(value: string): value is TranslationQaCheckType {
  return value in SCAN_FORMAT_CHECK_IDS;
}

export function formatChecksFromScanFindings(
  findings: readonly TranslationQaFindingLike[],
  segment: { id: string; key: string; targetLocale: string; sourceText: string },
  value: string,
): ContentEditorFormatCheck[] {
  return findings.flatMap((finding) => {
    const matchesSegment = finding.translationKeyId === segment.id || finding.key === segment.key;
    if (
      !matchesSegment ||
      finding.targetLocale !== segment.targetLocale ||
      finding.targetText !== value ||
      finding.sourceText !== segment.sourceText
    ) {
      return [];
    }
    const check = mapQaFindingToFormatCheck(finding);
    return check ? [check] : [];
  });
}
