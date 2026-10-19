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
import { isSanityHelperDocumentType, sanityDocumentTypeTitle } from "./localization-mode";
import type {
  SanityDatasetSummary,
  SanityDocumentTypeSummary,
  SanityI18nMode,
  SanityManageProject,
} from "./types";

export class SanityApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SanityApiError";
    this.status = status;
  }
}

export function isSanityAuthError(error: unknown): boolean {
  return error instanceof SanityApiError && (error.status === 401 || error.status === 403);
}

export async function listSanityManageProjects(token: string): Promise<SanityManageProject[]> {
  const response = await fetch(`${SANITY_MANAGE_API_BASE}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new SanityApiError("sanity_manage_projects_failed", response.status);
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const record = entry as { id?: unknown; displayName?: unknown; projectId?: unknown };
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
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    return [];
  }
  return body.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const name = (entry as { name?: unknown }).name;
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

function isInternationalizedArrayEntry(
  value: unknown,
): value is { language?: unknown; value?: unknown } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as { _type?: unknown; language?: unknown; value?: unknown };
  if (!("language" in record) || !("value" in record)) {
    return false;
  }
  return typeof record._type === "string" && record._type.startsWith("internationalizedArray");
}

function sampleHasInternationalizedArray(doc: Record<string, unknown> | null): boolean {
  if (!doc) {
    return false;
  }
  for (const value of Object.values(doc)) {
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }
    if (isInternationalizedArrayEntry(value[0])) {
      return true;
    }
  }
  return false;
}

/** Collect `language` tags from Sanity internationalized-array fields on one document. */
export function collectInternationalizedArrayLanguages(doc: Record<string, unknown>): string[] {
  const languages = new Set<string>();
  for (const value of Object.values(doc)) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const entry of value) {
      if (!isInternationalizedArrayEntry(entry)) {
        continue;
      }
      const language = entry.language;
      if (typeof language === "string" && language.trim().length > 0) {
        languages.add(language.trim());
      }
    }
  }
  return [...languages];
}

export async function detectSanityDocumentTypes(input: {
  client: SanityClient;
  typeNames: readonly string[];
}): Promise<{ types: SanityDocumentTypeSummary[]; languages: string[] }> {
  const selected = [...new Set(input.typeNames.map((name) => name.trim()).filter(Boolean))];
  const metadataRows = await input.client.fetch<
    Array<{ translations?: Array<{ _key?: string; type?: string }> }>
  >(`*[_type == "translation.metadata"]{ translations[]{ _key, "type": value->_type } }`);

  const documentLevelTypes = new Set<string>();
  const documentLevelLanguages = new Set<string>();
  for (const row of metadataRows) {
    for (const translation of row.translations ?? []) {
      if (typeof translation.type === "string" && translation.type.trim().length > 0) {
        documentLevelTypes.add(translation.type.trim());
      }
      if (typeof translation._key === "string" && translation._key.trim().length > 0) {
        documentLevelLanguages.add(translation._key.trim());
      }
    }
  }

  const types: SanityDocumentTypeSummary[] = [];
  const allLanguages = new Set<string>(documentLevelLanguages);

  for (const typeName of selected) {
    if (isSanityHelperDocumentType(typeName)) {
      continue;
    }

    let i18nMode: SanityI18nMode = "none";
    const languages = new Set<string>();

    if (documentLevelTypes.has(typeName)) {
      i18nMode = "document";
      for (const lang of documentLevelLanguages) {
        languages.add(lang);
      }
      const langRows = await input.client.fetch<Array<{ language?: string }>>(
        `*[_type == $type && defined(language)].language`,
        { type: typeName },
      );
      for (const row of langRows) {
        if (typeof row === "string") {
          languages.add(row);
        } else if (row && typeof row.language === "string") {
          languages.add(row.language);
        }
      }
    } else {
      const samples = await input.client.fetch<Record<string, unknown>[]>(
        `*[_type == $type][0...25]`,
        { type: typeName },
      );
      const sample = samples[0] ?? null;
      if (sampleHasInternationalizedArray(sample)) {
        i18nMode = "field";
        for (const doc of samples) {
          for (const lang of collectInternationalizedArrayLanguages(doc)) {
            languages.add(lang);
          }
        }
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

    const localeTags =
      await input.client.fetch<Array<{ tag?: string }>>(`*[_type == "locale"].tag`);
    for (const row of localeTags) {
      if (row && typeof row.tag === "string" && row.tag.trim()) {
        languages.add(row.tag.trim());
      }
    }

    const languageList = uniqueLanguages([...languages]);
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

  return {
    types,
    languages: uniqueLanguages([...allLanguages]),
  };
}

export async function listSanityDocumentsForImport(input: {
  client: SanityClient;
  documentTypes: readonly string[];
  watermarkIso: string | null;
  includeDrafts: boolean;
}): Promise<Array<Record<string, unknown> & { _id: string; _type: string; _updatedAt?: string }>> {
  const types = input.documentTypes.filter((type) => type !== "translation.metadata");
  if (types.length === 0) {
    return [];
  }
  const filter =
    input.watermarkIso != null
      ? `*[_type in $types && _updatedAt > $watermark && !(_id in path("drafts.**"))]`
      : `*[_type in $types && !(_id in path("drafts.**"))]`;
  const published = await input.client.fetch<
    Array<Record<string, unknown> & { _id: string; _type: string; _updatedAt?: string }>
  >(`${filter} | order(_updatedAt asc) { ... }`, {
    types,
    watermark: input.watermarkIso,
  });

  if (!input.includeDrafts) {
    return published;
  }

  const draftRows = await input.client.fetch<
    Array<Record<string, unknown> & { _id: string; _type: string; _updatedAt?: string }>
  >(`*[_type in $types && _id in path("drafts.**")] | order(_updatedAt asc) { ... }`, { types });
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

export function normalizeSanityPublishedDocumentId(documentId: string): string {
  return documentId.replace(/^drafts\./, "");
}

export async function fetchSanityDocumentById(
  client: SanityClient,
  documentId: string,
): Promise<Record<string, unknown> | null> {
  return client.fetch<Record<string, unknown> | null>(`*[_id == $id][0]`, {
    id: documentId,
  });
}

export async function patchSanityDraftDocument(input: {
  client: SanityClient;
  publishedDocumentId: string;
  document: Record<string, unknown>;
}): Promise<void> {
  const draftId = `drafts.${normalizeSanityPublishedDocumentId(input.publishedDocumentId)}`;
  await input.client.createOrReplace({
    ...input.document,
    _id: draftId,
  } as { _id: string; _type: string });
}

export async function createSanityDraftTranslationDocument(input: {
  client: SanityClient;
  document: Record<string, unknown>;
}): Promise<string> {
  const { _id: _ignored, ...rest } = input.document;
  const created = await input.client.create(rest as { _type: string });
  return normalizeSanityPublishedDocumentId(String(created._id));
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
