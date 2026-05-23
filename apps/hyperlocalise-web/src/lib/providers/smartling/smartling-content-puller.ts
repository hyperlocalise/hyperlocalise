import type { ExternalTmsContentPuller } from "@/lib/providers/external-tms-content-sync";

import { SmartlingApiClient, SmartlingApiError } from "./smartling-api";
import { mapSmartlingFetcherError } from "./smartling-errors";

function translationLookupKey(input: {
  hashcode?: string | null;
  fileUri?: string | null;
  stringText?: string | null;
  parsedStringText?: string | null;
}) {
  if (input.hashcode) {
    return input.fileUri ? `${input.fileUri}::${input.hashcode}` : input.hashcode;
  }
  const text = input.parsedStringText ?? input.stringText;
  if (!text) {
    return null;
  }
  return input.fileUri ? `${input.fileUri}::${text}` : text;
}

function isApprovedTranslation(translation: {
  authorized?: boolean | null;
  published?: boolean | null;
  publishStatus?: string | null;
  translation?: string | null;
}) {
  if (!translation.translation?.trim()) {
    return false;
  }
  if (translation.authorized === true || translation.published === true) {
    return true;
  }
  const publishStatus = translation.publishStatus?.toLowerCase() ?? "";
  return publishStatus.includes("publish") || publishStatus.includes("author");
}

export const pullSmartlingTaskContent: ExternalTmsContentPuller = async ({
  credential,
  externalProjectId,
  externalJobId,
  secretMaterial,
}) => {
  const client = new SmartlingApiClient({
    credentials: secretMaterial,
    authBaseUrl: credential.baseUrl ?? undefined,
  });

  const projectId = externalProjectId.trim();
  const jobUid = externalJobId.trim();
  if (!projectId || !jobUid) {
    throw new Error("invalid_smartling_project_or_job_id");
  }

  let job;
  let projectDetails;
  let jobFiles;
  try {
    [job, projectDetails, jobFiles] = await Promise.all([
      client.getJob(projectId, jobUid),
      client.getProjectDetails(projectId),
      client.listJobFiles(projectId, jobUid),
    ]);
  } catch (error) {
    if (error instanceof SmartlingApiError && error.status === 401) {
      throw new Error("smartling_auth_invalid");
    }
    throw mapSmartlingFetcherError(error);
  }

  const targetLocales = job.targetLocaleIds.length > 0 ? job.targetLocaleIds : [];
  const fileUris = jobFiles.map((file) => file.fileUri).filter(Boolean);

  const sourceStrings = [];
  if (fileUris.length > 0) {
    for (const fileUri of fileUris) {
      sourceStrings.push(...(await client.listSourceStrings(projectId, { fileUri })));
    }
  } else {
    sourceStrings.push(...(await client.listSourceStrings(projectId)));
  }

  const translationsByKey = new Map<
    string,
    Array<{
      locale: string;
      text: string;
      isApproved: boolean;
      externalTranslationId: string | null;
    }>
  >();

  for (const locale of targetLocales) {
    const localeTranslations = await client.listLocaleTranslations(projectId, locale);
    for (const translation of localeTranslations) {
      const key = translationLookupKey(translation);
      if (!key || !translation.translation) {
        continue;
      }

      const existing = translationsByKey.get(key) ?? [];
      existing.push({
        locale,
        text: translation.translation,
        isApproved: isApprovedTranslation(translation),
        externalTranslationId: translation.hashcode ?? null,
      });
      translationsByKey.set(key, existing);
    }
  }

  const units = sourceStrings.map((sourceString) => {
    const lookupKeys = [
      translationLookupKey({
        hashcode: sourceString.hashcode,
        fileUri: sourceString.fileUri,
      }),
      translationLookupKey({
        fileUri: sourceString.fileUri,
        stringText: sourceString.stringText,
      }),
    ].filter((key): key is string => Boolean(key));

    const matchedTranslations =
      lookupKeys.map((key) => translationsByKey.get(key)).find((value) => value != null) ?? [];

    return {
      externalStringId: sourceString.hashcode,
      key: sourceString.variant ?? sourceString.hashcode,
      sourceText: sourceString.stringText ?? "",
      context:
        typeof sourceString.metadata?.instruction === "string"
          ? sourceString.metadata.instruction
          : null,
      fileId: sourceString.fileUri ?? null,
      translations: matchedTranslations,
      providerPayload: {
        fileUri: sourceString.fileUri,
        variant: sourceString.variant,
        stringVariantUid: sourceString.stringVariantUid,
      },
    };
  });

  return {
    externalJobId: job.translationJobUid,
    externalTaskId: null,
    sourceLocale: projectDetails.sourceLocaleId ?? null,
    targetLocales,
    units,
    exportArtifact: null,
    providerPayload: {
      jobName: job.jobName,
      jobStatus: job.jobStatus,
      fileUris,
      description: job.description,
      referenceNumber: job.referenceNumber,
      jobNumber: job.jobNumber,
    },
  };
};
