import type { SanityClient } from "@sanity/client";

import { createDocumentLevelTranslation, patchCurrentDocumentDraft } from "./apply-studio-document";
import { fetchSanityWritePlan, type SanityResourceAuth } from "./hyperlocalise-client";

export type WriteStudioLocaleResult = {
  updatedExisting: boolean;
  translatedKeyCount: number;
};

export async function writeStudioLocaleVersion(input: {
  client: SanityClient;
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  sourcePath: string;
  document: Record<string, unknown>;
  i18nMode: "document" | "field";
  sourceSanityLocale: string;
  targetSanityLocale: string;
  sourceDocumentId: string;
  documentType: string;
}): Promise<WriteStudioLocaleResult> {
  const write = await fetchSanityWritePlan({
    appUrl: input.appUrl,
    auth: input.auth,
    projectId: input.projectId,
    sourcePath: input.sourcePath,
    document: input.document,
    i18nMode: input.i18nMode,
    sourceSanityLocale: input.sourceSanityLocale,
    targetSanityLocale: input.targetSanityLocale,
  });
  if (write.translatedKeyCount <= 0) {
    throw new Error(`No ${input.targetSanityLocale} translations are ready to write yet.`);
  }

  if (write.i18nMode === "field") {
    await patchCurrentDocumentDraft({
      client: input.client,
      publishedDocumentId: input.sourceDocumentId,
      document: write.document,
    });
    return { updatedExisting: true, translatedKeyCount: write.translatedKeyCount };
  }

  const result = await createDocumentLevelTranslation({
    client: input.client,
    sourceDocumentId: input.sourceDocumentId,
    sourceLocale: input.sourceSanityLocale,
    targetLocale: input.targetSanityLocale,
    documentType: input.documentType,
    translatedDocument: write.document,
  });
  return {
    updatedExisting: result.updatedExisting,
    translatedKeyCount: write.translatedKeyCount,
  };
}

export function localeVersionWrittenMessage(locale: string): string {
  return `Wrote ${locale} version in Sanity.`;
}
