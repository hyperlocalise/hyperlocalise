import type {
  ExternalTmsSourceFileUpload,
  ExternalTmsSourceFileUploader,
} from "@/lib/providers/tms-provider-types";

import { err, ok } from "@/lib/primitives/result/results";
import {
  providerFileFormat,
  providerFilename,
  providerSourcePath,
} from "@/lib/providers/adapters/source-file-upload-shared";
import { PhraseApiClient, type PhraseLocale } from "./phrase-api";

export const uploadPhraseSourceFile: ExternalTmsSourceFileUploader = async ({
  credential,
  externalProjectId,
  project,
  secretMaterial,
  file,
}) => {
  const client = new PhraseApiClient({
    token: secretMaterial,
    region: credential.region,
    baseUrl: credential.baseUrl,
  });
  const sourcePath = providerSourcePath(file);
  const fileFormat = providerFileFormat(file);
  if (!fileFormat) {
    return err({ code: "phrase_source_file_format_required" });
  }

  const locales = await client.listLocales(externalProjectId, { branch: file.branch });
  const sourceLocale = resolvePhraseSourceLocale(file, locales, project.sourceLocale);
  if (!sourceLocale) {
    return err({ code: "phrase_source_locale_not_found" });
  }

  const upload = await client.uploadSourceFile(externalProjectId, {
    filename: providerFilename(file),
    content: file.content,
    contentType: file.contentType,
    fileFormat,
    localeId: sourceLocale.id,
    branch: file.branch,
  });

  return ok({
    sourcePath,
    externalResourceId: upload.id,
    revision: upload.updatedAt ?? upload.createdAt ?? null,
    providerPayload: {
      id: upload.id,
      filename: upload.filename,
      format: upload.format,
      state: upload.state,
      url: upload.url,
      sourceLocale: {
        id: sourceLocale.id,
        name: sourceLocale.name,
        code: sourceLocale.code,
      },
      branch: file.branch?.trim() || null,
    },
  });
};

function resolvePhraseSourceLocale(
  file: ExternalTmsSourceFileUpload,
  locales: PhraseLocale[],
  projectSourceLocale: string | null,
) {
  const requested = file.sourceLocale?.trim() || projectSourceLocale?.trim() || "";
  if (requested) {
    const lower = requested.toLowerCase();
    const match = locales.find(
      (locale) =>
        locale.id.toLowerCase() === lower ||
        locale.name.toLowerCase() === lower ||
        locale.code?.toLowerCase() === lower,
    );
    if (match) {
      return match;
    }
  }

  return locales.find((locale) => locale.default) ?? null;
}
