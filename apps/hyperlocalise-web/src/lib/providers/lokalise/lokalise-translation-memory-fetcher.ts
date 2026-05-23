import type { ExternalTmsTranslationMemoryFetcher } from "@/lib/providers/external-tms-tm-sync";

import {
  buildLokaliseProjectTranslationMemoryExternalId,
  pickLokaliseKeyTranslation,
} from "./normalize-lokalise-context-matches";
import {
  buildLokaliseProjectUrl,
  extractLokaliseKeyName,
  LokaliseApiClient,
  LokaliseApiError,
  LOKALISE_TM_SYNC_MAX_KEYS,
  partitionLokaliseLocales,
} from "./lokalise-api";

export const fetchLokaliseTranslationMemories: ExternalTmsTranslationMemoryFetcher = async ({
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

  let keys;
  let languages;
  try {
    [keys, languages] = await Promise.all([
      client.listKeys(projectId, { includeTranslations: true }),
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
  const memoryTargetLocales =
    targetLocales.length > 0
      ? uniqueLocales(targetLocales)
      : uniqueLocales(project.targetLocales ?? []);

  const entries = [];
  const cappedKeys = keys.slice(0, LOKALISE_TM_SYNC_MAX_KEYS);

  for (const key of cappedKeys) {
    const sourceTranslation = pickLokaliseKeyTranslation(key, sourceLocale);
    if (!sourceTranslation?.translation.trim()) {
      continue;
    }

    const sourceText = sourceTranslation.translation.trim();
    for (const targetLocale of memoryTargetLocales) {
      const targetTranslation = pickLokaliseKeyTranslation(key, targetLocale);
      const targetText = targetTranslation?.translation.trim();
      if (!targetText) {
        continue;
      }

      entries.push({
        externalKey: `${key.keyId}:${targetLocale}`,
        sourceLocale,
        targetLocale,
        sourceText,
        targetText,
        metadata: {
          lokaliseKeyId: key.keyId,
          lokaliseKeyName: extractLokaliseKeyName(key.keyName),
        },
      });
    }
  }

  return [
    {
      externalMemoryId: buildLokaliseProjectTranslationMemoryExternalId(projectId),
      name: `Lokalise translation memory (${projectId})`,
      description: "Project key translations used as translation memory segments",
      sourceLocale,
      localeCoverage: uniqueLocales([sourceLocale, ...memoryTargetLocales]),
      segmentCount: entries.length,
      metadata: {
        lokaliseProjectId: projectId,
        lokaliseTranslationMemoryKind: "project_keys",
        scannedKeyCount: cappedKeys.length,
      },
      externalUrl: buildLokaliseProjectUrl(projectId),
      entries,
    },
  ];
};

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
