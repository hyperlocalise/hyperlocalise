import type { SanityClient } from "@sanity/client";

import { projectLocalesMatch } from "./locale-map";

type SanityDocumentRecord = Record<string, unknown> & { _id?: string; _type?: string };

type TranslationMetadataEntry = Record<string, unknown> & {
  language?: unknown;
  _key?: unknown;
  _type?: unknown;
  value?: { _type?: unknown; _ref?: unknown; _weak?: unknown };
};

export function normalizePublishedId(documentId: string): string {
  return documentId.replace(/^drafts\./, "");
}

function draftId(documentId: string): string {
  const published = normalizePublishedId(documentId);
  return published.startsWith("drafts.") ? published : `drafts.${published}`;
}

function omitSystemFields(document: SanityDocumentRecord): SanityDocumentRecord {
  const next = { ...document };
  delete next._rev;
  delete next._createdAt;
  delete next._updatedAt;
  return next;
}

export function translationMetadataEntryLocale(entry: {
  language?: unknown;
  _key?: unknown;
}): string | null {
  if (typeof entry.language === "string" && entry.language.trim()) {
    return entry.language.trim();
  }
  if (typeof entry._key === "string" && entry._key.trim()) {
    return entry._key.trim();
  }
  return null;
}

export function translationMetadataEntryRef(entry: { value?: { _ref?: unknown } }): string | null {
  const ref = entry.value?._ref;
  return typeof ref === "string" && ref.trim() ? normalizePublishedId(ref) : null;
}

export function findTranslationMetadataTargetRef(
  translations: unknown,
  locale: string,
): string | null {
  if (!Array.isArray(translations)) {
    return null;
  }
  for (const row of translations) {
    if (!isTranslationMetadataEntry(row)) {
      continue;
    }
    const entry = row;
    const entryLocale = translationMetadataEntryLocale(entry);
    if (!entryLocale || !projectLocalesMatch(entryLocale, locale)) {
      continue;
    }
    return translationMetadataEntryRef(entry);
  }
  return null;
}

function isTranslationMetadataEntry(value: unknown): value is TranslationMetadataEntry {
  return Boolean(value) && typeof value === "object";
}

function translationItemType(translations: unknown[]): string {
  for (const row of translations) {
    if (!isTranslationMetadataEntry(row) || typeof row._type !== "string") {
      continue;
    }
    const type = row._type.trim();
    if (type) {
      return type;
    }
  }
  return "internationalizedArrayReferenceValue";
}

function upsertTranslationMetadataEntry(input: {
  translations: TranslationMetadataEntry[];
  locale: string;
  documentId: string;
  itemType: string;
}): TranslationMetadataEntry[] {
  const publishedId = normalizePublishedId(input.documentId);
  const next = [...input.translations];
  const index = next.findIndex((entry) => {
    const entryLocale = translationMetadataEntryLocale(entry);
    return entryLocale !== null && projectLocalesMatch(entryLocale, input.locale);
  });
  const existing = index >= 0 ? next[index] : undefined;
  const existingKey =
    existing && typeof existing._key === "string" && existing._key.trim()
      ? existing._key
      : input.locale;
  const row: TranslationMetadataEntry = {
    ...existing,
    _key: existingKey,
    _type: input.itemType,
    language: input.locale,
    value: {
      _type: "reference",
      _ref: publishedId,
      _weak: true,
    },
  };
  if (index >= 0) {
    next[index] = row;
    return next;
  }
  next.push(row);
  return next;
}

export async function patchCurrentDocumentDraft(input: {
  client: SanityClient;
  publishedDocumentId: string;
  document: SanityDocumentRecord;
}): Promise<void> {
  const id = draftId(input.publishedDocumentId);
  await input.client.createOrReplace({
    ...omitSystemFields(input.document),
    _id: id,
    _type: input.document._type ?? "",
  });
}

export async function createDocumentLevelTranslation(input: {
  client: SanityClient;
  sourceDocumentId: string;
  sourceLocale: string;
  targetLocale: string;
  documentType: string;
  translatedDocument: SanityDocumentRecord;
}): Promise<{ publishedId: string; updatedExisting: boolean }> {
  const sourceId = normalizePublishedId(input.sourceDocumentId);
  const existing = await input.client.fetch<SanityDocumentRecord | null>(
    `*[_type == "translation.metadata" && references($id)][0]`,
    { id: sourceId },
  );

  const existingTargetId = findTranslationMetadataTargetRef(
    existing?.translations,
    input.targetLocale,
  );
  const reuseExisting =
    Boolean(existingTargetId) &&
    existingTargetId !== sourceId &&
    !projectLocalesMatch(input.targetLocale, input.sourceLocale);

  const publishedId = reuseExisting && existingTargetId ? existingTargetId : crypto.randomUUID();
  const translatedPayload = {
    ...omitSystemFields(input.translatedDocument),
    _type: input.documentType,
    language: input.targetLocale,
  };

  if (reuseExisting) {
    await patchCurrentDocumentDraft({
      client: input.client,
      publishedDocumentId: publishedId,
      document: translatedPayload,
    });
  } else {
    await input.client.create({
      ...translatedPayload,
      _id: `drafts.${publishedId}`,
    });
  }

  const existingTranslations = Array.isArray(existing?.translations)
    ? existing.translations.filter(isTranslationMetadataEntry)
    : [];
  const itemType = translationItemType(existingTranslations);
  let translations = upsertTranslationMetadataEntry({
    translations: existingTranslations,
    locale: input.targetLocale,
    documentId: publishedId,
    itemType,
  });
  if (input.sourceLocale.trim()) {
    translations = upsertTranslationMetadataEntry({
      translations,
      locale: input.sourceLocale,
      documentId: sourceId,
      itemType,
    });
  }

  const metadataDocument: SanityDocumentRecord = {
    ...omitSystemFields(existing ?? {}),
    _type: "translation.metadata",
    schemaTypes: Array.isArray(existing?.schemaTypes) ? existing.schemaTypes : [input.documentType],
    translations,
  };

  const existingId = typeof existing?._id === "string" ? existing._id : "";
  if (existingId) {
    await input.client.createOrReplace({ ...metadataDocument, _id: existingId });
  } else {
    await input.client.create(metadataDocument);
  }

  return { publishedId, updatedExisting: reuseExisting };
}
