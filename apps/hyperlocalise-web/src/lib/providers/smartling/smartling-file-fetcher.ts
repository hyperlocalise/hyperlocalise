import type { ExternalTmsFileKeyFetcher } from "@/lib/providers/external-tms-file-sync";

import { parseSmartlingCredentials } from "./smartling-credentials";
import { SmartlingApiClient } from "./smartling-api";
import { mapSmartlingFetcherError } from "./smartling-errors";

export const fetchSmartlingFileKeys: ExternalTmsFileKeyFetcher = async ({
  credential,
  externalProjectId,
  secretMaterial,
}) => {
  const credentials = parseSmartlingCredentials(secretMaterial);
  const client = new SmartlingApiClient({
    credentials,
    authBaseUrl: credential.baseUrl ?? undefined,
  });

  if (!externalProjectId.trim()) {
    throw new Error("invalid_smartling_project_id");
  }

  let projectDetails;
  try {
    projectDetails = await client.getProjectDetails(externalProjectId);
  } catch (error) {
    throw mapSmartlingFetcherError(error);
  }

  const targetLocales = projectDetails.targetLocales
    .filter((locale) => locale.enabled !== false)
    .map((locale) => locale.localeId);
  const accountUid = projectDetails.accountUid;

  let files;
  try {
    files = await client.listProjectFiles(externalProjectId);
  } catch (error) {
    throw mapSmartlingFetcherError(error);
  }

  const results: Awaited<ReturnType<ExternalTmsFileKeyFetcher>> = [];

  for (const file of files) {
    let localeReadiness: Record<string, unknown> = {};
    try {
      const statuses = await client.getFileStatusForAllLocales(externalProjectId, file.fileUri);
      localeReadiness = Object.fromEntries(
        statuses.map((status) => [
          status.localeId,
          {
            completedStringCount: status.completedStringCount,
            authorizedStringCount: status.authorizedStringCount,
            lastCompleted: status.lastCompleted,
            lastAuthorized: status.lastAuthorized,
          },
        ]),
      );
    } catch {
      // Locale status is best-effort; do not fail file sync if it is unavailable
    }

    results.push({
      externalResourceId: file.fileUri,
      resourceType: "file",
      sourcePath: file.fileUri,
      displayName: displayNameOf(file.fileUri),
      format: file.fileType ?? null,
      sourceLocale: projectDetails.sourceLocaleId,
      targetLocales,
      revision: file.lastUploaded ?? null,
      externalUrl: buildSmartlingFileUrl(accountUid, externalProjectId, file.fileUri),
      syncState: "synced",
      localeReadiness,
      providerPayload: {
        fileUri: file.fileUri,
        fileType: file.fileType,
        lastUploaded: file.lastUploaded,
        hasInstructions: file.hasInstructions,
        directives: file.directives ?? null,
      },
    });
  }

  for (const file of files) {
    try {
      const strings = await client.listSourceStrings(externalProjectId, {
        fileUri: file.fileUri,
      });

      for (const str of strings) {
        const keyPath = `${file.fileUri}/keys/${str.hashcode}`;
        results.push({
          externalResourceId: `${file.fileUri}::${str.hashcode}`,
          resourceType: "key",
          sourcePath: keyPath,
          displayName: str.stringText ?? str.hashcode,
          sourceLocale: projectDetails.sourceLocaleId,
          targetLocales,
          externalUrl: buildSmartlingFileUrl(accountUid, externalProjectId, file.fileUri),
          providerPayload: {
            hashcode: str.hashcode,
            stringText: str.stringText,
            fileUri: str.fileUri ?? file.fileUri,
            variant: str.variant,
            stringVariantUid: str.stringVariantUid,
            createdDate: str.createdDate,
            modifiedDate: str.modifiedDate,
            metadata: str.metadata ?? null,
          },
        });
      }
    } catch (error) {
      const mapped = mapSmartlingFetcherError(error);
      if (mapped.message === "smartling_auth_invalid") {
        throw mapped;
      }

      results.push({
        externalResourceId: file.fileUri,
        resourceType: "key",
        sourcePath: `${file.fileUri}/keys`,
        displayName: `${displayNameOf(file.fileUri)} keys`,
        syncErrorMessage: `Failed to list source strings for ${file.fileUri}: ${mapped.message}`,
        providerPayload: {
          fileUri: file.fileUri,
          fileType: file.fileType,
        },
      });
    }
  }

  return results;
};

function displayNameOf(fileUri: string) {
  return fileUri.split("/").filter(Boolean).at(-1) ?? fileUri;
}

function buildSmartlingFileUrl(accountUid: string, projectId: string, fileUri: string) {
  const params = new URLSearchParams({ fileUri });
  return `https://dashboard.smartling.com/app/accounts/${encodeURIComponent(accountUid)}/project/${encodeURIComponent(projectId)}/files?${params.toString()}`;
}
