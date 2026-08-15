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
import { LOCALISATION_AUDIT_CREDITS, creditById } from "./credits/catalog";
import type {
  LocalisationAuditCreditResult,
  LocalisationAuditDimension,
  LocalisationAuditFinding,
} from "./types";

/** Lighthouse-style binary outcome for a scored credit. */
export type LocalisationAuditCriterionStatus = "pass" | "fail" | "na";

/** Pass threshold matches the Excellent score band (90–100). */
export const LOCALISATION_AUDIT_CRITERION_PASS_SCORE = 90;

export type LocalisationAuditCriterion = {
  id: string;
  title: string;
  rubric: string;
  dimension: LocalisationAuditDimension;
  status: LocalisationAuditCriterionStatus;
  score: number | null;
  method: LocalisationAuditCreditResult["method"];
  findings: LocalisationAuditFinding[];
};

export function creditCriterionStatus(
  credit: LocalisationAuditCreditResult,
): LocalisationAuditCriterionStatus {
  if (credit.method === "na" || credit.score == null) {
    return "na";
  }
  if (credit.score >= LOCALISATION_AUDIT_CRITERION_PASS_SCORE) {
    return "pass";
  }
  return "fail";
}

/**
 * Join catalog metadata with scored credits and findings into a Lighthouse-style
 * criteria list. Credits without a catalog entry are skipped.
 */
export function buildLocalisationAuditCriteria(
  credits: LocalisationAuditCreditResult[],
  findings: LocalisationAuditFinding[] = [],
): LocalisationAuditCriterion[] {
  const findingsByCredit = new Map<string, LocalisationAuditFinding[]>();
  for (const finding of findings) {
    if (!finding.creditId) continue;
    const list = findingsByCredit.get(finding.creditId) ?? [];
    list.push(finding);
    findingsByCredit.set(finding.creditId, list);
  }

  const catalogOrder = new Map(
    LOCALISATION_AUDIT_CREDITS.map((credit, index) => [credit.id, index]),
  );

  return credits
    .flatMap((credit) => {
      const definition = creditById(credit.id);
      if (!definition) return [];
      return [
        {
          id: credit.id,
          title: definition.title,
          rubric: definition.rubric,
          dimension: credit.dimension,
          status: creditCriterionStatus(credit),
          score: credit.score,
          method: credit.method,
          findings: findingsByCredit.get(credit.id) ?? [],
        } satisfies LocalisationAuditCriterion,
      ];
    })
    .toSorted((a, b) => (catalogOrder.get(a.id) ?? 0) - (catalogOrder.get(b.id) ?? 0));
}

export function groupLocalisationAuditCriteria(criteria: LocalisationAuditCriterion[]) {
  const passed: LocalisationAuditCriterion[] = [];
  const failed: LocalisationAuditCriterion[] = [];
  const notApplicable: LocalisationAuditCriterion[] = [];

  for (const criterion of criteria) {
    if (criterion.status === "pass") {
      passed.push(criterion);
    } else if (criterion.status === "fail") {
      failed.push(criterion);
    } else {
      notApplicable.push(criterion);
    }
  }

  return { passed, failed, notApplicable };
}
