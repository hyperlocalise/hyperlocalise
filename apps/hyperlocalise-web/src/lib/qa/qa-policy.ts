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
import type { TranslationQaCheck, TranslationQaCheckType, TranslationQaSeverity } from "./types";
import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

export type QaCheckSetting = { enabled: boolean; severity: TranslationQaSeverity };
export type QaCheckPolicy = Record<TranslationQaCheckType, QaCheckSetting>;

export const DEFAULT_QA_POLICY: QaCheckPolicy = {
  not_localized: { enabled: true, severity: "error" },
  whitespace_only: { enabled: true, severity: "warning" },
  same_as_source: { enabled: true, severity: "warning" },
  escaped_char_mismatch: { enabled: true, severity: "warning" },
  length: { enabled: true, severity: "error" },
  placeholder_mismatch: { enabled: true, severity: "error" },
  glossary_violation: { enabled: true, severity: "warning" },
  format: { enabled: true, severity: "error" },
  spelling: { enabled: true, severity: "warning" },
  numbers_mismatch: { enabled: false, severity: "warning" },
  punctuation_mismatch: { enabled: false, severity: "warning" },
  character_case_mismatch: { enabled: false, severity: "warning" },
};

export function applyQaPolicy(checks: readonly TranslationQaCheck[], policy: QaCheckPolicy) {
  return checks.flatMap((check) => {
    const setting = policy[check.checkType];
    if (!setting?.enabled) return [];
    return [{ ...check, severity: setting.severity }];
  });
}

const EDITOR_CHECK_TYPES: Record<string, TranslationQaCheckType> = {
  "qa-not-localized": "not_localized",
  "qa-whitespace-only": "whitespace_only",
  "qa-same-as-source": "same_as_source",
  "qa-escaped-char-mismatch": "escaped_char_mismatch",
  "qa-numbers-mismatch": "numbers_mismatch",
  "qa-punctuation-mismatch": "punctuation_mismatch",
  "qa-character-case-mismatch": "character_case_mismatch",
  length: "length",
};

export function applyEditorQaPolicy(
  checks: readonly ContentEditorFormatCheck[],
  policy: QaCheckPolicy,
): ContentEditorFormatCheck[] {
  return checks.flatMap((check) => {
    const type =
      EDITOR_CHECK_TYPES[check.id] ??
      (check.category === "spelling"
        ? "spelling"
        : check.category === "glossary"
          ? "glossary_violation"
          : check.category === "placeholder"
            ? "placeholder_mismatch"
            : check.category === "length"
              ? "length"
              : check.category === "qa"
                ? null
                : "format");
    if (!type) return [check];
    const setting = policy[type];
    if (!setting?.enabled) return [];
    if (check.status === "pass") return [check];
    return [
      { ...check, status: setting.severity === "error" ? ("fail" as const) : ("warn" as const) },
    ];
  });
}
