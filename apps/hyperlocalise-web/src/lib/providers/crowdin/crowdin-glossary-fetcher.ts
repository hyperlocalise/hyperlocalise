import type { ExternalTmsGlossaryFetcher } from "@/lib/providers/external-tms-glossary-sync";

import { CrowdinApiClient, CrowdinApiError } from "./crowdin-api";
import { isCrowdinResourceLinkedToProject } from "./crowdin-resource-scope";

export const fetchCrowdinGlossaries: ExternalTmsGlossaryFetcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const client = new CrowdinApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? undefined,
  });

  const crowdinProjectId = Number(externalProjectId);
  if (!Number.isFinite(crowdinProjectId) || crowdinProjectId <= 0) {
    throw new Error("invalid_crowdin_project_id");
  }

  let glossaries;
  try {
    glossaries = await client.listGlossaries();
  } catch (error) {
    if (error instanceof CrowdinApiError && error.status === 401) {
      throw new Error("crowdin_auth_invalid");
    }
    throw error;
  }

  const sourceLocale = project.sourceLocale ?? "en";
  const targetLocales = project.targetLocales ?? [];

  const scoped = glossaries.filter((glossary) =>
    isCrowdinResourceLinkedToProject({
      projectId: crowdinProjectId,
      projectIds: glossary.projectIds,
      defaultProjectIds: glossary.defaultProjectIds,
    }),
  );

  const results = await Promise.all(
    scoped.map(async (glossary) => {
      try {
        const terms = await client.listGlossaryTerms(glossary.id);
        const glossaryTargetLocales = uniqueLocales([
          ...targetLocales,
          ...glossary.languageIds.filter((locale) => locale !== glossary.languageId),
        ]);

        const termRows = buildGlossaryTermRows({
          glossaryId: glossary.id,
          sourceLanguageId: glossary.languageId,
          terms,
          targetLocales: glossaryTargetLocales.length > 0 ? glossaryTargetLocales : [sourceLocale],
        });

        return glossaryTargetLocales.map((targetLocale) => ({
          externalGlossaryId: String(glossary.id),
          name: glossary.name,
          description: glossary.description ?? "",
          sourceLocale: glossary.languageId,
          targetLocale,
          localeCoverage: uniqueLocales([glossary.languageId, ...glossary.languageIds]),
          termCount: glossary.terms,
          externalUrl: glossary.webUrl,
          metadata: {
            crowdinGlossaryId: glossary.id,
            crowdinProjectId,
          },
          terms: termRows
            .filter((term) => term.targetLocale === targetLocale)
            .map((term) => ({
              externalKey: term.externalKey,
              sourceTerm: term.sourceTerm,
              targetTerm: term.targetTerm,
              description: term.description,
              partOfSpeech: term.partOfSpeech,
              status: term.status,
              forbidden: term.forbidden,
              notes: term.notes,
              metadata: term.metadata,
            })),
        }));
      } catch (error) {
        if (error instanceof CrowdinApiError && error.status === 401) {
          throw new Error("crowdin_auth_invalid");
        }

        return [
          {
            externalGlossaryId: String(glossary.id),
            name: glossary.name,
            description: glossary.description ?? "",
            sourceLocale: glossary.languageId,
            targetLocale: targetLocales[0] ?? glossary.languageIds[0] ?? sourceLocale,
            localeCoverage: uniqueLocales([glossary.languageId, ...glossary.languageIds]),
            termCount: glossary.terms,
            externalUrl: glossary.webUrl,
            syncErrorMessage: error instanceof Error ? error.message : "glossary_term_fetch_failed",
            metadata: {
              crowdinGlossaryId: glossary.id,
              crowdinProjectId,
            },
            terms: [],
          },
        ];
      }
    }),
  );

  return results.flat();
};

function buildGlossaryTermRows(input: {
  glossaryId: number;
  sourceLanguageId: string;
  terms: Array<{
    id: number;
    conceptId: number;
    languageId: string;
    text: string;
    description: string;
    partOfSpeech: string;
    status: string;
    note: string;
  }>;
  targetLocales: string[];
}) {
  const sourceTermsByConcept = new Map<number, (typeof input.terms)[number]>();
  const targetTermsByConcept = new Map<number, Array<(typeof input.terms)[number]>>();

  for (const term of input.terms) {
    if (term.languageId === input.sourceLanguageId) {
      if (!sourceTermsByConcept.has(term.conceptId)) {
        sourceTermsByConcept.set(term.conceptId, term);
      }
      continue;
    }

    const bucket = targetTermsByConcept.get(term.conceptId) ?? [];
    bucket.push(term);
    targetTermsByConcept.set(term.conceptId, bucket);
  }

  const rows: Array<{
    externalKey: string;
    sourceTerm: string;
    targetTerm: string;
    targetLocale: string;
    description: string;
    partOfSpeech: string;
    status: string;
    forbidden: boolean | null;
    notes: string | null;
    metadata: Record<string, unknown>;
  }> = [];

  for (const [conceptId, sourceTerm] of sourceTermsByConcept) {
    const targets = targetTermsByConcept.get(conceptId) ?? [];
    for (const targetLocale of input.targetLocales) {
      const targetTerm = targets.find((term) => term.languageId === targetLocale);

      if (!targetTerm?.text.trim()) {
        continue;
      }

      rows.push({
        externalKey: `${input.glossaryId}:${conceptId}:${targetLocale}`,
        sourceTerm: sourceTerm.text,
        targetTerm: targetTerm.text,
        targetLocale,
        description: sourceTerm.description || targetTerm.description,
        partOfSpeech: sourceTerm.partOfSpeech || targetTerm.partOfSpeech,
        status: targetTerm.status || sourceTerm.status,
        forbidden: null,
        notes: targetTerm.note || sourceTerm.note || null,
        metadata: {
          crowdinTermId: targetTerm.id,
          crowdinConceptId: conceptId,
        },
      });
    }
  }

  return rows;
}

function uniqueLocales(locales: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const locale of locales) {
    const trimmed = locale.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}
