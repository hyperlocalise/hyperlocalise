import type { ExternalTmsContentPuller } from "@/lib/providers/external-tms-content-sync";

import {
  PhraseApiError,
  type PhraseKey,
  type PhraseLocale,
  type PhraseTranslation,
} from "./phrase-api";
import { createPhraseStringsApiClient } from "./phrase-strings-client";
import {
  buildPhraseJobScopeTag,
  filterPhraseKeysForJobScope,
  findPhraseTmsJobPart,
  matchPhraseTargetLocale,
  normalizePhraseTaskLocaleSuffix,
  parsePhraseExternalJobId,
  resolvePhraseBranch,
  resolvePhraseStringsProjectId,
  resolvePhraseTmsProjectUid,
} from "./phrase-job-context";
import { mapPhraseTranslationReadiness } from "./phrase-locale-readiness";
import { PhraseTmsApiClient, mapPhraseTmsFetcherError } from "./phrase-tms-api";

const LOCALE_FETCH_CONCURRENCY = 8;

export const pullPhraseTaskContent: ExternalTmsContentPuller = async ({
  credential,
  externalProjectId,
  externalJobId,
  project,
  secretMaterial,
}) => {
  const stringsProjectId = resolvePhraseStringsProjectId(project, externalProjectId);
  if (!stringsProjectId) {
    throw new Error("invalid_phrase_project_id");
  }

  const stringsClient = createPhraseStringsApiClient({
    token: secretMaterial,
    region: credential.region,
    baseUrl: credential.baseUrl,
  });

  const branch = resolvePhraseBranch(project);
  const listOptions = branch ? { branch } : {};

  let locales: PhraseLocale[];
  let keys: PhraseKey[];
  try {
    [locales, keys] = await Promise.all([
      stringsClient.listLocales(stringsProjectId, listOptions),
      stringsClient.listKeys(stringsProjectId, listOptions),
    ]);
  } catch (error) {
    throw mapPhraseStringsError(error);
  }

  const parsedJobId = parsePhraseExternalJobId(externalJobId);
  if (!parsedJobId) {
    throw new Error("invalid_phrase_job_id");
  }

  let jobPart = null;
  const tmsProjectUid = resolvePhraseTmsProjectUid(project, externalProjectId);
  if (tmsProjectUid) {
    const tmsClient = new PhraseTmsApiClient({
      token: secretMaterial,
      baseUrl: credential.baseUrl,
    });

    try {
      const jobParts = await tmsClient.listAllJobParts(tmsProjectUid);
      jobPart = findPhraseTmsJobPart({ externalJobId, jobParts });
    } catch (error) {
      throw mapPhraseTmsFetcherError(error);
    }
  }

  const targetLocale =
    (jobPart ? matchPhraseTargetLocale(jobPart.targetLang, locales) : null) ??
    locales.find(
      (locale) =>
        !locale.default &&
        normalizePhraseTaskLocaleSuffix(locale.code ?? locale.name) ===
          parsedJobId.taskLocaleSuffix,
    ) ??
    locales.find((locale) => !locale.default);
  if (!targetLocale) {
    throw new Error("phrase_task_missing_target_language");
  }

  const sourceLocaleRef = locales.find((locale) => locale.default) ?? null;
  const jobTag = buildPhraseJobScopeTag(parsedJobId.innerId);
  const scopedKeys = filterPhraseKeysForJobScope({ keys, jobTag });

  const localesToLoad = [sourceLocaleRef, targetLocale].filter(
    (locale): locale is PhraseLocale => locale != null,
  );

  const translationsByKeyId = await loadTranslationsByKeyId({
    client: stringsClient,
    projectId: stringsProjectId,
    locales: localesToLoad,
    branch,
    keyIds: scopedKeys.map((key) => key.id),
  });

  const units: Awaited<ReturnType<ExternalTmsContentPuller>>["units"] = scopedKeys.map((key) => {
    const translationsByLocale = translationsByKeyId.get(key.id);
    const sourceTranslation = sourceLocaleRef
      ? translationsByLocale?.get(sourceLocaleRef.name)
      : null;
    const targetTranslation = translationsByLocale?.get(targetLocale.name);

    const sourceText = sourceTranslation?.content?.trim() || key.name;
    const targetEntries = [];

    if (targetTranslation?.content?.trim()) {
      const readiness = mapPhraseTranslationReadiness({
        content: targetTranslation.content,
        state: targetTranslation.state,
        unverified: targetTranslation.unverified,
        excluded: targetTranslation.excluded,
      });

      targetEntries.push({
        locale: targetLocale.code?.trim() || targetLocale.name,
        text: targetTranslation.content.trim(),
        externalTranslationId: targetTranslation.id,
        isApproved: readiness === "ready",
      });
    }

    return {
      externalStringId: key.id,
      key: key.name,
      sourceText,
      context: key.description,
      fileId: null,
      translations: targetEntries,
      providerPayload: {
        branch,
        jobTag,
        tags: key.tags,
        dataType: key.dataType,
        customMetadata: key.customMetadata,
      },
    };
  });

  return {
    externalJobId,
    externalTaskId: jobPart?.uid ?? null,
    sourceLocale: sourceLocaleRef?.code?.trim() || sourceLocaleRef?.name || null,
    targetLocales: [targetLocale.code?.trim() || targetLocale.name],
    units,
    exportArtifact: null,
    providerPayload: {
      stringsProjectId,
      tmsProjectUid,
      branch,
      jobTag,
      innerId: parsedJobId.innerId,
      filename: jobPart?.filename ?? null,
      targetLang: jobPart?.targetLang ?? targetLocale.name,
      workflowStep: jobPart?.workflowStep?.name ?? null,
    },
  };
};

async function loadTranslationsByKeyId(input: {
  client: ReturnType<typeof createPhraseStringsApiClient>;
  projectId: string;
  locales: PhraseLocale[];
  branch: string | null;
  keyIds: string[];
}) {
  const keyIdSet = new Set(input.keyIds);
  const translationsByKeyId = new Map<string, Map<string, PhraseTranslation>>();
  const listOptions = input.branch ? { branch: input.branch } : {};
  const localesToFetch = input.locales.filter((locale) => keyIdSet.size > 0);

  await mapWithConcurrency(localesToFetch, LOCALE_FETCH_CONCURRENCY, async (locale) => {
    try {
      const translations = await input.client.listTranslations(
        input.projectId,
        locale.name,
        listOptions,
      );

      for (const translation of translations) {
        if (!translation.keyId || !keyIdSet.has(translation.keyId)) {
          continue;
        }

        const byLocale =
          translationsByKeyId.get(translation.keyId) ?? new Map<string, PhraseTranslation>();
        byLocale.set(locale.name, translation);
        translationsByKeyId.set(translation.keyId, byLocale);
      }
    } catch (error) {
      throw mapPhraseStringsError(error);
    }
  });

  return translationsByKeyId;
}

function mapPhraseStringsError(error: unknown) {
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
