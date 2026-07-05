import type { ExternalTmsSourceFileUploader } from "@/lib/providers/tms-provider-types";

import { err, ok } from "@/lib/primitives/result/results";
import {
  providerFileFormat,
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import { SmartlingApiClient } from "./smartling-api";
import { parseSmartlingCredentials } from "./smartling-credentials";

export const uploadSmartlingSourceFile: ExternalTmsSourceFileUploader = async ({
  credential,
  externalProjectId,
  secretMaterial,
  file,
}) => {
  const client = new SmartlingApiClient({
    credentials: parseSmartlingCredentials(secretMaterial),
    authBaseUrl: credential.baseUrl ?? undefined,
  });
  const sourcePath = providerSourcePath(file);
  const fileType = providerFileFormat(file);
  if (!fileType) {
    return err({ code: "smartling_source_file_type_required" });
  }

  const result = await client.uploadSourceFile(externalProjectId, {
    fileUri: sourcePath,
    fileType,
    filename: providerFilename(file),
    content: file.content,
    contentType: file.contentType,
  });

  return ok({
    sourcePath,
    externalResourceId: result.fileUri,
    revision: null,
    asyncOperation: result.processUid
      ? {
          provider: "smartling",
          processUid: result.processUid,
        }
      : null,
    providerPayload: {
      fileUri: result.fileUri,
      fileType: result.fileType,
      processUid: result.processUid,
      ...result.providerPayload,
    },
  });
};
