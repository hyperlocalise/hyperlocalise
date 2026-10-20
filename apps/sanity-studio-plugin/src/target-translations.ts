import type { SanityClient } from "@sanity/client";

import { extractDocumentTextMap } from "./extract-document-segments";
import {
  collectSanityDocument,
  importSanityTargetTranslations,
  type SanityResourceAuth,
} from "./hyperlocalise-client";
import { isRecord } from "./json";
import { projectLocalesMatch } from "./locale-map";
import type { LocalizationMode } from "./localization-mode";
import { publishedDocumentId } from "./workflow-ui";

export function actionLabel(base: string, locales: string[]): string {
  const trimmed = locales.map((locale) => locale.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return base;
  }
  if (trimmed.length === 1) {
    return `${base} (${trimmed[0]})`;
  }
  return `${base} (${trimmed.length} locales)`;
}

/** Label for writing Hyperlocalise translations back into Sanity as a locale document. */
export function createLocaleVersionLabel(locales: string[]): string {
  const trimmed = locales.map((locale) => locale.trim()).filter(Boolean);
  if (trimmed.length === 1) {
    return `Create ${trimmed[0]} version`;
  }
  if (trimmed.length > 1) {
    return `Create ${trimmed.length} locale versions`;
  }
  return "Create locale version";
}

export function textMapToImportEntries(map: Map<string, string>): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [fieldPath, text] of map.entries()) {
    const normalized = text.trim();
    if (normalized.length === 0) {
      continue;
    }
    entries[`sanity.k.${fieldPath}`] = normalized;
  }
  return entries;
}

type LocaleStatusResponse = {
  locale: string;
  isSource?: boolean;
  documents: Array<{ documentId: string; status: string }>;
};

export function parseLocaleStatusesForDocument(
  locales: LocaleStatusResponse[],
  documentId: string,
): { source: string; byLocale: Record<string, string> } {
  const published = publishedDocumentId(documentId);
  const byLocale: Record<string, string> = {};
  let source = "missing";
  for (const localeEntry of locales) {
    const doc = localeEntry.documents.find(
      (entry) => publishedDocumentId(entry.documentId) === published,
    );
    if (!doc) {
      continue;
    }
    if (localeEntry.isSource) {
      source = doc.status;
    } else {
      byLocale[localeEntry.locale] = doc.status;
    }
  }
  return { source, byLocale };
}

export function hasHlTranslationForLocale(status: string | undefined): boolean {
  return Boolean(status && status !== "missing");
}

export async function fetchDocumentLevelTargetRef(
  client: SanityClient,
  sourceId: string,
  locale: string,
): Promise<string | null> {
  const published = publishedDocumentId(sourceId);
  const metadata = await client.fetch<{
    translations?: Array<{ language?: string; value?: { _ref?: string } }>;
  } | null>(
    `*[_type == "translation.metadata" && references($id)][0]{ translations }`,
    { id: published },
  );
  if (!metadata?.translations) {
    return null;
  }
  const entry = metadata.translations.find(
    (row) => row.language && projectLocalesMatch(row.language, locale),
  );
  const ref = entry?.value?._ref;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

export async function fetchDocumentLevelTargetsMap(
  client: SanityClient,
  sourceIds: string[],
  locales: string[],
): Promise<Record<string, Record<string, string>>> {
  const out: Record<string, Record<string, string>> = {};
  await Promise.all(
    sourceIds.map(async (sourceId) => {
      const published = publishedDocumentId(sourceId);
      const metadata = await client.fetch<{
        translations?: Array<{ language?: string; value?: { _ref?: string } }>;
      } | null>(
        `*[_type == "translation.metadata" && references($id)][0]{ translations }`,
        { id: published },
      );
      if (!metadata?.translations) {
        return;
      }
      const byLocale: Record<string, string> = {};
      for (const locale of locales) {
        const entry = metadata.translations.find(
          (row) => row.language && projectLocalesMatch(row.language, locale),
        );
        const ref = entry?.value?._ref;
        if (typeof ref === "string" && ref.length > 0) {
          byLocale[locale] = ref;
        }
      }
      if (Object.keys(byLocale).length > 0) {
        out[published] = byLocale;
      }
    }),
  );
  return out;
}

export async function loadTargetDocument(
  client: SanityClient,
  targetRef: string,
): Promise<Record<string, unknown> | null> {
  const published = publishedDocumentId(targetRef);
  const draft = await client.getDocument(`drafts.${published}`);
  if (isRecord(draft)) {
    return draft;
  }
  const publishedDoc = await client.getDocument(published);
  return isRecord(publishedDoc) ? publishedDoc : null;
}

export function fieldLevelTargetHasContent(input: {
  document: Record<string, unknown>;
  locale: string;
  i18nMode: LocalizationMode;
  customBlockTypes?: string[];
  excludeFieldNames?: string[];
}): boolean {
  if (input.i18nMode !== "field-level") {
    return false;
  }
  const map = extractDocumentTextMap({
    document: input.document as Parameters<typeof extractDocumentTextMap>[0]["document"],
    i18nMode: "field-level",
    sourceLocale: input.locale,
    customBlockTypes: input.customBlockTypes,
    excludeFieldNames: input.excludeFieldNames,
  });
  return map.size > 0;
}

export function buildTargetImportEntries(input: {
  document: Record<string, unknown>;
  i18nMode: LocalizationMode;
  locale: string;
  customBlockTypes?: string[];
  excludeFieldNames?: string[];
}): Record<string, string> {
  const mode = input.i18nMode === "field-level" ? "field-level" : "document-level";
  const map = extractDocumentTextMap({
    document: input.document as Parameters<typeof extractDocumentTextMap>[0]["document"],
    i18nMode: mode,
    sourceLocale: input.locale,
    customBlockTypes: input.customBlockTypes,
    excludeFieldNames: input.excludeFieldNames,
  });
  return textMapToImportEntries(map);
}

export async function ensureSourceCollected(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle: string;
  sourceStatus: string;
  segments: import("./plugin-messages").SanitySegment[];
}): Promise<{ sourcePath: string; collectedNow: boolean }> {
  if (input.sourceStatus === "succeeded" || input.sourceStatus === "collected") {
    return { sourcePath: "", collectedNow: false };
  }
  const result = await collectSanityDocument({
    appUrl: input.appUrl,
    auth: input.auth,
    projectId: input.projectId,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    documentType: input.documentType,
    documentTitle: input.documentTitle,
    segments: input.segments,
  });
  return { sourcePath: result.sourcePath, collectedNow: true };
}

export async function uploadTargetLocaleFromSanity(input: {
  appUrl: string;
  auth: SanityResourceAuth;
  client: SanityClient;
  projectId: string;
  sanityProjectId: string;
  dataset: string;
  documentId: string;
  documentType: string;
  documentTitle: string;
  locale: string;
  i18nMode: LocalizationMode;
  sourceDocument: Record<string, unknown>;
  sourceStatus: string;
  sourceSegments: import("./plugin-messages").SanitySegment[];
  customBlockTypes?: string[];
  excludeFieldNames?: string[];
  targetRef?: string | null;
}): Promise<{ imported: number; matched: number; skipped: number; sourcePath?: string }> {
  const collectResult = await ensureSourceCollected({
    appUrl: input.appUrl,
    auth: input.auth,
    projectId: input.projectId,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    documentType: input.documentType,
    documentTitle: input.documentTitle,
    sourceStatus: input.sourceStatus,
    segments: input.sourceSegments,
  });

  let targetDocument = input.sourceDocument;
  if (input.i18nMode === "document-level") {
    const ref = input.targetRef ?? (await fetchDocumentLevelTargetRef(input.client, input.documentId, input.locale));
    if (!ref) {
      throw new Error(`No Sanity document found for ${input.locale}.`);
    }
    const loaded = await loadTargetDocument(input.client, ref);
    if (!loaded) {
      throw new Error(`Unable to load ${input.locale} document from Sanity.`);
    }
    targetDocument = loaded;
  } else if (!fieldLevelTargetHasContent({
    document: input.sourceDocument,
    locale: input.locale,
    i18nMode: input.i18nMode,
    customBlockTypes: input.customBlockTypes,
    excludeFieldNames: input.excludeFieldNames,
  })) {
    throw new Error(`No ${input.locale} field content found on this document.`);
  }

  const entries = buildTargetImportEntries({
    document: targetDocument,
    i18nMode: input.i18nMode,
    locale: input.locale,
    customBlockTypes: input.customBlockTypes,
    excludeFieldNames: input.excludeFieldNames,
  });
  if (Object.keys(entries).length === 0) {
    throw new Error(`No translatable ${input.locale} text found.`);
  }

  const result = await importSanityTargetTranslations({
    appUrl: input.appUrl,
    auth: input.auth,
    projectId: input.projectId,
    sanityProjectId: input.sanityProjectId,
    dataset: input.dataset,
    documentId: input.documentId,
    documentType: input.documentType,
    targetLocale: input.locale,
    entries,
  });

  return {
    ...result,
    sourcePath: collectResult.sourcePath || undefined,
  };
}
