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
  LocalisationAuditCreditResult,
  LocalisationAuditDimension,
  LocalisationAuditDimensionScores,
  LocalisationAuditFinding,
  LocalisationAuditFindingSeverity,
} from "./types";

const DIMENSIONS: LocalisationAuditDimension[] = [
  "technical",
  "linguistic",
  "contextual",
  "visual",
];

const SEVERITY_RANK: Record<LocalisationAuditFindingSeverity, number> = {
  critical: 0,
  high: 1,
  warning: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Multi-locale sites should outrank single-locale samples on the leaderboard.
 * Coverage scales the dimension mean so thin locale footprints cannot top the board.
 */
export function localeCoverageFactor(localeCount: number): number {
  if (localeCount <= 0) return 0.55;
  if (localeCount === 1) return 0.72;
  if (localeCount === 2) return 0.86;
  if (localeCount === 3) return 0.94;
  return 1;
}

export function aggregateLocalisationAuditCredits(
  credits: LocalisationAuditCreditResult[],
  options?: { localeCount?: number },
): {
  score: number;
  dimensionScores: LocalisationAuditDimensionScores;
} {
  const dimensionScores: LocalisationAuditDimensionScores = {
    technical: null,
    linguistic: null,
    contextual: null,
    visual: null,
  };

  const applicableScores: number[] = [];
  for (const dimension of DIMENSIONS) {
    const scores = credits
      .filter(
        (credit) =>
          credit.dimension === dimension && credit.method !== "na" && credit.score != null,
      )
      .map((credit) => credit.score!);
    if (scores.length === 0) {
      continue;
    }
    const averaged = roundScore(mean(scores));
    dimensionScores[dimension] = averaged;
    applicableScores.push(averaged);
  }

  const base = applicableScores.length === 0 ? 0 : mean(applicableScores);
  const coverage =
    options?.localeCount === undefined ? 1 : localeCoverageFactor(options.localeCount);

  return {
    score: roundScore(base * coverage),
    dimensionScores,
  };
}

/**
 * Collapse repeated same-title findings (e.g. missing lang on every page) into one lead-gen item.
 */
export function collapseRepeatedFindings(
  findings: LocalisationAuditFinding[],
): LocalisationAuditFinding[] {
  const groups = new Map<string, LocalisationAuditFinding[]>();
  for (const finding of findings) {
    const key = `${finding.creditId ?? ""}::${finding.title}`;
    const list = groups.get(key) ?? [];
    list.push(finding);
    groups.set(key, list);
  }

  const collapsed: LocalisationAuditFinding[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      collapsed.push(group[0]!);
      continue;
    }

    const primary = group.toSorted(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    )[0]!;
    const urls = [
      ...new Set(group.map((item) => item.url).filter((url): url is string => Boolean(url))),
    ];
    const count = Math.max(group.length, urls.length);
    collapsed.push({
      ...primary,
      summary:
        count > 1 && !/\d+\s+sampled pages/i.test(primary.summary)
          ? `${primary.summary} Affects ${count} sampled pages.`
          : primary.summary,
      evidence:
        urls.length > 1
          ? `${primary.evidence ? `${primary.evidence}\n` : ""}Seen on ${urls.length} pages, e.g. ${urls.slice(0, 3).join(", ")}`
          : primary.evidence,
      url: primary.url ?? urls[0],
    });
  }
  return collapsed;
}

export function pickHeadlineFindings(
  findings: LocalisationAuditFinding[],
  limit = 3,
): LocalisationAuditFinding[] {
  return findings
    .toSorted((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, limit);
}
