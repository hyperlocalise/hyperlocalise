import type { ExternalTmsFileKeyFetcher } from "@/lib/providers/external-tms-file-sync";

import {
  PhraseApiClient,
  PhraseApiError,
  type PhraseKey,
  type PhraseLocale,
  type PhraseTranslation,
} from "./phrase-api";
import {
  buildPhraseKeyExternalResourceId,
  buildPhraseKeySourcePath,
  buildPhraseUploadSourcePath,
  mapPhraseTranslationReadiness,
} from "./phrase-locale-readiness";

const LOCALE_FETCH_CONCURRENCY = 8;

export const fetchPhraseFileKeys: ExternalTmsFileKeyFetcher = async ({
  credential,
  externalProjectId,
  project,
  secretMaterial,
}) => {
  const client = new PhraseApiClient({
    token: secretMaterial,
    region: credential.region,
    baseUrl: credential.baseUrl,
  });

  if (!externalProjectId.trim()) {
    throw new Error("invalid_phrase_project_id");
  }

  let locales: PhraseLocale[];
  let branches: string[];
  try {
    [locales, branches] = await Promise.all([
      client.listLocales(externalProjectId),
      client.listBranches(externalProjectId).then((items) => items.map((branch) => branch.name)),
    ]);
  } catch (error) {
    throw mapPhraseFetcherError(error);
  }

  const { sourceLocale, targetLocales, targetLocaleRefs, sourceLocaleRef } =
    partitionPhraseLocales(locales);
  const branchScopes = buildBranchScopes(branches);
  const projectMetadata = readProjectMetadata(project);
  const mainFormat =
    typeof projectMetadata.mainFormat === "string" ? projectMetadata.mainFormat : null;
  const accountSlug =
    typeof projectMetadata.accountSlug === "string" ? projectMetadata.accountSlug : null;
  const projectSlug = typeof projectMetadata.slug === "string" ? projectMetadata.slug : null;

  const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];

  for (const branch of branchScopes) {
    const listOptions = branch ? { branch } : {};

    let keys: PhraseKey[];
    let uploads: Awaited<ReturnType<typeof client.listUploads>>;
    try {
      [keys, uploads] = await Promise.all([
        client.listKeys(externalProjectId, listOptions),
        client.listUploads(externalProjectId, listOptions),
      ]);
    } catch (error) {
      throw mapPhraseFetcherError(error);
    }

    const translationsByKeyId = await loadTranslationsByKeyId({
      client,
      projectId: externalProjectId,
      locales,
      branch,
    });

    for (const upload of uploads) {
      const sourcePath = buildPhraseUploadSourcePath(sourceLocale, upload.filename);
      const uploadTags = mergeTags(upload.tags, upload.tag);
      const localeReadiness = buildUploadLocaleReadiness({
        keys,
        uploadsTags: uploadTags,
        targetLocaleRefs,
        translationsByKeyId,
      });

      results.push({
        externalResourceId: buildUploadExternalResourceId(upload.id, branch),
        resourceType: "file",
        sourcePath,
        displayName: upload.filename,
        format: upload.format ?? mainFormat,
        sourceLocale,
        targetLocales,
        revision: upload.updatedAt ?? upload.createdAt ?? null,
        externalUrl: upload.url ?? buildPhraseProjectUrl(accountSlug, projectSlug),
        syncState: upload.state === "success" ? "synced" : "pending",
        localeReadiness,
        providerPayload: {
          id: upload.id,
          name: upload.filename,
          branch,
          tags: uploadTags,
          tag: upload.tag,
          state: upload.state,
          format: upload.format,
          url: upload.url,
          localeDownload: sourceLocaleRef
            ? client.buildLocaleDownloadMetadata({
                projectId: externalProjectId,
                locale: sourceLocaleRef,
                fileFormat: upload.format ?? mainFormat,
                branch,
                tags: uploadTags,
              })
            : null,
        },
      });
    }

    for (const key of keys) {
      const localeReadiness = buildKeyLocaleReadiness({
        keyId: key.id,
        targetLocaleRefs,
        translationsByKeyId,
      });

      results.push({
        externalResourceId: buildPhraseKeyExternalResourceId(key.id, branch),
        resourceType: "key",
        sourcePath: buildPhraseKeySourcePath(key.name, branch),
        displayName: key.name,
        format: key.dataType ?? mainFormat,
        sourceLocale,
        targetLocales,
        revision: key.updatedAt ?? key.createdAt ?? null,
        externalUrl: buildPhraseProjectUrl(accountSlug, projectSlug),
        syncState: "synced",
        localeReadiness,
        providerPayload: {
          id: key.id,
          key: key.name,
          name: key.name,
          description: key.description,
          branch,
          tags: key.tags,
          customMetadata: key.customMetadata,
          nameHash: key.nameHash,
          plural: key.plural,
          useOrdinalRules: key.useOrdinalRules,
          dataType: key.dataType,
          createdAt: key.createdAt,
          updatedAt: key.updatedAt,
        },
      });
    }
  }

  return results;
};

function buildBranchScopes(branches: string[]) {
  const unique = new Set<string>();
  for (const branch of branches) {
    const trimmed = branch.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }

  return [null, ...unique];
}

function buildUploadExternalResourceId(uploadId: string, branch: string | null) {
  const trimmedBranch = branch?.trim();
  if (!trimmedBranch) {
    return uploadId;
  }

  return `${trimmedBranch}::${uploadId}`;
}

async function loadTranslationsByKeyId(input: {
  client: PhraseApiClient;
  projectId: string;
  locales: PhraseLocale[];
  branch: string | null;
}) {
  const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
  const listOptions = input.branch ? { branch: input.branch } : {};

  await mapWithConcurrency(input.locales, LOCALE_FETCH_CONCURRENCY, async (locale) => {
    try {
      const translations = await input.client.listTranslations(
        input.projectId,
        locale.name,
        listOptions,
      );

      for (const translation of translations) {
        if (!translation.keyId) {
          continue;
        }

        const byLocale =
          translationsByKeyId.get(translation.keyId) ?? new Map<string, PhraseTranslation>();
        byLocale.set(locale.name, translation);
        translationsByKeyId.set(translation.keyId, byLocale);
      }
    } catch (error) {
      if (error instanceof PhraseApiError && error.status === 401) {
        throw new Error("phrase_auth_invalid");
      }
    }
  });

  return translationsByKeyId;
}

function buildKeyLocaleReadiness(input: {
  keyId: string;
  targetLocaleRefs: PhraseLocale[];
  translationsByKeyId: Map<string, Map<string, PhraseTranslation>>;
}) {
  const localeReadiness: Record<string, string> = {};
  const translationsByLocale = input.translationsByKeyId.get(input.keyId);

  for (const locale of input.targetLocaleRefs) {
    const localeKey = localeIdentifier(locale) ?? locale.name;
    const translation = translationsByLocale?.get(locale.name);
    localeReadiness[localeKey] = mapPhraseTranslationReadiness({
      content: translation?.content,
      state: translation?.state,
      unverified: translation?.unverified,
      excluded: translation?.excluded,
    });
  }

  return localeReadiness;
}

function buildUploadLocaleReadiness(input: {
  keys: PhraseKey[];
  uploadsTags: string[];
  targetLocaleRefs: PhraseLocale[];
  translationsByKeyId: Map<string, Map<string, PhraseTranslation>>;
}) {
  const scopedKeys =
    input.uploadsTags.length === 0
      ? input.keys
      : input.keys.filter((key) => key.tags.some((tag) => input.uploadsTags.includes(tag)));

  const localeReadiness: Record<string, string> = {};
  for (const locale of input.targetLocaleRefs) {
    const localeKey = localeIdentifier(locale) ?? locale.name;
    const statuses = scopedKeys.map((key) => {
      const translation = input.translationsByKeyId.get(key.id)?.get(locale.name);
      return mapPhraseTranslationReadiness({
        content: translation?.content,
        state: translation?.state,
        unverified: translation?.unverified,
        excluded: translation?.excluded,
      });
    });

    if (statuses.length === 0) {
      localeReadiness[localeKey] = "missing";
      continue;
    }

    if (statuses.every((status) => status === "ready")) {
      localeReadiness[localeKey] = "ready";
      continue;
    }

    if (statuses.some((status) => status === "ready" || status === "unverified")) {
      localeReadiness[localeKey] = "unverified";
      continue;
    }

    localeReadiness[localeKey] = "missing";
  }

  return localeReadiness;
}

function partitionPhraseLocales(locales: PhraseLocale[]) {
  const source = locales.find((locale) => locale.default);
  const sourceLocaleRef = source ?? null;
  const sourceLocale = localeIdentifier(source);
  const targetLocaleRefs = locales.filter((locale) => !locale.default);
  const targetLocales = targetLocaleRefs
    .map((locale) => localeIdentifier(locale))
    .filter((locale): locale is string => Boolean(locale));

  return {
    sourceLocale,
    targetLocales,
    targetLocaleRefs,
    sourceLocaleRef,
  };
}

function localeIdentifier(locale: PhraseLocale | undefined) {
  if (!locale) return null;
  return locale.code?.trim() || locale.name.trim() || null;
}

function readProjectMetadata(project: { providerMetadata: Record<string, unknown> }) {
  return project.providerMetadata;
}

function mergeTags(tags: string[], tag: string | null) {
  const merged = new Set(tags);
  if (tag?.trim()) {
    merged.add(tag.trim());
  }

  return [...merged];
}

function buildPhraseProjectUrl(accountSlug: string | null, projectSlug: string | null) {
  if (!accountSlug || !projectSlug) {
    return null;
  }

  return `https://app.phrase.com/accounts/${accountSlug}/projects/${projectSlug}`;
}

function mapPhraseFetcherError(error: unknown) {
  if (error instanceof PhraseApiError && error.status === 401) {
    return new Error("phrase_auth_invalid");
  }

  return error instanceof Error ? error : new Error("phrase_fetch_failed");
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<void>,
) {
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) {
        return;
      }

      await mapper(items[currentIndex] as T);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}
