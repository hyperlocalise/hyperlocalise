import type { SanityClient } from "@sanity/client";

type SanityDocumentRecord = Record<string, unknown> & { _id?: string; _type?: string };

function normalizePublishedId(documentId: string): string {
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

export async function patchCurrentDocumentDraft(input: {
  client: SanityClient;
  publishedDocumentId: string;
  document: SanityDocumentRecord;
}): Promise<void> {
  const id = draftId(input.publishedDocumentId);
  await input.client.createOrReplace({
    ...omitSystemFields(input.document),
    _id: id,
    _type: String(input.document._type ?? ""),
  });
}

export async function createDocumentLevelTranslation(input: {
  client: SanityClient;
  sourceDocumentId: string;
  sourceLocale: string;
  targetLocale: string;
  documentType: string;
  translatedDocument: SanityDocumentRecord;
}): Promise<string> {
  const publishedId = crypto.randomUUID();
  await input.client.create({
    ...omitSystemFields(input.translatedDocument),
    _id: `drafts.${publishedId}`,
    _type: input.documentType,
    language: input.targetLocale,
  });

  const sourceId = normalizePublishedId(input.sourceDocumentId);
  const existing = await input.client.fetch<SanityDocumentRecord | null>(
    `*[_type == "translation.metadata" && references($id)][0]`,
    { id: sourceId },
  );

  const translations = Array.isArray(existing?.translations)
    ? [...(existing.translations as Array<Record<string, unknown>>)]
    : [];

  const withoutTarget = translations.filter(
    (entry) => entry.language !== input.targetLocale && entry._key !== input.targetLocale,
  );
  withoutTarget.push({
    _key: input.targetLocale,
    _type: "internationalizedArrayReferenceValue",
    language: input.targetLocale,
    value: { _type: "reference", _ref: publishedId, _weak: true },
  });

  const metadataDocument: SanityDocumentRecord = {
    _type: "translation.metadata",
    schemaTypes: [input.documentType],
    translations: withoutTarget,
  };

  const existingId = typeof existing?._id === "string" ? existing._id : "";
  if (existingId) {
    await input.client.createOrReplace({ ...metadataDocument, _id: existingId });
  } else {
    await input.client.create({
      ...metadataDocument,
      translations: [
        {
          _key: input.sourceLocale,
          _type: "internationalizedArrayReferenceValue",
          language: input.sourceLocale,
          value: { _type: "reference", _ref: sourceId, _weak: true },
        },
        ...withoutTarget,
      ],
    });
  }

  return publishedId;
}
