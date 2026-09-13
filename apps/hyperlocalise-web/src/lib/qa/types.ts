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
export const translationQaCheckTypes = [
  "not_localized",
  "whitespace_only",
  "same_as_source",
  "escaped_char_mismatch",
  "length",
  "placeholder_mismatch",
  "glossary_violation",
] as const;

export type TranslationQaCheckType = (typeof translationQaCheckTypes)[number];

export const translationQaSeverities = ["error", "warning"] as const;

export type TranslationQaSeverity = (typeof translationQaSeverities)[number];

export const translationQaScanCadences = ["off", "daily"] as const;

export type TranslationQaScanCadence = (typeof translationQaScanCadences)[number];

export const translationQaRunTriggers = ["manual", "scheduled"] as const;

export type TranslationQaRunTrigger = (typeof translationQaRunTriggers)[number];

export const translationQaRunStatuses = ["queued", "running", "succeeded", "failed"] as const;

export type TranslationQaRunStatus = (typeof translationQaRunStatuses)[number];

export type TranslationQaGlossaryTerm = {
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  forbidden: boolean;
  caseSensitive: boolean;
};

export type TranslationQaSegmentInput = {
  sourceText: string;
  targetText: string;
  sourcePath?: string | null;
  maxLength?: number | null;
  targetLocale: string;
  glossaryTerms?: readonly TranslationQaGlossaryTerm[];
};

export type TranslationQaCheck = {
  checkType: TranslationQaCheckType;
  severity: TranslationQaSeverity;
  category: "qa" | "length" | "placeholder" | "glossary";
  message: string;
  relatedTokens: string[];
};

export type TranslationQaSummary = {
  byCheckType: Partial<Record<TranslationQaCheckType, number>>;
  bySeverity: Partial<Record<TranslationQaSeverity, number>>;
  byLocale: Record<string, number>;
};
