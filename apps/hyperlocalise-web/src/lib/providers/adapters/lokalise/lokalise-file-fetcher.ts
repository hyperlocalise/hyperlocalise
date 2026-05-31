import type { ExternalTmsFileKeyFetcher } from "@/lib/providers/sync/external-tms-file-sync";

import {
  buildLokaliseProjectUrl,
  extractLokaliseKeyName,
  inferFormatFromFilename,
  listLokaliseFilenameEntries,
  LOKALISE_DEFAULT_BASE_URL,
  LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
  LokaliseApiClient,
  LokaliseApiError,
  type LokaliseKey,
} from "./lokalise-api";
import {
  buildLokaliseFileExternalResourceId,
  buildLokaliseFileSourcePath,
  buildLokaliseKeyExternalResourceId,
  buildLokaliseKeySourcePath,
  mapLokaliseTranslationReadiness,
} from "./lokalise-locale-readiness";

type DiscoveredFile = {
  platform: string;
  filename: string;
  format: string | null;
  tags: Set<string>;
  keyIds: Set<number>;
  revision: string | null;
};

export const fetchLokaliseFileKeys: ExternalTmsFileKeyFetcher = async ({
  credential,
  externalProjectId,
  project,
  secretMaterial,
}) => {
  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });

  if (!externalProjectId.trim()) {
    throw new Error("invalid_lokalise_project_id");
  }

  let keys;
  let languages;
  try {
    [keys, languages] = await Promise.all([
      client.listKeys(externalProjectId, { includeTranslations: true }),
      client.listProjectLanguages(externalProjectId),
    ]);
  } catch (error) {
    throw mapLokaliseFetcherError(error);
  }

  const projectMetadata = readProjectMetadata(project);
  const baseLanguageId =
    typeof projectMetadata.baseLanguageId === "number" ? projectMetadata.baseLanguageId : null;
  const sourceLocale =
    project.sourceLocale?.trim() ||
    languages.find((language) => language.langId === baseLanguageId)?.langIso.trim() ||
    null;
  const targetLocales =
    project.targetLocales.length > 0
      ? project.targetLocales
      : languages
          .filter((language) => {
            if (baseLanguageId != null) {
              return language.langId !== baseLanguageId;
            }
            if (sourceLocale) {
              return language.langIso.trim() !== sourceLocale;
            }
            return false;
          })
          .map((language) => language.langIso.trim())
          .filter((locale): locale is string => Boolean(locale));

  const externalUrl = buildLokaliseProjectUrl(externalProjectId);
  const filesByResourceId = new Map<string, DiscoveredFile>();

  for (const key of keys) {
    for (const entry of listLokaliseFilenameEntries(key.filenames)) {
      const resourceId = buildLokaliseFileExternalResourceId(entry.platform, entry.filename);
      const existing = filesByResourceId.get(resourceId);
      if (existing) {
        existing.keyIds.add(key.keyId);
        for (const tag of key.tags) {
          existing.tags.add(tag);
        }
        existing.revision = pickLatestRevision(
          existing.revision,
          key.translationsModifiedAt ?? key.modifiedAt,
        );
        continue;
      }

      filesByResourceId.set(resourceId, {
        platform: entry.platform,
        filename: entry.filename,
        format: inferFormatFromFilename(entry.filename),
        tags: new Set(key.tags),
        keyIds: new Set([key.keyId]),
        revision: key.translationsModifiedAt ?? key.modifiedAt,
      });
    }
  }

  const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];
  const keyById = new Map(keys.map((key) => [key.keyId, key]));

  for (const file of filesByResourceId.values()) {
    const scopedKeys = [...file.keyIds]
      .map((id) => keyById.get(id))
      .filter((key): key is LokaliseKey => key != null);
    results.push({
      externalResourceId: buildLokaliseFileExternalResourceId(file.platform, file.filename),
      resourceType: "file",
      sourcePath: buildLokaliseFileSourcePath(sourceLocale, file.platform, file.filename),
      displayName: file.filename,
      format: file.format,
      sourceLocale,
      targetLocales,
      revision: file.revision,
      externalUrl,
      syncState: "synced",
      localeReadiness: buildFileLocaleReadiness({
        keys: scopedKeys,
        targetLocales,
      }),
      providerPayload: {
        platform: file.platform,
        filename: file.filename,
        tags: [...file.tags],
        keyIds: [...file.keyIds],
        bundleDownload: {
          bundleStructure: LOKALISE_DEFAULT_BUNDLE_STRUCTURE,
          format: file.format,
          filterLangs: targetLocales,
          originalFilenames: false,
        },
      },
    });
  }

  for (const key of keys) {
    const keyName = extractLokaliseKeyName(key.keyName);
    if (!keyName) {
      continue;
    }

    const primaryFilename = pickPrimaryFilename(key);
    results.push({
      externalResourceId: buildLokaliseKeyExternalResourceId(key.keyId),
      resourceType: "key",
      sourcePath: buildLokaliseKeySourcePath(keyName, primaryFilename),
      displayName: keyName,
      format: primaryFilename ? inferFormatFromFilename(primaryFilename) : null,
      sourceLocale,
      targetLocales,
      revision: key.translationsModifiedAt ?? key.modifiedAt,
      externalUrl,
      syncState: "synced",
      localeReadiness: buildKeyLocaleReadiness({
        key,
        targetLocales,
      }),
      providerPayload: {
        id: key.keyId,
        key: keyName,
        name: keyName,
        description: key.description,
        context: key.context,
        platforms: key.platforms,
        filenames: buildNonEmptyFilenamesPayload(key.filenames),
        tags: key.tags,
        isPlural: key.isPlural,
        isHidden: key.isHidden,
        isArchived: key.isArchived,
        createdAt: key.createdAt,
        modifiedAt: key.modifiedAt,
        translationsModifiedAt: key.translationsModifiedAt,
      },
    });
  }

  return results;
};

function buildKeyLocaleReadiness(input: { key: LokaliseKey; targetLocales: string[] }) {
  const localeReadiness: Record<string, string> = {};
  const translationsByLocale = new Map(
    input.key.translations.map((translation) => [translation.languageIso, translation]),
  );

  for (const locale of input.targetLocales) {
    const translation = translationsByLocale.get(locale);
    localeReadiness[locale] = mapLokaliseTranslationReadiness({
      content: translation?.translation,
      isUnverified: translation?.isUnverified,
      isReviewed: translation?.isReviewed,
      isArchived: input.key.isArchived,
      isHidden: input.key.isHidden,
    });
  }

  return localeReadiness;
}

function buildFileLocaleReadiness(input: { keys: LokaliseKey[]; targetLocales: string[] }) {
  const localeReadiness: Record<string, string> = {};
  const keysWithTranslations = input.keys.map((key) => ({
    key,
    translationsByLocale: new Map(
      key.translations.map((translation) => [translation.languageIso, translation]),
    ),
  }));

  for (const locale of input.targetLocales) {
    const statuses = keysWithTranslations.map(({ key, translationsByLocale }) => {
      const translation = translationsByLocale.get(locale);
      return mapLokaliseTranslationReadiness({
        content: translation?.translation,
        isUnverified: translation?.isUnverified,
        isReviewed: translation?.isReviewed,
        isArchived: key.isArchived,
        isHidden: key.isHidden,
      });
    });

    if (statuses.length === 0) {
      localeReadiness[locale] = "missing";
      continue;
    }

    const activeStatuses = statuses.filter((status) => status !== "excluded");
    if (activeStatuses.length === 0) {
      localeReadiness[locale] = "excluded";
      continue;
    }

    if (activeStatuses.every((status) => status === "ready")) {
      localeReadiness[locale] = "ready";
      continue;
    }

    if (activeStatuses.some((status) => status === "missing")) {
      localeReadiness[locale] = "missing";
      continue;
    }

    localeReadiness[locale] = "unverified";
  }

  return localeReadiness;
}

function buildNonEmptyFilenamesPayload(filenames: LokaliseKey["filenames"]) {
  return Object.fromEntries(
    listLokaliseFilenameEntries(filenames).map((entry) => [entry.platform, entry.filename]),
  );
}

function pickPrimaryFilename(key: LokaliseKey) {
  for (const platform of key.platforms) {
    const normalizedPlatform = platform.trim().toLowerCase();
    if (normalizedPlatform === "web" && key.filenames.web.trim()) {
      return key.filenames.web;
    }
    if (normalizedPlatform === "ios" && key.filenames.ios.trim()) {
      return key.filenames.ios;
    }
    if (normalizedPlatform === "android" && key.filenames.android.trim()) {
      return key.filenames.android;
    }
    if (normalizedPlatform === "other" && key.filenames.other.trim()) {
      return key.filenames.other;
    }
  }

  const entries = listLokaliseFilenameEntries(key.filenames);
  return entries[0]?.filename ?? null;
}

function pickLatestRevision(current: string | null, candidate: string | null) {
  if (!current) {
    return candidate;
  }

  if (!candidate) {
    return current;
  }

  return candidate > current ? candidate : current;
}

function readProjectMetadata(project: { providerMetadata: Record<string, unknown> }) {
  return project.providerMetadata;
}

function mapLokaliseFetcherError(error: unknown) {
  if (error instanceof LokaliseApiError && (error.status === 401 || error.status === 403)) {
    return new Error("lokalise_auth_invalid");
  }

  return error instanceof Error ? error : new Error("lokalise_fetch_failed");
}
