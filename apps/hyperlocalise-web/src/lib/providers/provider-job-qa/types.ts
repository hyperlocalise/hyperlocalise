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
export const providerQaCheckTypes = [
  "placeholder_mismatch",
  "icu_shape_mismatch",
  "missing_translation",
  "stale_unchanged_target",
  "length_expansion",
  "markdown_link",
  "html_tag_mismatch",
  "glossary_violation",
  "tone_style_issue",
  "whitespace_only_translation",
] as const;

export type ProviderQaCheckType = (typeof providerQaCheckTypes)[number];

export const providerQaSeverityLevels = ["error", "warning", "info"] as const;

export type ProviderQaSeverity = (typeof providerQaSeverityLevels)[number];

export type ProviderQaItemReference = {
  externalStringId: string;
  key: string;
  locale?: string;
  field?: "source" | "target";
};

export type ProviderQaFinding = {
  checkType: ProviderQaCheckType;
  severity: ProviderQaSeverity;
  message: string;
  suggestedFix?: string;
  confidence?: number;
  item: ProviderQaItemReference;
};

export type ProviderQaSummary = {
  total: number;
  byCheckType: Partial<Record<ProviderQaCheckType, number>>;
  bySeverity: Partial<Record<ProviderQaSeverity, number>>;
};

export type ProviderQaReport = {
  findings: ProviderQaFinding[];
  summary: ProviderQaSummary;
};

export type ProviderQaGlossaryTerm = {
  sourceTerm: string;
  targetTerm: string;
  forbidden: boolean;
  caseSensitive: boolean;
};

export type ProviderQaRunOptions = {
  targetLocales: string[];
  sourceLocale?: string | null;
  glossaryTerms?: ProviderQaGlossaryTerm[];
  lengthExpansionWarningRatio?: number;
  lengthExpansionErrorRatio?: number;
};
