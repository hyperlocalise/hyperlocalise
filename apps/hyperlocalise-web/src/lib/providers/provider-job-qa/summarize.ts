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
