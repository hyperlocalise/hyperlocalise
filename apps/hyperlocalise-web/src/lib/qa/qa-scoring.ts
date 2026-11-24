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
import {
  translationQaCheckTypes,
  type TranslationQaCheckType,
  type TranslationQaSeverity,
} from "./types";

/**
 * MQM-style quality scoring for QA scans.
 *
 * Every finding is an error in one MQM dimension with a minor, major or critical penalty.
 * A locale's score is `100 × (1 − penalty points ÷ source words)`, the MQM per-word
 * penalty with a reference word count of 100. A locale passes when its score reaches the
 * project's threshold and it has no critical error.
 */

export const mqmDimensions = [
  "accuracy",
  "terminology",
  "linguistic_conventions",
  "style",
  "locale_conventions",
  "design_and_markup",
] as const;
export type MqmDimension = (typeof mqmDimensions)[number];

export const mqmSeverities = ["minor", "major", "critical"] as const;
export type MqmSeverity = (typeof mqmSeverities)[number];

/** MQM 2.0 default severity multipliers. */
export const MQM_SEVERITY_WEIGHTS: Record<MqmSeverity, number> = {
  minor: 1,
  major: 5,
  critical: 25,
};

/** The MQM dimension each automatic check reports in. */
export const QA_CHECK_DIMENSIONS: Record<TranslationQaCheckType, MqmDimension> = {
  not_localized: "accuracy",
  whitespace_only: "accuracy",
  same_as_source: "accuracy",
  numbers_mismatch: "accuracy",
  glossary_violation: "terminology",
  spelling: "linguistic_conventions",
  punctuation_mismatch: "linguistic_conventions",
  character_case_mismatch: "linguistic_conventions",
  guideline: "style",
  unreachable_plural_case: "locale_conventions",
  length: "design_and_markup",
  placeholder_mismatch: "design_and_markup",
  escaped_char_mismatch: "design_and_markup",
  format: "design_and_markup",
};

export const QA_SCORE_THRESHOLD_MIN = 0;
export const QA_SCORE_THRESHOLD_MAX = 100;
export const DEFAULT_QA_SCORE_THRESHOLD = 95;

export type QaScoringPolicy = {
  enabled: boolean;
  /** Lowest passing score, 0–100. */
  passThreshold: number;
  /** Penalty per check; a check left out uses its QA severity (warning → minor, error → major). */
  penalties: Partial<Record<TranslationQaCheckType, MqmSeverity>>;
};

export const DEFAULT_QA_SCORING_POLICY: QaScoringPolicy = {
  enabled: false,
  passThreshold: DEFAULT_QA_SCORE_THRESHOLD,
  penalties: {},
};

export type TranslationQaLocaleQuality = {
  score: number;
  passed: boolean;
  wordCount: number;
  penaltyPoints: number;
  criticalCount: number;
};

/** Stored on a run's summary when the project scores translations. */
export type TranslationQaQuality = {
  model: "mqm";
  version: 1;
  threshold: number;
  score: number;
  passed: boolean;
  wordCount: number;
  penaltyPoints: number;
  criticalCount: number;
  byLocale: Record<string, TranslationQaLocaleQuality>;
  penaltyByDimension: Partial<Record<MqmDimension, number>>;
};

export type QaScoringFinding = {
  checkType: string;
  severity: string;
  targetLocale: string;
};

const CHECK_TYPE_SET = new Set<string>(translationQaCheckTypes);
const SEVERITY_SET = new Set<string>(mqmSeverities);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a stored or submitted policy, dropping anything it does not recognise. */
export function resolveQaScoringPolicy(raw: unknown): QaScoringPolicy {
  if (!isRecord(raw)) return { ...DEFAULT_QA_SCORING_POLICY, penalties: {} };
  const threshold =
    typeof raw.passThreshold === "number" && Number.isFinite(raw.passThreshold)
      ? Math.min(QA_SCORE_THRESHOLD_MAX, Math.max(QA_SCORE_THRESHOLD_MIN, raw.passThreshold))
      : DEFAULT_QA_SCORE_THRESHOLD;
  const penalties: QaScoringPolicy["penalties"] = {};
  if (isRecord(raw.penalties)) {
    for (const [checkType, severity] of Object.entries(raw.penalties)) {
      if (
        CHECK_TYPE_SET.has(checkType) &&
        typeof severity === "string" &&
        SEVERITY_SET.has(severity)
      ) {
        penalties[checkType as TranslationQaCheckType] = severity as MqmSeverity;
      }
    }
  }
  return { enabled: raw.enabled === true, passThreshold: threshold, penalties };
}

export function defaultMqmSeverity(severity: TranslationQaSeverity): MqmSeverity {
  return severity === "error" ? "major" : "minor";
}

export function qaFindingPenalty(
  finding: Pick<QaScoringFinding, "checkType" | "severity">,
  policy: QaScoringPolicy,
): MqmSeverity {
  const override = policy.penalties[finding.checkType as TranslationQaCheckType];
  if (override) return override;
  return defaultMqmSeverity(finding.severity === "error" ? "error" : "warning");
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

/** `100 × (1 − penalty ÷ words)`, floored at 0. Text with no words scores 100 only with no penalty. */
export function mqmScore(penaltyPoints: number, wordCount: number) {
  if (wordCount <= 0) return penaltyPoints > 0 ? 0 : 100;
  return roundScore(Math.max(0, 100 * (1 - penaltyPoints / wordCount)));
}

/**
 * Scores a scan. `wordCountByLocale` lists every checked locale, including those with no
 * findings. Ignored findings must already be left out.
 */
export function computeQaQuality(input: {
  findings: readonly QaScoringFinding[];
  wordCountByLocale: Record<string, number>;
  policy: QaScoringPolicy;
}): TranslationQaQuality {
  const { policy } = input;
  const penaltyByLocale = new Map<string, { points: number; critical: number }>();
  const penaltyByDimension: Partial<Record<MqmDimension, number>> = {};

  for (const finding of input.findings) {
    const severity = qaFindingPenalty(finding, policy);
    const points = MQM_SEVERITY_WEIGHTS[severity];
    const current = penaltyByLocale.get(finding.targetLocale) ?? { points: 0, critical: 0 };
    current.points += points;
    if (severity === "critical") current.critical += 1;
    penaltyByLocale.set(finding.targetLocale, current);
    const dimension = QA_CHECK_DIMENSIONS[finding.checkType as TranslationQaCheckType];
    if (dimension) {
      penaltyByDimension[dimension] = (penaltyByDimension[dimension] ?? 0) + points;
    }
  }

  const locales = new Set([...Object.keys(input.wordCountByLocale), ...penaltyByLocale.keys()]);
  const byLocale: Record<string, TranslationQaLocaleQuality> = {};
  let wordCount = 0;
  let penaltyPoints = 0;
  let criticalCount = 0;
  for (const locale of [...locales].toSorted()) {
    const words = input.wordCountByLocale[locale] ?? 0;
    const penalty = penaltyByLocale.get(locale) ?? { points: 0, critical: 0 };
    const score = mqmScore(penalty.points, words);
    byLocale[locale] = {
      score,
      passed: score >= policy.passThreshold && penalty.critical === 0,
      wordCount: words,
      penaltyPoints: penalty.points,
      criticalCount: penalty.critical,
    };
    wordCount += words;
    penaltyPoints += penalty.points;
    criticalCount += penalty.critical;
  }

  return {
    model: "mqm",
    version: 1,
    threshold: policy.passThreshold,
    score: mqmScore(penaltyPoints, wordCount),
    passed: Object.values(byLocale).every((locale) => locale.passed),
    wordCount,
    penaltyPoints,
    criticalCount,
    byLocale,
    penaltyByDimension,
  };
}
