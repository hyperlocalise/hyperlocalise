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

import type { SanityClient } from "./client";
import { resolveSanityLocaleKey } from "./sanity-locale";
import type {
  SanityLocaleCatalogConfig,
  SanityLocaleCatalogEntry,
  SanityLocaleSource,
} from "./types";

export const DEFAULT_SANITY_LOCALE_CATALOG_CONFIG: SanityLocaleCatalogConfig = {
  documentType: "locale",
  tagField: "tag",
  titleField: "name",
};

export function isValidSanitySchemaFieldName(field: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(field);
}

export function normalizeSanityLocaleCatalogConfig(
  config?: Partial<SanityLocaleCatalogConfig> | null,
): SanityLocaleCatalogConfig {
  return {
    documentType: config?.documentType?.trim() || DEFAULT_SANITY_LOCALE_CATALOG_CONFIG.documentType,
    tagField: config?.tagField?.trim() || DEFAULT_SANITY_LOCALE_CATALOG_CONFIG.tagField,
    titleField: config?.titleField?.trim() || DEFAULT_SANITY_LOCALE_CATALOG_CONFIG.titleField,
  };
}

export function assertSanityLocaleCatalogConfig(config: SanityLocaleCatalogConfig): void {
  if (
    !isValidSanitySchemaFieldName(config.documentType) ||
    !isValidSanitySchemaFieldName(config.tagField) ||
    !isValidSanitySchemaFieldName(config.titleField)
  ) {
    throw new Error("sanity_locale_catalog_config_invalid");
  }
}

function uniqueLocaleCatalogEntries(
  entries: SanityLocaleCatalogEntry[],
): SanityLocaleCatalogEntry[] {
  const byTag = new Map<string, SanityLocaleCatalogEntry>();
  for (const entry of entries) {
    const tag = entry.tag.trim();
    if (!tag) {
      continue;
    }
    const existing = byTag.get(tag);
    if (!existing) {
      byTag.set(tag, { tag, title: entry.title.trim() || tag });
      continue;
    }
    if (!existing.title && entry.title.trim()) {
      byTag.set(tag, { tag, title: entry.title.trim() });
    }
  }
  return [...byTag.values()].toSorted((left, right) => left.tag.localeCompare(right.tag));
}

/** Language tags and titles from the Studio Locales collection. */
export async function listSanityLocaleCatalog(
  client: SanityClient,
  configInput?: Partial<SanityLocaleCatalogConfig> | null,
): Promise<SanityLocaleCatalogEntry[]> {
  const config = normalizeSanityLocaleCatalogConfig(configInput);
  assertSanityLocaleCatalogConfig(config);

  const query = `*[_type == $documentType && defined(${config.tagField}) && !(_id in path("drafts.**"))] | order(${config.tagField} asc) {
    "tag": ${config.tagField},
    "title": coalesce(${config.titleField}, ${config.tagField})
  }`;

  const rows = await client.fetch<Array<{ tag?: string | null; title?: string | null }>>(query, {
    documentType: config.documentType,
  });

  return uniqueLocaleCatalogEntries(
    rows.flatMap((row) => {
      if (typeof row?.tag !== "string" || row.tag.trim().length === 0) {
        return [];
      }
      const tag = row.tag.trim();
      const title =
        typeof row.title === "string" && row.title.trim().length > 0 ? row.title.trim() : tag;
      return [{ tag, title }];
    }),
  );
}

export async function listSanityLocaleTags(
  client: SanityClient,
  configInput?: Partial<SanityLocaleCatalogConfig> | null,
): Promise<string[]> {
  return (await listSanityLocaleCatalog(client, configInput)).map((entry) => entry.tag);
}

export function resolveSanityLanguagesForDocumentType(input: {
  documentType: string;
  languagesByType: Record<string, string[] | undefined>;
  fallbackLanguages: readonly string[];
}): string[] {
  const perType = input.languagesByType[input.documentType];
  if (perType && perType.length > 0) {
    return [...perType];
  }
  return [...input.fallbackLanguages];
}

export function isSanityLocaleSupportedForDocumentType(input: {
  sanityLocale: string;
  documentType: string;
  languagesByType: Record<string, string[] | undefined>;
  fallbackLanguages: readonly string[];
}): boolean {
  const allowed = resolveSanityLanguagesForDocumentType({
    documentType: input.documentType,
    languagesByType: input.languagesByType,
    fallbackLanguages: input.fallbackLanguages,
  });
  return Boolean(resolveSanityLocaleKey(input.sanityLocale, allowed));
}

export function listUnsupportedSanitySourceDocumentTypes(input: {
  sourceLocale: string;
  documentTypes: readonly string[];
  languagesByType: Record<string, string[] | undefined>;
  fallbackLanguages: readonly string[];
  typeLanguages: ReadonlyMap<string, readonly string[]>;
}): string[] {
  const resolvedSource =
    resolveSanityLocaleKey(input.sourceLocale, input.fallbackLanguages) ??
    input.sourceLocale.trim();
  if (!resolvedSource) {
    return [];
  }

  return input.documentTypes.filter((typeName) => {
    const languages =
      input.typeLanguages.get(typeName) ??
      resolveSanityLanguagesForDocumentType({
        documentType: typeName,
        languagesByType: input.languagesByType,
        fallbackLanguages: input.fallbackLanguages,
      });
    if (languages.length === 0) {
      return false;
    }
    return !resolveSanityLocaleKey(resolvedSource, languages);
  });
}

export function pickSanityLocaleSource(
  catalogCount: number,
  inferredCount: number,
): SanityLocaleSource {
  if (catalogCount > 0) {
    return "catalog";
  }
  if (inferredCount > 0) {
    return "inferred";
  }
  return "none";
}
