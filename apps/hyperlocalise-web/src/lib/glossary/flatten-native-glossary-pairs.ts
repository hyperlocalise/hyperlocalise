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
  glossaryTermFlagsFromStatus,
  normalizedGlossaryTermStatusFromStatus,
} from "@/lib/providers/contracts/glossary-term-status";
import type { NormalizedGlossaryConceptTerm } from "@/lib/providers/contracts/glossary-match";

import { pickPreferredTermForLocale } from "./native-glossary";

export type GlossaryTermQueryRow = {
  id: string;
  conceptId: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: string;
  targetTerm: string;
  targetLocale: string;
  description: string;
  partOfSpeech: string;
  status: string;
  forbidden: boolean;
  caseSensitive: boolean;
  provenance: string;
  externalKey: string | null;
  reviewStatus: string;
};

export type NativeConceptTermRow = {
  id: string;
  locale: string;
  term: string;
  status: string;
  description: string;
  partOfSpeech: string;
  caseSensitive: boolean;
  provenance: string;
  reviewStatus: string;
  forbidden?: boolean;
};

function pairIsForbidden(statusForbidden: boolean, ...storedFlags: Array<boolean | undefined>) {
  return statusForbidden || storedFlags.some((flag) => flag === true);
}

export type NativeConceptGroup = {
  conceptId: string;
  glossaryId: string;
  glossaryName: string;
  translatable: boolean;
  terms: NativeConceptTermRow[];
};

function toNormalizedConceptTerm(row: NativeConceptTermRow): NormalizedGlossaryConceptTerm {
  const flags = glossaryTermFlagsFromStatus(row.status);
  return {
    id: row.id,
    locale: row.locale,
    text: row.term,
    status: row.status,
    preferred: flags.preferred,
    forbidden: flags.notRecommended,
    termType: null,
    partOfSpeech: row.partOfSpeech,
    gender: null,
  };
}

function buildPairRow(input: {
  id: string;
  conceptId: string;
  glossaryId: string;
  glossaryName: string;
  sourceTerm: NativeConceptTermRow;
  targetTerm: string;
  targetLocale: string;
  status: string;
  forbidden: boolean;
}): GlossaryTermQueryRow {
  return {
    id: input.id,
    conceptId: input.conceptId,
    glossaryId: input.glossaryId,
    glossaryName: input.glossaryName,
    sourceTerm: input.sourceTerm.term,
    targetTerm: input.targetTerm,
    targetLocale: input.targetLocale,
    description: input.sourceTerm.description,
    partOfSpeech: input.sourceTerm.partOfSpeech,
    status: input.status,
    forbidden: input.forbidden,
    caseSensitive: input.sourceTerm.caseSensitive,
    provenance: input.sourceTerm.provenance,
    externalKey: null,
    reviewStatus: input.sourceTerm.reviewStatus,
  };
}

export function flattenNativeConceptTermsToPairs(input: {
  concepts: NativeConceptGroup[];
  sourceLocale: string;
  targetLocales: string[];
  glossaryPriority?: Map<string, number>;
}): GlossaryTermQueryRow[] {
  const pairs: GlossaryTermQueryRow[] = [];

  for (const concept of input.concepts) {
    const sourceTerms = concept.terms.filter((term) => term.locale === input.sourceLocale);
    if (sourceTerms.length === 0) {
      continue;
    }

    const normalizedTerms = concept.terms.map(toNormalizedConceptTerm);

    for (const sourceTerm of sourceTerms) {
      const sourceStatus = normalizedGlossaryTermStatusFromStatus(sourceTerm.status);

      for (const targetLocale of input.targetLocales) {
        if (!concept.translatable) {
          pairs.push(
            buildPairRow({
              id: sourceTerm.id,
              conceptId: concept.conceptId,
              glossaryId: concept.glossaryId,
              glossaryName: concept.glossaryName,
              sourceTerm,
              targetTerm: sourceTerm.term,
              targetLocale,
              status: sourceTerm.status,
              forbidden: pairIsForbidden(sourceStatus.forbidden, sourceTerm.forbidden),
            }),
          );
          continue;
        }

        const localeTargetTerms = concept.terms.filter((term) => term.locale === targetLocale);
        const preferred = pickPreferredTermForLocale(normalizedTerms, targetLocale);

        if (preferred) {
          const targetStatus = normalizedGlossaryTermStatusFromStatus(preferred.status);
          const preferredRow = localeTargetTerms.find((term) => term.id === preferred.id);
          if (preferredRow) {
            pairs.push(
              buildPairRow({
                id: preferredRow.id,
                conceptId: concept.conceptId,
                glossaryId: concept.glossaryId,
                glossaryName: concept.glossaryName,
                sourceTerm,
                targetTerm: preferred.text,
                targetLocale,
                status: preferredRow.status,
                forbidden: pairIsForbidden(
                  sourceStatus.forbidden || targetStatus.forbidden,
                  sourceTerm.forbidden,
                  preferredRow.forbidden,
                ),
              }),
            );
          }
        }

        for (const targetRow of localeTargetTerms) {
          if (preferred?.id === targetRow.id) {
            continue;
          }
          if (!glossaryTermFlagsFromStatus(targetRow.status).notRecommended) {
            continue;
          }
          pairs.push(
            buildPairRow({
              id: targetRow.id,
              conceptId: concept.conceptId,
              glossaryId: concept.glossaryId,
              glossaryName: concept.glossaryName,
              sourceTerm,
              targetTerm: targetRow.term,
              targetLocale,
              status: targetRow.status,
              forbidden: true,
            }),
          );
        }
      }
    }
  }

  return pairs.toSorted((left, right) =>
    compareGlossaryTermQueryRows(left, right, input.glossaryPriority),
  );
}

export function compareGlossaryTermQueryRows(
  left: GlossaryTermQueryRow,
  right: GlossaryTermQueryRow,
  glossaryPriority?: Map<string, number>,
): number {
  if (glossaryPriority && glossaryPriority.size > 0) {
    const leftPriority = glossaryPriority.get(left.glossaryId) ?? 0;
    const rightPriority = glossaryPriority.get(right.glossaryId) ?? 0;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
  }
  if (left.glossaryName !== right.glossaryName) {
    return left.glossaryName.localeCompare(right.glossaryName);
  }
  if (left.sourceTerm !== right.sourceTerm) {
    return left.sourceTerm.localeCompare(right.sourceTerm);
  }
  if (left.targetLocale !== right.targetLocale) {
    return left.targetLocale.localeCompare(right.targetLocale);
  }
  if (left.forbidden !== right.forbidden) {
    return Number(left.forbidden) - Number(right.forbidden);
  }
  return left.targetTerm.localeCompare(right.targetTerm);
}
