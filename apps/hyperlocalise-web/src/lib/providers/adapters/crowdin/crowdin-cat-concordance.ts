import { createHash } from "node:crypto";

import type { NormalizedGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import { normalizeProviderGlossaryMatch } from "@/lib/providers/contracts/glossary-match";
import type { NormalizedTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";
import { normalizeProviderTranslationMemoryMatch } from "@/lib/providers/contracts/translation-memory-match";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";

function stableConcordanceTermId(
  glossaryId: string,
  sourceTerm: string,
  targetLocale: string,
): string {
  return createHash("sha256")
    .update(`${glossaryId}\0${sourceTerm}\0${targetLocale}`, "utf8")
    .digest("hex");
}

function pickTermText(
  terms: Array<{ languageId: string; text: string }>,
  locale: string,
): string | null {
  const match = terms.find((term) => term.languageId === locale);
  return match?.text?.trim() ? match.text.trim() : null;
}

function pickTermStatus(
  terms: Array<{ languageId: string; status?: string | null }>,
  locale: string,
): string | null {
  const match = terms.find((term) => term.languageId === locale);
  return match?.status ?? null;
}

export async function searchCrowdinCatConcordance(input: {
  client: CrowdinApiClient;
  externalProjectId: string;
  sourceLocale: string;
  targetLocale: string;
  sourceText: string;
  glossaryLimit?: number;
  translationMemoryLimit?: number;
}): Promise<{
  glossaryTerms: NormalizedGlossaryMatch[];
  translationMemoryMatches: NormalizedTranslationMemoryMatch[];
}> {
  const projectId = Number(input.externalProjectId);
  if (Number.isNaN(projectId)) {
    return { glossaryTerms: [], translationMemoryMatches: [] };
  }

  const glossaryLimit = input.glossaryLimit ?? 20;
  const translationMemoryLimit = input.translationMemoryLimit ?? 10;

  let glossaryResults: Awaited<ReturnType<CrowdinApiClient["glossaryConcordanceSearch"]>>;
  let translationMemoryResults: Awaited<ReturnType<CrowdinApiClient["concordanceSearch"]>>;

  try {
    [glossaryResults, translationMemoryResults] = await Promise.all([
      input.client.glossaryConcordanceSearch(projectId, {
        sourceLanguageId: input.sourceLocale,
        targetLanguageId: input.targetLocale,
        expressions: [input.sourceText],
      }),
      input.client.concordanceSearch(projectId, {
        sourceLanguageId: input.sourceLocale,
        targetLanguageId: input.targetLocale,
        expressions: [input.sourceText],
        minRelevant: 50,
        autoSubstitution: false,
      }),
    ]);
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const glossaryTerms: NormalizedGlossaryMatch[] = [];

  for (const [index, result] of glossaryResults.entries()) {
    const sourceTerm = pickTermText(result.sourceTerms, input.sourceLocale);
    const targetTerm = pickTermText(result.targetTerms, input.targetLocale);
    if (!sourceTerm || !targetTerm) {
      continue;
    }

    const externalGlossaryId = String(result.glossary.id);
    const status =
      pickTermStatus(result.targetTerms, input.targetLocale) ??
      pickTermStatus(result.sourceTerms, input.sourceLocale);
    const providerTermId = result.sourceTerms[0]?.id ?? result.targetTerms[0]?.id;
    const externalTermId =
      providerTermId != null
        ? String(providerTermId)
        : stableConcordanceTermId(externalGlossaryId, sourceTerm, input.targetLocale);

    glossaryTerms.push(
      normalizeProviderGlossaryMatch({
        sourceTerm,
        targetTerm,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        providerKind: "crowdin",
        resourceId: externalGlossaryId,
        externalResourceId: externalGlossaryId,
        externalTermId,
        glossaryName: result.glossary.name,
        rank: 1 - index * 0.01,
        status: { status },
      }),
    );
  }

  const translationMemoryMatches = translationMemoryResults
    .slice(0, translationMemoryLimit)
    .map((result, index) =>
      normalizeProviderTranslationMemoryMatch({
        sourceText: result.source,
        targetText: result.target,
        sourceLocale: input.sourceLocale,
        targetLocale: input.targetLocale,
        matchScore: result.relevant,
        providerKind: "crowdin",
        resourceId: String(result.tm.id),
        externalResourceId: String(result.tm.id),
        externalSegmentId: String(result.recordId),
        memoryName: result.tm.name,
        rank: 1 - index * 0.01,
      }),
    );

  return {
    glossaryTerms: glossaryTerms.slice(0, glossaryLimit),
    translationMemoryMatches,
  };
}
