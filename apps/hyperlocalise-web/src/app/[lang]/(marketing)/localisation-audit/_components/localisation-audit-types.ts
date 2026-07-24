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

export type ScoreResult =
  | {
      state: "scored";
      score: number;
      evaluatedRules: number;
    }
  | {
      state: "insufficient_evidence";
      evaluatedRules: number;
    };

export type AuditFinding = {
  id: string;
  category: string;
  severity: string;
  title: string;
  evidence: string;
  businessImpact: string;
  recommendation: string;
  confidence: string | number;
};

export type AuditSummary = {
  domain: string;
  auditedAt: string;
  overallScore: ScoreResult;
  categories: {
    technical: ScoreResult;
    linguistic: ScoreResult;
    market: ScoreResult;
  };
  previewFindings: AuditFinding[];
  lockedFindingCount: number;
  limitations: string[];
};

export type DiscoveredAlternative = {
  locale: string;
  url: string;
};

export type AuditStatus =
  | "preparing"
  | "awaiting_confirmation"
  | "running"
  | "completed"
  | "partial"
  | "failed";

export type CreateAuditResponse = {
  audit: {
    id: string;
    status: AuditStatus;
    detectedLocale: string | null;
    alternatives: DiscoveredAlternative[];
  };
};

export type ConfirmAuditResponse = {
  audit: {
    id: string;
    status: AuditStatus;
    publicSlug?: string;
    summary?: AuditSummary;
    detectedLocale?: string | null;
    alternatives?: DiscoveredAlternative[];
  };
};

export type UnlockAuditResponse = {
  report: {
    accessUrl: string;
  };
};

export type AuditReportProjection = AuditSummary & {
  findings: AuditFinding[];
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseScore(value: unknown, status?: unknown): ScoreResult {
  if (typeof value === "number" && status === "scored") {
    return { state: "scored", score: value, evaluatedRules: 0 };
  }

  if (!isRecord(value)) {
    return { state: "insufficient_evidence", evaluatedRules: 0 };
  }

  const evaluatedRules = numberValue(value.evaluatedRules ?? value.evaluatedRuleCount);
  if (value.state === "scored" || value.status === "scored") {
    return {
      state: "scored",
      score: numberValue(value.score),
      evaluatedRules,
    };
  }

  return { state: "insufficient_evidence", evaluatedRules };
}

function parseFinding(value: unknown, index: number): AuditFinding | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = stringValue(value.title);
  if (!title) {
    return null;
  }

  const evidenceValue = isRecord(value.evidence)
    ? [
        stringValue(value.evidence.excerpt),
        stringValue(value.evidence.observedValue),
        stringValue(value.evidence.expectedValue),
      ]
        .filter(Boolean)
        .join(" — ")
    : stringValue(value.evidence);

  return {
    id: stringValue(value.id ?? value.code, `finding-${index}`),
    category: stringValue(value.category, "technical"),
    severity: stringValue(value.severity, "medium"),
    title,
    evidence: evidenceValue,
    businessImpact: stringValue(value.businessImpact ?? value.impact),
    recommendation: stringValue(value.recommendation),
    confidence:
      typeof value.confidence === "number" ? value.confidence : stringValue(value.confidence),
  };
}

function parseFindings(value: unknown): AuditFinding[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((finding, index) => {
    const parsed = parseFinding(finding, index);
    return parsed ? [parsed] : [];
  });
}

/**
 * Keeps report pages tolerant of the service returning either a report
 * projection directly or a `{ report: { summary, findings } }` envelope.
 */
export function toAuditReportProjection(value: unknown): AuditReportProjection {
  const envelope = isRecord(value) && isRecord(value.report) ? value.report : value;
  const report = isRecord(envelope) ? envelope : {};
  const summary = isRecord(report.summary) ? report.summary : report;
  const categoryValue = isRecord(summary.categories)
    ? summary.categories
    : isRecord(summary.categoryScores)
      ? summary.categoryScores
      : {};
  const findings = parseFindings(report.findings ?? summary.findings ?? summary.previewFindings);
  const limitations = Array.isArray(summary.limitations)
    ? summary.limitations.filter((item): item is string => typeof item === "string")
    : [];

  return {
    domain: stringValue(summary.domain),
    auditedAt: stringValue(summary.auditedAt),
    overallScore: parseScore(summary.overallScore, summary.overallStatus),
    categories: {
      technical: parseScore(categoryValue.technical),
      linguistic: parseScore(categoryValue.linguistic),
      market: parseScore(categoryValue.market),
    },
    previewFindings: findings.slice(0, 3),
    findings,
    lockedFindingCount: numberValue(summary.lockedFindingCount),
    limitations,
  };
}
