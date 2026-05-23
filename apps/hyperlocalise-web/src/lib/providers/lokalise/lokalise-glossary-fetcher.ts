import type { ExternalTmsGlossaryFetcher } from "@/lib/providers/external-tms-glossary-sync";

import {
  buildLokaliseProjectGlossaryExternalId,
  pickLokaliseGlossaryTranslation,
  resolveLokaliseGlossaryTranslationLocale,
  uniqueLocales,
} from "./normalize-lokalise-context-matches";
import {
  buildLokaliseProjectUrl,
  LokaliseApiClient,
  LokaliseApiError,
  partitionLokaliseLocales,
} from "./lokalise-api";

export const fetchLokaliseGlossaries: ExternalTmsGlossaryFetcher = async ({
  credential,
  secretMaterial,
  externalProjectId,
  project,
}) => {
  const projectId = externalProjectId.trim();
  if (!projectId) {
    throw new Error("invalid_lokalise_project_id");
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

  const sourceLocale = project.sourceLocale?.trim() || languages[0]?.langIso || "en";
  const baseLanguageId =
    typeof project.providerMetadata?.baseLanguageId === "number"
      ? project.providerMetadata.baseLanguageId
      : null;
  const { targetLocales } = partitionLokaliseLocales(
    {
      baseLanguageId,
      baseLanguageIso: sourceLocale,
    },
    languages,
  );
  const glossaryTargetLocales =
    targetLocales.length > 0
      ? uniqueLocales(targetLocales)
      : uniqueLocales(project.targetLocales ?? []);

  if (glossaryTargetLocales.length === 0) {
    glossaryTargetLocales.push(sourceLocale);
  }

  const languageIsoById = new Map(
    languages
      .filter((language) => language.langId > 0 && language.langIso.trim())
      .map((language) => [language.langId, language.langIso.trim()] as const),
  );

  const externalGlossaryId = buildLokaliseProjectGlossaryExternalId(projectId);
  const glossaryName = `Lokalise glossary (${projectId})`;

  return glossaryTargetLocales.map((targetLocale) => {
    const localeTerms = terms.flatMap((term) => {
      const sourceTerm = term.term.trim();
      const targetTerm = pickLokaliseGlossaryTranslation(term, targetLocale, languageIsoById);
      if (!sourceTerm || !targetTerm) {
        return [];
      }

      return [
        {
          externalKey: String(term.id),
          sourceTerm,
          targetTerm,
          description: term.description ?? undefined,
          status: term.forbidden ? "forbidden" : null,
          forbidden: term.forbidden,
          metadata: {
            lokaliseGlossaryTermId: term.id,
            caseSensitive: term.caseSensitive,
            translatable: term.translatable,
            tags: term.tags,
            targetLocale,
            translationLocales: term.translations
              .map((translation) =>
                resolveLokaliseGlossaryTranslationLocale(translation, languageIsoById),
              )
              .filter((locale): locale is string => Boolean(locale)),
          },
        },
      ];
    });

    return {
      externalGlossaryId,
      name: glossaryName,
      description: "Project glossary synced from Lokalise",
      sourceLocale,
      targetLocale,
      externalResourceType: "glossary" as const,
      localeCoverage: uniqueLocales([sourceLocale, ...glossaryTargetLocales]),
      termCount: localeTerms.length,
      termCapabilities: { mode: "synced_import", search: true },
      metadata: {
        lokaliseProjectId: projectId,
        lokaliseGlossaryKind: "project_glossary",
      },
      externalUrl: buildLokaliseProjectUrl(projectId),
      terms: localeTerms,
    };
  });
};
