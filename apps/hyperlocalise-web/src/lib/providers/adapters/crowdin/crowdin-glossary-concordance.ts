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
import { createHash } from "node:crypto";

import {
  toCrowdinGlossaryLanguageId,
  toNativeGlossaryLocale,
} from "@/lib/providers/adapters/crowdin/crowdin-glossary-language";
import type {
  CrowdinApiClient,
  CrowdinGlossaryConcordanceSearchResult,
  CrowdinGlossaryConcordanceTerm,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import { mapWithConcurrency } from "@/lib/primitives/map-with-concurrency/map-with-concurrency";
import {
  hasGlossaryExpectedTarget,
  normalizeProviderGlossaryMatch,
  type NormalizedGlossaryConcept,
  type NormalizedGlossaryConceptTerm,
  type NormalizedGlossaryMatch,
} from "@/lib/providers/contracts/glossary-match";
import { normalizedGlossaryTermStatusFromStatus } from "@/lib/providers/contracts/glossary-term-status";

export function stableCrowdinConcordanceTermId(
  glossaryId: string,
  sourceTerm: string,
  targetLocale: string,
): string {
  return createHash("sha256")
    .update(`${glossaryId}\0${sourceTerm}\0${targetLocale}`, "utf8")
    .digest("hex");
}

export function pickCrowdinConcordanceTermText(
  terms: Array<{ languageId: string; text: string }>,
  languageId: string,
): string | null {
  const match = terms.find((term) => term.languageId === languageId);
  return match?.text?.trim() ? match.text.trim() : null;
}

export function pickCrowdinConcordanceTermStatus(
  terms: Array<{ languageId: string; status?: string | null }>,
  languageId: string,
): string | null {
  const match = terms.find((term) => term.languageId === languageId);
  return match?.status ?? null;
}

export function resolveCrowdinConcordanceExternalConceptId(
  result: CrowdinGlossaryConcordanceSearchResult,
): string | null {
  if (result.concept) {
    return String(result.concept.id);
  }

  const termConceptId =
    result.sourceTerms.find((term) => term.conceptId != null)?.conceptId ??
    result.targetTerms.find((term) => term.conceptId != null)?.conceptId;

  return termConceptId != null ? String(termConceptId) : null;
}

export function resolveCrowdinConcordanceTranslatableKey(
  result: CrowdinGlossaryConcordanceSearchResult,
): string | null {
  const conceptId = resolveCrowdinConcordanceExternalConceptId(result);
  if (conceptId == null) {
    return null;
  }

  return `${result.glossary.id}:${conceptId}`;
}

export function resolveCrowdinConcordanceTranslatableFromResult(
  result: CrowdinGlossaryConcordanceSearchResult,
  resolvedByConceptId?: Map<string, boolean>,
): boolean {
  if (result.concept?.translatable !== undefined) {
    return result.concept.translatable;
  }

  const key = resolveCrowdinConcordanceTranslatableKey(result);
  if (key != null) {
    const resolved = resolvedByConceptId?.get(key);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  return true;
}

export async function loadCrowdinConcordanceTranslatableByConceptId(input: {
  client: CrowdinApiClient;
  results: CrowdinGlossaryConcordanceSearchResult[];
}): Promise<Map<string, boolean>> {
  const pending = new Map<string, { glossaryId: number; conceptId: number }>();

  for (const result of input.results) {
    if (result.concept?.translatable !== undefined) {
      continue;
    }

    const key = resolveCrowdinConcordanceTranslatableKey(result);
    if (key == null) {
      continue;
    }

    const conceptId = resolveCrowdinConcordanceExternalConceptId(result);
    if (conceptId == null) {
      continue;
    }

    pending.set(key, {
      glossaryId: result.glossary.id,
      conceptId: Number(conceptId),
    });
  }

  const resolved = new Map<string, boolean>();
  await mapWithConcurrency([...pending.entries()], 5, async ([key, { glossaryId, conceptId }]) => {
    try {
      const concept = await input.client.getGlossaryConcept(glossaryId, conceptId);
      resolved.set(key, concept.translatable);
    } catch {
      resolved.set(key, true);
    }
  });

  return resolved;
}

export function toCrowdinConcordanceConceptTerm(
  term: CrowdinGlossaryConcordanceTerm,
  preferredLocales: string[],
): NormalizedGlossaryConceptTerm {
  const termStatus = normalizedGlossaryTermStatusFromStatus(term.status);
  return {
    id: String(term.id),
    locale: toNativeGlossaryLocale(term.languageId, preferredLocales),
    text: term.text,
    status: term.status,
    forbidden: termStatus.forbidden,
    preferred: termStatus.preferred,
    termType: term.type,
    partOfSpeech: term.partOfSpeech,
    gender: term.gender,
  };
}

export function mapCrowdinGlossaryConcordanceSearchResult(input: {
  result: CrowdinGlossaryConcordanceSearchResult;
  index: number;
  resourceId: string;
  glossaryName: string;
  sourceLocale: string;
  targetLocale: string;
  stableTermIdGlossaryKey?: string;
  translatable?: boolean;
}): NormalizedGlossaryMatch | null {
  const sourceLanguageId = toCrowdinGlossaryLanguageId(input.sourceLocale);
  const targetLanguageId = toCrowdinGlossaryLanguageId(input.targetLocale);
  const sourceTerm = pickCrowdinConcordanceTermText(input.result.sourceTerms, sourceLanguageId);
  const targetTerm = pickCrowdinConcordanceTermText(input.result.targetTerms, targetLanguageId);
  if (!sourceTerm) {
    return null;
  }

  const translatable = input.translatable ?? true;
  const isUntranslatable = translatable === false;
  const effectiveTargetTerm = isUntranslatable ? sourceTerm : (targetTerm ?? "");

  const externalGlossaryId = String(input.result.glossary.id);
  const status =
    pickCrowdinConcordanceTermStatus(input.result.targetTerms, targetLanguageId) ??
    pickCrowdinConcordanceTermStatus(input.result.sourceTerms, sourceLanguageId);
  const providerTermId = input.result.sourceTerms[0]?.id ?? input.result.targetTerms[0]?.id;
  const stableTermIdGlossaryKey = input.stableTermIdGlossaryKey ?? input.resourceId;
  const externalTermId =
    providerTermId != null
      ? String(providerTermId)
      : stableCrowdinConcordanceTermId(stableTermIdGlossaryKey, sourceTerm, input.targetLocale);

  const externalConceptId = resolveCrowdinConcordanceExternalConceptId(input.result);

  const preferredLocales = [input.sourceLocale, input.targetLocale];
  const concept: NormalizedGlossaryConcept = {
    id: externalConceptId ?? externalTermId,
    primaryTerm: sourceTerm,
    subject: input.result.concept?.subject,
    definition: input.result.concept?.definition,
    glossaryUrl: null,
    translatable,
    sourceTerms: input.result.sourceTerms.map((term) =>
      toCrowdinConcordanceConceptTerm(term, preferredLocales),
    ),
    targetTerms: input.result.targetTerms.map((term) =>
      toCrowdinConcordanceConceptTerm(term, preferredLocales),
    ),
  };

  return normalizeProviderGlossaryMatch({
    sourceTerm,
    targetTerm: effectiveTargetTerm,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    providerKind: "crowdin",
    resourceId: input.resourceId,
    externalResourceId: externalGlossaryId,
    externalTermId,
    externalConceptId,
    glossaryName: input.glossaryName,
    rank: 1 - input.index * 0.01,
    status: { status },
    concept,
  });
}

export function sortCrowdinConcordanceMatches(
  matches: NormalizedGlossaryMatch[],
  limit: number,
): NormalizedGlossaryMatch[] {
  return matches
    .toSorted((left, right) => {
      const leftHasExpectedTarget = hasGlossaryExpectedTarget(left);
      const rightHasExpectedTarget = hasGlossaryExpectedTarget(right);
      if (leftHasExpectedTarget !== rightHasExpectedTarget) {
        return leftHasExpectedTarget ? -1 : 1;
      }
      return right.rank - left.rank;
    })
    .slice(0, limit);
}
