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
  AuditCompletionStatus,
  AuditEvaluation,
  AuditScores,
  AuditedPage,
  PrivateAuditReport,
  PublicAuditReport,
  PublicReportFinding,
} from "./types";
import { LOCALISATION_AUDIT_REPORT_VERSION } from "./types";

function projectFinding(
  finding: AuditEvaluation["findings"][number],
  includeEvidence: boolean,
): PublicReportFinding {
  return {
    code: finding.code,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    impact: finding.impact,
    recommendation: finding.recommendation,
    ...(includeEvidence && Object.keys(finding.evidence).length > 0
      ? { evidence: finding.evidence }
      : {}),
  };
}

export function createReportProjections(input: {
  domain: string;
  auditedAt: Date;
  pages: AuditedPage[];
  evaluation: AuditEvaluation;
  scores: AuditScores;
}): { publicReport: PublicAuditReport; privateReport: PrivateAuditReport } {
  const status: AuditCompletionStatus = input.pages.some((page) => page.status !== "extracted")
    ? "partial"
    : "completed";
  const publicFindings = input.evaluation.findings
    .filter((finding) => finding.publicPreviewEligible)
    .slice(0, 3)
    .map((finding) => projectFinding(finding, false));
  const reportBase = {
    ...input.scores,
    reportVersion: LOCALISATION_AUDIT_REPORT_VERSION,
    domain: input.domain,
    auditedAt: input.auditedAt.toISOString(),
    status,
    lockedFindingCount: Math.max(0, input.evaluation.findings.length - publicFindings.length),
    limitations: input.evaluation.limitations,
  };

  return {
    publicReport: {
      ...reportBase,
      findings: publicFindings,
    },
    privateReport: {
      ...reportBase,
      findings: input.evaluation.findings.map((finding) => projectFinding(finding, true)),
      pages: input.pages.map((page) => ({
        url: page.url,
        locale: page.locale,
        status: page.status,
      })),
    },
  };
}
