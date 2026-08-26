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
  CrowdinGlossaryConcordanceSearchResult,
  CrowdinGlossaryConcordanceTerm,
} from "@/lib/providers/adapters/crowdin/crowdin-api";
import {
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
}): NormalizedGlossaryMatch | null {
  const sourceLanguageId = toCrowdinGlossaryLanguageId(input.sourceLocale);
  const targetLanguageId = toCrowdinGlossaryLanguageId(input.targetLocale);
  const sourceTerm = pickCrowdinConcordanceTermText(input.result.sourceTerms, sourceLanguageId);
  const targetTerm = pickCrowdinConcordanceTermText(input.result.targetTerms, targetLanguageId);
  if (!sourceTerm || !targetTerm) {
    return null;
  }

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

  const preferredLocales = [input.sourceLocale, input.targetLocale];
  const concept: NormalizedGlossaryConcept = {
    id: input.result.concept ? String(input.result.concept.id) : externalTermId,
    primaryTerm: sourceTerm,
    subject: input.result.concept?.subject,
    definition: input.result.concept?.definition,
    glossaryUrl: null,
    sourceTerms: input.result.sourceTerms.map((term) =>
      toCrowdinConcordanceConceptTerm(term, preferredLocales),
    ),
    targetTerms: input.result.targetTerms.map((term) =>
      toCrowdinConcordanceConceptTerm(term, preferredLocales),
    ),
  };

  return normalizeProviderGlossaryMatch({
    sourceTerm,
    targetTerm,
    sourceLocale: input.sourceLocale,
    targetLocale: input.targetLocale,
    providerKind: "crowdin",
    resourceId: input.resourceId,
    externalResourceId: externalGlossaryId,
    externalTermId,
    externalConceptId: input.result.concept ? String(input.result.concept.id) : null,
    glossaryName: input.glossaryName,
    rank: 1 - input.index * 0.01,
    status: { status },
    concept,
  });
}
