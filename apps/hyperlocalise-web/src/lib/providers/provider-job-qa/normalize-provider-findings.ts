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
import type { ProviderQaCheckType, ProviderQaFinding } from "./types";

const hlCheckConfidence: Partial<Record<string, number>> = {
  not_localized: 1,
  placeholder_mismatch: 1,
  icu_shape_mismatch: 1,
  markdown_ast_mismatch: 1,
  html_tag_mismatch: 1,
  same_as_source: 0.95,
  whitespace_only: 1,
};

const supplementalCheckConfidence: Partial<Record<ProviderQaCheckType, number>> = {
  stale_unchanged_target: 0.85,
  length_expansion: 0.75,
  glossary_violation: 0.9,
};

export function confidenceForHlCheckType(hlType: string): number {
  return hlCheckConfidence[hlType] ?? 1;
}

export function confidenceForProviderCheckType(checkType: ProviderQaCheckType): number {
  return supplementalCheckConfidence[checkType] ?? 0.9;
}

export function normalizeProviderQaFinding(
  finding: ProviderQaFinding,
  options?: { hlSourceType?: string },
): ProviderQaFinding {
  if (typeof finding.confidence === "number" && Number.isFinite(finding.confidence)) {
    return finding;
  }

  const confidence =
    options?.hlSourceType !== undefined
      ? confidenceForHlCheckType(options.hlSourceType)
      : confidenceForProviderCheckType(finding.checkType);

  return {
    ...finding,
    confidence,
  };
}

export function normalizeProviderQaFindings(findings: ProviderQaFinding[]): ProviderQaFinding[] {
  return findings.map((finding) => normalizeProviderQaFinding(finding));
}
