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
import type { ProviderQaFinding, ProviderQaReport, ProviderQaSummary } from "./types";

export function summarizeProviderQaFindings(findings: ProviderQaFinding[]): ProviderQaSummary {
  const summary: ProviderQaSummary = {
    total: findings.length,
    byCheckType: {},
    bySeverity: {},
  };

  for (const finding of findings) {
    summary.byCheckType[finding.checkType] = (summary.byCheckType[finding.checkType] ?? 0) + 1;
    summary.bySeverity[finding.severity] = (summary.bySeverity[finding.severity] ?? 0) + 1;
  }

  return summary;
}

export function buildProviderQaReport(findings: ProviderQaFinding[]): ProviderQaReport {
  return {
    findings,
    summary: summarizeProviderQaFindings(findings),
  };
}
