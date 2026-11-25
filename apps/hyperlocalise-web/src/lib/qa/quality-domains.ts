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

/**
 * Content domains a project can declare for quality checks. A regulated domain makes every
 * QA run ask for human review, raises the lowest quality-estimate threshold the project can
 * set, and tells the estimator which changes in meaning matter most.
 */
export const qaDomains = ["general", "medical", "legal", "financial"] as const;
export type QaDomain = (typeof qaDomains)[number];

export type QaDomainProfile = {
  /** The project's estimation threshold is raised to at least this. */
  minEstimationThreshold: number;
  /** Every Run QA step reports that the work needs human review. */
  requiresHumanReview: boolean;
  /** Extra instruction for the quality estimator. Empty for general content. */
  estimatorGuidance: string;
};

export const QA_DOMAIN_PROFILES: Record<QaDomain, QaDomainProfile> = {
  general: { minEstimationThreshold: 0, requiresHumanReview: false, estimatorGuidance: "" },
  medical: {
    minEstimationThreshold: 85,
    requiresHumanReview: true,
    estimatorGuidance:
      "This is medical or life-sciences content. Treat any change to meaning, dosage, units, frequency, contraindications, warnings, side effects or numbers as a severe error and score it below 50.",
  },
  legal: {
    minEstimationThreshold: 85,
    requiresHumanReview: true,
    estimatorGuidance:
      "This is legal content. Treat any change to obligations, rights, defined terms, conditions, parties, dates, deadlines or amounts as a severe error and score it below 50.",
  },
  financial: {
    minEstimationThreshold: 80,
    requiresHumanReview: true,
    estimatorGuidance:
      "This is financial content. Treat any change to amounts, rates, currencies, dates, risk statements or regulatory disclaimers as a severe error and score it below 50.",
  },
};

export function isQaDomain(value: unknown): value is QaDomain {
  return typeof value === "string" && (qaDomains as readonly string[]).includes(value);
}

/** The threshold the estimate is held to: the project's, raised to the domain's floor. */
export function effectiveEstimationThreshold(policy: {
  estimationThreshold: number;
  domain: QaDomain;
}) {
  return Math.max(
    policy.estimationThreshold,
    QA_DOMAIN_PROFILES[policy.domain].minEstimationThreshold,
  );
}
