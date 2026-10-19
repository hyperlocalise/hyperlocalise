/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */

import { SANITY_MANAGE_API_BASE } from "./constants";
import type { SanityClient } from "./client";
import {
  collectInternationalizedArrayLanguages,
  isSanityInternationalizedArrayEntry,
} from "./internationalized-array";
import {
  listSanityLocaleCatalog,
  listUnsupportedSanitySourceDocumentTypes,
  pickSanityLocaleSource,
} from "./locale-catalog";
import {
  inferSanityDetectedI18nMode,
  isSanityHelperDocumentType,
  sanityDocumentTypeTitle,
} from "./localization-mode";
import type {
  SanityDocumentRecord,
  SanityFieldObject,
  SanityStoredDocument,
} from "./sanity-field-value";
import type {
  SanityDatasetSummary,
  SanityDocumentTypeSummary,
  SanityLocaleCatalogConfig,
  SanityLocaleSource,
  SanityManageProject,
} from "./types";

export {
  DEFAULT_SANITY_LOCALE_CATALOG_CONFIG,
  isValidSanitySchemaFieldName,
  listSanityLocaleCatalog,
  listSanityLocaleTags,
  normalizeSanityLocaleCatalogConfig,
} from "./locale-catalog";

export class SanityApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SanityApiError";
    this.status = status;
  }
}

export function isSanityAuthError(error: object): boolean {
  return error instanceof SanityApiError && (error.status === 401 || error.status === 403);
}

type SanityManageProjectRaw = {
  id?: string;
  projectId?: string;
  displayName?: string;
};

type SanityManageDatasetRaw = {
  name?: string;
};

export async function listSanityManageProjects(token: string): Promise<SanityManageProject[]> {
  const response = await fetch(`${SANITY_MANAGE_API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new SanityApiError("sanity_manage_projects_failed", response.status);
  }
  const body = (await response.json()) as SanityManageProjectRaw[];
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const record = entry;
    const id =
      typeof record.id === "string"
        ? record.id
        : typeof record.projectId === "string"
          ? record.projectId
          : null;
    if (!id) {
      return [];
    }
    const displayName =
      typeof record.displayName === "string" && record.displayName.trim().length > 0
        ? record.displayName.trim()
        : id;
    return [{ id, displayName }];
  });
}

export async function listSanityDatasets(
  token: string,
  projectId: string,
): Promise<SanityDatasetSummary[]> {
  const response = await fetch(`${SANITY_MANAGE_API_BASE}/projects/${projectId}/datasets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new SanityApiError("sanity_datasets_failed", response.status);
  }
  const body = (await response.json()) as SanityManageDatasetRaw[];
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const name = entry.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      return [];
    }
    return [{ name: name.trim() }];
  });
}

function uniqueLanguages(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out.toSorted((left, right) => left.localeCompare(right));
}

/** When Studio defines `locale` documents, only those tags are valid language options. */
export function curateSanityLanguageTags(
  discovered: readonly string[],
  configuredLocaleTags: readonly string[],
): string[] {
  const list = uniqueLanguages(discovered);
  if (configuredLocaleTags.length === 0) {
    return list;
  }
  const allowed = new Set(uniqueLanguages(configuredLocaleTags));
  return list.filter((tag) => allowed.has(tag));
}

function sampleHasInternationalizedArray(doc: SanityDocumentRecord | null): boolean {
  if (!doc) {
    return false;
  }
  for (const value of Object.values(doc)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }
    if (isSanityInternationalizedArrayEntry(value[0])) {
      return true;
    }
  }
  return false;
}

export { collectInternationalizedArrayLanguages } from "./internationalized-array";

const SANITY_FIELD_LEVEL_SAMPLE_SIZE = 100;

export type DetectSanityDocumentTypesResult = {
  types: SanityDocumentTypeSummary[];
  languages: string[];
  localeSource: SanityLocaleSource;
  unsupportedSourceTypes?: string[];
};

export async function detectSanityDocumentTypes(input: {
  client: SanityClient;
  typeNames: readonly string[];
  localeCatalog?: Partial<SanityLocaleCatalogConfig> | null;
  sourceLocale?: string | null;
}): Promise<DetectSanityDocumentTypesResult> {
  const selected = [...new Set(input.typeNames.map((name) => name.trim()).filter(Boolean))];
  const catalogEntries = await listSanityLocaleCatalog(input.client, input.localeCatalog);
  const catalogTags = uniqueLanguages(catalogEntries.map((entry) => entry.tag));
  const curate = (tags: Iterable<string>) => curateSanityLanguageTags([...tags], catalogTags);

  const metadataRows = await input.client.fetch<
    Array<{ translations?: Array<{ _key?: string; type?: string }> }>
  >(`*[_type == "translation.metadata"]{ translations[]{ _key, "type": value->_type } }`);

  const documentLevelTypes = new Set<string>();
  const metadataLanguagesByType = new Map<string, Set<string>>();
  for (const row of metadataRows) {
    for (const translation of row.translations ?? []) {
      const typeName =
        typeof translation.type === "string" && translation.type.trim().length > 0
          ? translation.type.trim()
          : null;
      const localeKey =
        typeof translation._key === "string" && translation._key.trim().length > 0
          ? translation._key.trim()
          : null;
      if (typeName) {
        documentLevelTypes.add(typeName);
      }
      if (typeName && localeKey) {
        const existing = metadataLanguagesByType.get(typeName) ?? new Set<string>();
        existing.add(localeKey);
        metadataLanguagesByType.set(typeName, existing);
      }
    }
  }

  const types: SanityDocumentTypeSummary[] = [];
  const allLanguages = new Set<string>();

  for (const typeName of selected) {
    if (isSanityHelperDocumentType(typeName)) {
      continue;
    }

    const languages = new Set<string>();

    const languageQuery = documentLevelTypes.has(typeName)
      ? `*[_type == $type && defined(language)].language`
      : `*[_type == $type && defined(language)][0...${SANITY_FIELD_LEVEL_SAMPLE_SIZE}].language`;
    const langRows = await input.client.fetch<Array<{ language?: string } | string>>(
      languageQuery,
      { type: typeName },
    );
    const languageFieldTags: string[] = [];
    for (const row of langRows) {
      if (typeof row === "string" && row.trim()) {
        languageFieldTags.push(row);
      } else if (
        typeof row === "object" &&
        row &&
        typeof row.language === "string" &&
        row.language.trim()
      ) {
        languageFieldTags.push(row.language);
      }
    }

    let hasInternationalizedArray = false;
    if (!documentLevelTypes.has(typeName) && languageFieldTags.length === 0) {
      const samples = await input.client.fetch<SanityDocumentRecord[]>(
        `*[_type == $type][0...${SANITY_FIELD_LEVEL_SAMPLE_SIZE}]`,
        { type: typeName },
      );
      hasInternationalizedArray = samples.some((doc) => sampleHasInternationalizedArray(doc));
      if (hasInternationalizedArray) {
        for (const doc of samples) {
          for (const lang of collectInternationalizedArrayLanguages(doc)) {
            languages.add(lang);
          }
        }
      }
    }

    const i18nMode = inferSanityDetectedI18nMode({
      linkedInTranslationMetadata: documentLevelTypes.has(typeName),
      hasLanguageField: languageFieldTags.length > 0,
      hasInternationalizedArray,
    });
    if (i18nMode === "document") {
      for (const lang of metadataLanguagesByType.get(typeName) ?? []) {
        languages.add(lang);
      }
      for (const lang of languageFieldTags) {
        languages.add(lang);
      }
    }

    if (i18nMode === "none") {
      types.push({
        name: typeName,
        title: sanityDocumentTypeTitle(typeName),
        i18nMode,
        languages: [],
      });
      continue;
    }

    const languageList = catalogTags.length > 0 ? catalogTags : curate(languages);
    for (const lang of languageList) {
      allLanguages.add(lang);
    }
    types.push({
      name: typeName,
      title: sanityDocumentTypeTitle(typeName),
      i18nMode,
      languages: languageList,
    });
  }

  const discoveredLanguages = uniqueLanguages([...allLanguages]);
  const languages = catalogTags.length > 0 ? catalogTags : discoveredLanguages;
  const localeSource = pickSanityLocaleSource(catalogTags.length, discoveredLanguages.length);

  const typeLanguages = new Map(types.map((type) => [type.name, type.languages] as const));
  const sourceLocale = input.sourceLocale?.trim();
  const unsupportedSourceTypes =
    sourceLocale && selected.length > 0
      ? listUnsupportedSanitySourceDocumentTypes({
          sourceLocale,
          documentTypes: selected,
          languagesByType: {},
          fallbackLanguages: languages,
          typeLanguages,
        })
      : undefined;

  return {
    types,
    languages,
    localeSource,
    ...(unsupportedSourceTypes && unsupportedSourceTypes.length > 0
      ? { unsupportedSourceTypes }
      : {}),
  };
}

export async function listSanityDocumentsForImport(input: {
  client: SanityClient;
  documentTypes: readonly string[];
  watermarkIso: string | null;
  includeDrafts: boolean;
}): Promise<SanityStoredDocument[]> {
  const types = input.documentTypes.filter((type) => type !== "translation.metadata");
  if (types.length === 0) {
    return [];
  }
  const filter =
    input.watermarkIso != null
      ? `*[_type in $types && _updatedAt > $watermark && !(_id in path("drafts.**"))]`
      : `*[_type in $types && !(_id in path("drafts.**"))]`;
  const published = await input.client.fetch<SanityStoredDocument[]>(
    `${filter} | order(_updatedAt asc) { ... }`,
    {
      types,
      watermark: input.watermarkIso,
    },
  );

  if (!input.includeDrafts) {
    return published;
  }

  const draftRows = await input.client.fetch<SanityStoredDocument[]>(
    `*[_type in $types && _id in path("drafts.**")] | order(_updatedAt asc) { ... }`,
    { types },
  );
  const byPublishedId = new Map<string, (typeof published)[number]>();
  for (const doc of published) {
    byPublishedId.set(doc._id.replace(/^drafts\./, ""), doc);
  }
  for (const draft of draftRows) {
    const publishedId = draft._id.replace(/^drafts\./, "");
    byPublishedId.set(publishedId, draft);
  }
  return [...byPublishedId.values()].toSorted((left, right) => {
    const leftTime = Date.parse(left._updatedAt ?? "") || 0;
    const rightTime = Date.parse(right._updatedAt ?? "") || 0;
    return leftTime - rightTime;
  });
}

const SANITY_SYSTEM_FIELD_KEYS = new Set(["_id", "_rev", "_createdAt", "_updatedAt"]);
const TRANSLATION_METADATA_TYPE = "translation.metadata";
const TRANSLATION_METADATA_REF_ITEM_TYPE = "internationalizedArrayReferenceValue";

export function normalizeSanityPublishedDocumentId(documentId: string): string {
  return documentId.replace(/^drafts\./, "");
}

export function isSameSanityDocumentId(left: string, right: string): boolean {
  return normalizeSanityPublishedDocumentId(left) === normalizeSanityPublishedDocumentId(right);
}

export function omitSanitySystemFields(document: SanityDocumentRecord): SanityDocumentRecord {
  const next: SanityDocumentRecord = {};
  for (const [key, value] of Object.entries(document)) {
    if (!SANITY_SYSTEM_FIELD_KEYS.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

export function resolveSanityTranslatedDocumentId(
  ids: Record<string, string> | null | undefined,
  locale: string,
): string | undefined {
  if (!ids) {
    return undefined;
  }
  const exact = ids[locale]?.trim();
  if (exact) {
    return normalizeSanityPublishedDocumentId(exact);
  }
  const wanted = locale.trim().replace(/_/g, "-").toLowerCase();
  if (!wanted) {
    return undefined;
  }
  for (const [key, value] of Object.entries(ids)) {
    if (key.trim().replace(/_/g, "-").toLowerCase() === wanted && value.trim()) {
      return normalizeSanityPublishedDocumentId(value);
    }
  }
  return undefined;
}

function sanityTranslationMetadataEntry(
  locale: string,
  documentId: string,
  itemType: string,
): SanityFieldObject {
  return {
    _key: locale,
    _type: itemType,
    value: {
      _type: "reference",
      _ref: normalizeSanityPublishedDocumentId(documentId),
      _weak: true,
    },
  };
}

export async function fetchSanityDocumentById(
  client: SanityClient,
  documentId: string,
): Promise<SanityDocumentRecord | null> {
  return client.fetch<SanityDocumentRecord | null>(`*[_id == $id][0]`, {
    id: documentId,
  });
}

export async function fetchSanityPublishedOrDraftDocument(
  client: SanityClient,
  documentId: string,
): Promise<SanityDocumentRecord | null> {
  const publishedId = normalizeSanityPublishedDocumentId(documentId);
  return (
    (await fetchSanityDocumentById(client, `drafts.${publishedId}`)) ??
    (await fetchSanityDocumentById(client, publishedId))
  );
}

export async function patchSanityDraftDocument(input: {
  client: SanityClient;
  publishedDocumentId: string;
  document: SanityDocumentRecord;
}): Promise<void> {
  const draftId = `drafts.${normalizeSanityPublishedDocumentId(input.publishedDocumentId)}`;
  await input.client.createOrReplace({
    ...input.document,
    _id: draftId,
  } as { _id: string; _type: string });
}

export async function createSanityDraftTranslationDocument(input: {
  client: SanityClient;
  document: SanityDocumentRecord;
}): Promise<string> {
  const publishedId = crypto.randomUUID();
  const documentType = input.document._type;
  if (typeof documentType !== "string" || !documentType.trim()) {
    throw new Error("sanity_translation_document_type_required");
  }
  await input.client.create({
    ...omitSanitySystemFields(input.document),
    _id: `drafts.${publishedId}`,
    _type: documentType,
  } as { _id: string; _type: string });
  return publishedId;
}

export async function upsertSanityTranslationMetadataLink(input: {
  client: SanityClient;
  sourceDocumentId: string;
  sourceLocale: string;
  targetLocale: string;
  targetDocumentId: string;
  documentType: string;
}): Promise<void> {
  const sourceId = normalizeSanityPublishedDocumentId(input.sourceDocumentId);
  const existing = await input.client.fetch<{
    _id: string;
    translations?: SanityFieldObject[];
    schemaTypes?: string[];
  } | null>(
    `*[_type == "translation.metadata" && references($id)][0]{ _id, translations, schemaTypes }`,
    { id: sourceId },
  );

  const existingItemType = existing?.translations?.find(
    (entry) => typeof entry._type === "string",
  )?._type;
  const itemType =
    typeof existingItemType === "string" && existingItemType.trim()
      ? existingItemType
      : TRANSLATION_METADATA_REF_ITEM_TYPE;
  const translations = Array.isArray(existing?.translations) ? [...existing.translations] : [];

  const upsertEntry = (locale: string, documentId: string) => {
    const row = sanityTranslationMetadataEntry(locale, documentId, itemType);
    const index = translations.findIndex((entry) => entry._key === locale);
    if (index >= 0) {
      translations[index] = { ...translations[index], ...row };
      return;
    }
    translations.push(row);
  };

  if (input.sourceLocale.trim()) {
    upsertEntry(input.sourceLocale, sourceId);
  }
  upsertEntry(input.targetLocale, input.targetDocumentId);

  const schemaTypes = [
    ...new Set(
      [...(existing?.schemaTypes ?? []), input.documentType].filter(
        (typeName): typeName is string =>
          typeof typeName === "string" && typeName.trim().length > 0,
      ),
    ),
  ];
  const document = {
    _type: TRANSLATION_METADATA_TYPE,
    schemaTypes,
    translations,
  };

  if (existing?._id) {
    await input.client.createOrReplace({
      ...document,
      _id: existing._id,
    } as { _id: string; _type: string });
    return;
  }

  await input.client.create(document as { _type: string });
}

export type SanityTranslationMetadataLink = {
  sanityLocale: string;
  documentRef: string;
};

export async function fetchSanityTranslationMetadataLinks(
  client: SanityClient,
  sourceDocumentId: string,
): Promise<SanityTranslationMetadataLink[]> {
  const publishedId = normalizeSanityPublishedDocumentId(sourceDocumentId);
  const row = await client.fetch<{
    translations?: Array<{ _key?: string; ref?: string }>;
  } | null>(
    `*[_type == "translation.metadata" && references($id)][0]{ translations[]{ _key, "ref": value._ref } }`,
    { id: publishedId },
  );
  if (!row?.translations) {
    return [];
  }
  return row.translations.flatMap((entry) => {
    if (typeof entry._key !== "string" || typeof entry.ref !== "string") {
      return [];
    }
    return [{ sanityLocale: entry._key, documentRef: entry.ref.replace(/^drafts\./, "") }];
  });
}
