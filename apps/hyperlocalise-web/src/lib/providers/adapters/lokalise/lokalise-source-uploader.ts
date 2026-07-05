import type { ExternalTmsSourceFileUploader } from "@/lib/providers/tms-provider-types";

import {
  providerFileFormat,
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import { LOKALISE_DEFAULT_BASE_URL, LokaliseApiClient } from "./lokalise-api";

export const uploadLokaliseSourceFile: ExternalTmsSourceFileUploader = async ({
  credential,
  externalProjectId,
  project,
  secretMaterial,
  file,
}) => {
  const client = new LokaliseApiClient({
    token: secretMaterial,
    baseUrl: credential.baseUrl ?? LOKALISE_DEFAULT_BASE_URL,
  });
  const sourcePath = providerSourcePath(file);
  const format = providerFileFormat(file);
  if (!format) {
    throw new Error("lokalise_source_file_format_required");
  }

  const sourceLocale = file.sourceLocale?.trim() || project.sourceLocale?.trim();
  if (!sourceLocale) {
    throw new Error("lokalise_source_locale_required");
  }

  const result = await client.uploadSourceFile(externalProjectId, {
    filename: providerFilename(file),
    content: file.content,
    sourceLocale,
    format,
    branch: file.branch,
  });

  return {
    sourcePath,
    externalResourceId: result.processId,
    revision: null,
    asyncOperation: {
      provider: "lokalise",
      processId: result.processId,
      status: result.status,
      type: result.type,
    },
    providerPayload: {
      processId: result.processId,
      status: result.status,
      type: result.type,
      message: result.message,
      sourceLocale,
      format,
      branch: file.branch?.trim() || null,
    },
  };
};
