import type { ExternalTmsGlossaryMatcher } from "@/lib/providers/provider-glossary-matchers";
import { normalizeProviderGlossaryMatch } from "@/lib/translation/glossary-match";

import {
  buildLokaliseProjectGlossaryExternalId,
  matchesLokaliseGlossaryTerm,
  pickLokaliseGlossaryTranslation,
} from "./normalize-lokalise-context-matches";
import { LokaliseApiClient, LokaliseApiError } from "./lokalise-api";

export const searchLokaliseGlossaryMatches: ExternalTmsGlossaryMatcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  glossaries,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
}) => {
  const projectId = externalProjectId.trim();
  if (!projectId) {
    return [];
  }

  const expectedExternalGlossaryId = buildLokaliseProjectGlossaryExternalId(projectId);
  const glossaryByExternalId = new Map(
    glossaries
      .filter((glossary) => glossary.externalGlossaryId)
      .map((glossary) => [glossary.externalGlossaryId, glossary]),
  );
  const glossary = glossaryByExternalId.get(expectedExternalGlossaryId);
  if (!glossary) {
    return [];
  }

  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl,
  });

  let terms;
  let languages;
  try {
    [terms, languages] = await Promise.all([
      client.listGlossaryTerms(projectId),
      client.listProjectLanguages(projectId),
    ]);
  } catch (error) {
    if (error instanceof LokaliseApiError && error.status === 401) {
      throw new Error("lokalise_auth_invalid");
    }
    throw error;
  }

  const languageIsoById = new Map(
    languages
      .filter((language) => language.langId > 0 && language.langIso.trim())
      .map((language) => [language.langId, language.langIso.trim()] as const),
  );

  const liveMatches = [];

  for (const [index, term] of terms.entries()) {
    if (!matchesLokaliseGlossaryTerm(sourceText, term)) {
      continue;
    }

    const sourceTerm = term.term.trim();
    const targetTerm = pickLokaliseGlossaryTranslation(term, targetLocale, languageIsoById);
    if (!sourceTerm || !targetTerm) {
      continue;
    }

    liveMatches.push(
      normalizeProviderGlossaryMatch({
        sourceTerm,
        targetTerm,
        sourceLocale,
        targetLocale,
        description: term.description,
        caseSensitive: term.caseSensitive,
        providerKind: "lokalise",
        resourceId: glossary.id,
        externalResourceId: expectedExternalGlossaryId,
        externalTermId: String(term.id),
        glossaryName: glossary.name,
        rank: 1 - index * 0.01,
        status: {
          forbidden: term.forbidden,
        },
      }),
    );
  }

  return liveMatches.toSorted((left, right) => right.rank - left.rank).slice(0, limit);
};
