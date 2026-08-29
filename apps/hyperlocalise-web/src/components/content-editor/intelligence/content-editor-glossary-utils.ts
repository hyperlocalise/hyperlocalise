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
import type { ContentEditorGlossaryConcept } from "@/components/content-editor/shared/types";
import { canonicalizeLocale } from "@/lib/i18n/locales";

export function applyGlossaryTermToTarget(
  segmentSourceText: string,
  currentTargetText: string,
  term: { source: string; target: string; approved: boolean; forbidden: boolean },
): string {
  if (!term.approved || term.forbidden) {
    return currentTargetText;
  }

  if (currentTargetText.trim()) {
    if (currentTargetText.includes(term.source)) {
      return currentTargetText.replaceAll(term.source, term.target);
    }

    return currentTargetText;
  }

  if (segmentSourceText.includes(term.source)) {
    return segmentSourceText.replaceAll(term.source, term.target);
  }

  return term.target;
}

function canonicalLocaleOrSelf(locale: string) {
  return canonicalizeLocale(locale) ?? locale;
}

export function contentEditorGlossaryConceptHasTargetLocaleTerm(
  concept: Pick<ContentEditorGlossaryConcept, "targetTerms">,
  targetLocale: string,
) {
  const canonicalTargetLocale = canonicalLocaleOrSelf(targetLocale);
  return concept.targetTerms.some(
    (term) => canonicalLocaleOrSelf(term.locale) === canonicalTargetLocale,
  );
}

export function isCatGlossaryConceptVisibleForTargetLocale(
  concept: Pick<ContentEditorGlossaryConcept, "translatable" | "targetTerms">,
  targetLocale: string | undefined,
) {
  if (concept.translatable === false) {
    return true;
  }

  if (!targetLocale?.trim()) {
    return true;
  }

  return contentEditorGlossaryConceptHasTargetLocaleTerm(concept, targetLocale);
}
