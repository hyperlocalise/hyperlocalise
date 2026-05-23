import { createHash } from "node:crypto";

import type { ExternalTmsGlossaryMatcher } from "@/lib/providers/provider-glossary-matchers";
import { normalizeProviderGlossaryMatch } from "@/lib/translation/glossary-match";

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

export const searchCrowdinGlossaryMatches: ExternalTmsGlossaryMatcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  glossaries,
  sourceLocale,
  targetLocale,
  sourceText,
  limit,
}) => {
  const projectId = Number(externalProjectId);
  if (Number.isNaN(projectId)) {
    return [];
  }

  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  let results: Awaited<ReturnType<CrowdinApiClient["glossaryConcordanceSearch"]>>;
  try {
    results = await client.glossaryConcordanceSearch(projectId, {
      sourceLanguageId: sourceLocale,
      targetLanguageId: targetLocale,
      expressions: [sourceText],
    });
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const glossaryByExternalId = new Map(
    glossaries
      .filter((glossary) => glossary.externalGlossaryId)
      .map((glossary) => [glossary.externalGlossaryId, glossary]),
  );

  const liveMatches = [];

  for (const [index, result] of results.entries()) {
    const glossary = glossaryByExternalId.get(String(result.glossary.id));
    if (!glossary) {
      continue;
    }

    const sourceTerm = pickTermText(result.sourceTerms, sourceLocale);
    const targetTerm = pickTermText(result.targetTerms, targetLocale);
    if (!sourceTerm || !targetTerm) {
      continue;
    }

    const status =
      pickTermStatus(result.targetTerms, targetLocale) ??
      pickTermStatus(result.sourceTerms, sourceLocale);

    const providerTermId = result.sourceTerms[0]?.id ?? result.targetTerms[0]?.id;
    const externalTermId =
      providerTermId != null
        ? String(providerTermId)
        : stableConcordanceTermId(glossary.id, sourceTerm, targetLocale);

    liveMatches.push(
      normalizeProviderGlossaryMatch({
        sourceTerm,
        targetTerm,
        sourceLocale,
        targetLocale,
        providerKind: "crowdin",
        resourceId: glossary.id,
        externalResourceId: String(result.glossary.id),
        externalTermId,
        glossaryName: glossary.name,
        rank: 1 - index * 0.01,
        status: { status },
      }),
    );
  }

  return liveMatches.slice(0, limit);
};
