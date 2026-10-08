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
import type { IntercomClient } from "intercom-client";

import { toIntercomArticleFields } from "./article-markdown";
import { createIntercomClient } from "./client";
import type { IntercomRestEndpoint } from "./constants";
import type {
  IntercomApiArticle,
  IntercomApiArticleContent,
  IntercomApiArticleSearchResponse,
  IntercomApiArticleTranslatedContent,
  IntercomApiCollection,
  IntercomApiCursorPages,
  IntercomApiHelpCenter,
  IntercomApiId,
  IntercomSdkListPage,
} from "./intercom-api.types";
import { normalizeIntercomLocaleTag } from "./intercom-locale";

export type IntercomHelpCenterSummary = {
  id: string;
  displayName: string;
  defaultLocale: string | null;
  locales: string[];
};

export type IntercomCollectionSummary = {
  id: string;
  name: string;
  helpCenterId: string | null;
  locales: string[];
};

export type IntercomLocaleContent = {
  title: string;
  description: string;
  body: string;
};

export type IntercomArticleSummary = {
  id: string;
  title: string;
  description: string;
  body: string;
  state: string | null;
  updatedAt: number | null;
  authorId: number | null;
  defaultLocale: string | null;
  parentIds: number[];
  localeUpdatedAt: Record<string, number>;
  localeDraftUpdatedAt: Record<string, number>;
  localeContent: Record<string, IntercomLocaleContent>;
};

export class IntercomArticleReadError extends Error {
  readonly articleId: string;

  constructor(articleId: string, cause?: unknown) {
    super("intercom_article_read_failed", { cause });
    this.name = "IntercomArticleReadError";
    this.articleId = articleId;
  }
}

export function createIntercomArticlesClient(input: {
  accessToken: string;
  restEndpoint: IntercomRestEndpoint;
}): IntercomClient {
  return createIntercomClient(input);
}

function intercomIdString(id: IntercomApiId | null | undefined): string {
  if (id == null) {
    return "";
  }
  return String(id);
}

export function parseIntercomNumericId(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readTranslatedLocaleEntries(
  value: IntercomApiArticleTranslatedContent | undefined,
): Array<[string, IntercomApiArticleContent]> {
  if (!value) {
    return [];
  }

  return Object.entries(value).flatMap(([locale, content]) => {
    if (locale === "type" || !content || typeof content === "string") {
      return [];
    }
    return [[locale, content]] as const;
  });
}

function readLocaleTimestampField(
  value: IntercomApiArticleTranslatedContent | undefined,
  field: "updated_at" | "draft_updated_at",
): Record<string, number> {
  const locales: Record<string, number> = {};
  for (const [locale, content] of readTranslatedLocaleEntries(value)) {
    const timestamp = content[field];
    if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
      locales[locale] = timestamp;
    }
  }
  return locales;
}

function readIntercomArticleBody(content: {
  body?: string | null;
  body_markdown?: string | null;
}): string {
  if (typeof content.body_markdown === "string" && content.body_markdown.trim().length > 0) {
    return content.body_markdown;
  }
  return content.body ?? "";
}

function readLocaleContent(
  value: IntercomApiArticleTranslatedContent | undefined,
): Record<string, IntercomLocaleContent> {
  const locales: Record<string, IntercomLocaleContent> = {};
  for (const [locale, content] of readTranslatedLocaleEntries(value)) {
    locales[locale] = {
      title: content.title ?? "",
      description: content.description ?? "",
      body: readIntercomArticleBody(content),
    };
  }
  return locales;
}

export function readIntercomParentIds(
  article: Pick<IntercomApiArticle, "parent_ids" | "parent_id">,
): number[] {
  if (Array.isArray(article.parent_ids)) {
    return article.parent_ids.filter((value) => Number.isFinite(value));
  }

  const legacyParentId = parseIntercomNumericId(article.parent_id);
  return legacyParentId != null ? [legacyParentId] : [];
}

export function mapIntercomArticleSummary(article: IntercomApiArticle): IntercomArticleSummary {
  return {
    id: intercomIdString(article.id),
    title: article.title ?? "",
    description: article.description ?? "",
    body: readIntercomArticleBody(article),
    state: article.state ?? null,
    updatedAt: article.updated_at ?? null,
    authorId: article.author_id ?? null,
    defaultLocale: article.default_locale ?? null,
    parentIds: readIntercomParentIds(article),
    localeUpdatedAt: readLocaleTimestampField(article.translated_content, "updated_at"),
    localeDraftUpdatedAt: readLocaleTimestampField(article.translated_content, "draft_updated_at"),
    localeContent: readLocaleContent(article.translated_content),
  };
}

export function resolveIntercomLocaleRemoteEditedAt(
  article: IntercomArticleSummary,
  locale: string,
): number | null {
  const updatedAt = article.localeUpdatedAt[locale] ?? null;
  const draftUpdatedAt = article.localeDraftUpdatedAt[locale] ?? null;
  if (updatedAt == null) {
    return draftUpdatedAt;
  }
  if (draftUpdatedAt == null) {
    return updatedAt;
  }
  return Math.max(updatedAt, draftUpdatedAt);
}

export function mapIntercomHelpCenterSummary(
  record: IntercomApiHelpCenter,
): IntercomHelpCenterSummary {
  const localesFromField = (record.locales ?? []).filter((locale) => locale.trim().length > 0);
  const localesFromTranslatedContent = record.translated_content
    ? Object.keys(record.translated_content).filter((key) => key !== "type")
    : [];
  const locales = localesFromField.length > 0 ? localesFromField : localesFromTranslatedContent;
  const centerId = intercomIdString(record.id);

  return {
    id: centerId,
    displayName:
      record.display_name?.trim() ||
      record.identifier?.trim() ||
      (centerId ? `Help Center ${centerId}` : "Help Center"),
    defaultLocale: record.default_locale ?? locales[0] ?? null,
    locales,
  };
}

function uniqueLocales(values: Array<string | null | undefined>): string[] {
  const locales: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const locale = value?.trim();
    if (!locale || seen.has(locale)) {
      continue;
    }
    seen.add(locale);
    locales.push(locale);
  }
  return locales;
}

export function mapIntercomCollectionSummary(
  record: IntercomApiCollection,
): IntercomCollectionSummary {
  const id = intercomIdString(record.id);
  const localesFromTranslatedContent = record.translated_content
    ? Object.keys(record.translated_content).filter((key) => key !== "type")
    : [];

  return {
    id,
    name: record.name?.trim() || (id ? `Collection ${id}` : "Collection"),
    helpCenterId: record.help_center_id != null ? String(record.help_center_id) : null,
    locales: uniqueLocales([record.default_locale, ...localesFromTranslatedContent]),
  };
}

export function localesFromIntercomCollections(
  collections: readonly IntercomCollectionSummary[],
): string[] {
  return uniqueLocales(collections.flatMap((collection) => collection.locales));
}

export function articleBelongsToCollections(
  parentIds: readonly number[],
  allowedCollectionIds: ReadonlySet<string>,
): boolean {
  if (allowedCollectionIds.size === 0) {
    return false;
  }
  return parentIds.some((parentId) => allowedCollectionIds.has(String(parentId)));
}

const INTERCOM_LIST_PAGE_CAP = 10;

function hasIntercomPagesNext(pages: IntercomApiCursorPages | null | undefined): boolean {
  const next = pages?.next;
  if (next == null) {
    return false;
  }
  if (typeof next === "string") {
    return next.trim().length > 0;
  }
  return Boolean(next.starting_after?.trim() || next.page != null);
}

function isIntercomSdkListPage<T>(
  page: IntercomSdkListPage<T> | readonly T[],
): page is IntercomSdkListPage<T> {
  return !Array.isArray(page);
}

function readIntercomListPage<T>(page: IntercomSdkListPage<T> | readonly T[]): {
  items: readonly T[];
  pages?: IntercomApiCursorPages | null;
  getNextPage?: () => Promise<IntercomSdkListPage<T>>;
} {
  if (!isIntercomSdkListPage(page)) {
    return { items: page };
  }
  return {
    items: page.data ?? page.response?.data ?? [],
    pages: page.pages ?? page.response?.pages,
    getNextPage: page.getNextPage,
  };
}

async function iterateIntercomListPages<T extends { id?: IntercomApiId }>(
  initialPage: IntercomSdkListPage<T> | readonly T[],
): Promise<T[]> {
  const items: T[] = [];
  const seenIds = new Set<string>();
  let page: IntercomSdkListPage<T> | readonly T[] = initialPage;

  for (let pageCount = 0; pageCount < INTERCOM_LIST_PAGE_CAP; pageCount += 1) {
    const current = readIntercomListPage(page);
    for (const item of current.items) {
      const id = intercomIdString(item.id);
      if (id) {
        if (seenIds.has(id)) {
          continue;
        }
        seenIds.add(id);
      }
      items.push(item);
    }

    if (!hasIntercomPagesNext(current.pages) || !current.getNextPage) {
      break;
    }
    page = await current.getNextPage();
  }

  return items;
}

export async function listIntercomHelpCenters(
  client: IntercomClient,
): Promise<IntercomHelpCenterSummary[]> {
  const page = (await client.helpCenters.list()) as IntercomSdkListPage<IntercomApiHelpCenter>;
  const centers: IntercomHelpCenterSummary[] = [];

  for (const item of await iterateIntercomListPages(page)) {
    const summary = mapIntercomHelpCenterSummary(item);
    if (summary.id) {
      centers.push(summary);
    }
  }

  return centers;
}

export async function listIntercomCollectionsForHelpCenter(input: {
  client: IntercomClient;
  helpCenterId: string;
}): Promise<IntercomCollectionSummary[]> {
  const helpCenterNumericId = parseIntercomNumericId(input.helpCenterId);
  const collections: IntercomCollectionSummary[] = [];
  const page = (await input.client.helpCenters.collections.list()) as
    | IntercomSdkListPage<IntercomApiCollection>
    | IntercomApiCollection[];

  for (const item of await iterateIntercomListPages(page)) {
    const summary = mapIntercomCollectionSummary(item);
    if (!summary.id) {
      continue;
    }
    const collectionHelpCenterId = parseIntercomNumericId(summary.helpCenterId);
    if (
      helpCenterNumericId != null &&
      collectionHelpCenterId != null &&
      collectionHelpCenterId !== helpCenterNumericId
    ) {
      continue;
    }
    collections.push(summary);
  }

  return collections;
}

export async function listIntercomCollectionIdsForHelpCenter(input: {
  client: IntercomClient;
  helpCenterId: string;
}): Promise<string[]> {
  const collections = await listIntercomCollectionsForHelpCenter(input);
  return collections.map((collection) => collection.id);
}

function resolveAllowedCollectionIds(input: {
  helpCenterCollectionIds: readonly string[];
  configuredCollectionIds?: readonly string[];
}): Set<string> {
  const helpCenterIds = new Set(
    input.helpCenterCollectionIds.map((id) => id.trim()).filter(Boolean),
  );
  const configured = (input.configuredCollectionIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (configured.length === 0) {
    return helpCenterIds;
  }
  if (helpCenterIds.size === 0) {
    return new Set(configured);
  }
  return new Set(configured.filter((id) => helpCenterIds.has(id)));
}

async function listArticlesFromUpdatedAtIndex(input: {
  client: IntercomClient;
  watermarkUpdatedAt: number | null;
  includeDrafts: boolean;
}): Promise<IntercomArticleSummary[]> {
  const articles: IntercomArticleSummary[] = [];
  let page = await input.client.articles.list({ per_page: 50 });

  while (true) {
    let reachedWatermark = false;
    for (const item of page.data) {
      const summary = mapIntercomArticleSummary(item as IntercomApiArticle);
      if (!summary.id) {
        continue;
      }

      if (
        input.watermarkUpdatedAt != null &&
        summary.updatedAt != null &&
        summary.updatedAt < input.watermarkUpdatedAt
      ) {
        reachedWatermark = true;
        break;
      }

      if (!input.includeDrafts && summary.state === "draft") {
        continue;
      }

      articles.push(summary);
    }

    if (reachedWatermark || !page.hasNextPage()) {
      break;
    }
    page = await page.getNextPage();
  }

  return articles;
}

function readSearchArticles(response: IntercomApiArticleSearchResponse): IntercomApiArticle[] {
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data?.articles ?? [];
}

function readSearchStartingAfter(response: IntercomApiArticleSearchResponse): string | null {
  const next = response.pages?.next;
  if (typeof next === "string") {
    return next.trim() || null;
  }
  return next?.starting_after?.trim() || null;
}

async function searchArticlesInHelpCenter(input: {
  client: IntercomClient;
  helpCenterId: string;
  includeDrafts: boolean;
}): Promise<IntercomArticleSummary[]> {
  const helpCenterNumericId = parseIntercomNumericId(input.helpCenterId);
  if (helpCenterNumericId == null) {
    return [];
  }

  const summaries: IntercomArticleSummary[] = [];
  const seenIds = new Set<string>();
  let startingAfter: string | undefined;
  let page = (await input.client.articles.search({
    help_center_id: helpCenterNumericId,
    state: input.includeDrafts ? "all" : "published",
    highlight: false,
  })) as IntercomApiArticleSearchResponse;

  for (let pageCount = 0; pageCount < 100; pageCount += 1) {
    for (const article of readSearchArticles(page)) {
      const summary = mapIntercomArticleSummary(article);
      if (!summary.id || seenIds.has(summary.id)) {
        continue;
      }
      seenIds.add(summary.id);
      summaries.push(summary);
    }

    if (page.hasNextPage?.()) {
      if (!page.getNextPage) {
        break;
      }
      page = await page.getNextPage();
      continue;
    }

    startingAfter = readSearchStartingAfter(page) ?? undefined;
    if (!startingAfter) {
      break;
    }
    page = (await input.client.articles.search({
      help_center_id: helpCenterNumericId,
      state: input.includeDrafts ? "all" : "published",
      highlight: false,
      starting_after: startingAfter,
    } as Parameters<IntercomClient["articles"]["search"]>[0])) as IntercomApiArticleSearchResponse;
  }

  return summaries;
}

export async function listIntercomArticlesSince(input: {
  client: IntercomClient;
  watermarkUpdatedAt: number | null;
  includeDrafts: boolean;
  helpCenterId?: string | null;
  collectionIds?: readonly string[];
}): Promise<IntercomArticleSummary[]> {
  const helpCenterId = input.helpCenterId?.trim() || null;
  const helpCenterCollectionIds = helpCenterId
    ? await listIntercomCollectionIdsForHelpCenter({
        client: input.client,
        helpCenterId,
      })
    : [];
  const allowedCollectionIds = resolveAllowedCollectionIds({
    helpCenterCollectionIds,
    configuredCollectionIds: input.collectionIds,
  });
  const configuredCollectionIds = (input.collectionIds ?? [])
    .map((id) => id.trim())
    .filter(Boolean);
  const listed = await listArticlesFromUpdatedAtIndex({
    client: input.client,
    watermarkUpdatedAt: input.watermarkUpdatedAt,
    includeDrafts: input.includeDrafts,
  });

  const scopedFromList = listed.filter((article) => {
    if (configuredCollectionIds.length > 0 || allowedCollectionIds.size > 0) {
      return articleBelongsToCollections(article.parentIds, allowedCollectionIds);
    }
    return !helpCenterId;
  });

  const shouldSearchStandalone = helpCenterId != null && configuredCollectionIds.length === 0;
  if (!shouldSearchStandalone) {
    return scopedFromList;
  }

  const searched = await searchArticlesInHelpCenter({
    client: input.client,
    helpCenterId,
    includeDrafts: input.includeDrafts,
  });
  const seen = new Set(scopedFromList.map((article) => article.id));
  const merged = [...scopedFromList];
  for (const article of searched) {
    if (seen.has(article.id)) {
      continue;
    }
    if (
      article.parentIds.length > 0 &&
      !articleBelongsToCollections(article.parentIds, allowedCollectionIds)
    ) {
      continue;
    }
    if (
      input.watermarkUpdatedAt != null &&
      article.updatedAt != null &&
      article.updatedAt < input.watermarkUpdatedAt
    ) {
      continue;
    }
    seen.add(article.id);
    merged.push(article);
  }

  return merged;
}

function isIntercomNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { status?: unknown; statusCode?: unknown };
  return record.status === 404 || record.statusCode === 404;
}

export async function getIntercomArticle(
  client: IntercomClient,
  articleId: string,
): Promise<IntercomArticleSummary | null> {
  const numericId = parseIntercomNumericId(articleId);
  if (numericId == null) {
    return null;
  }

  try {
    const article = (await client.articles.find({
      article_id: numericId,
    })) as IntercomApiArticle;
    const summary = mapIntercomArticleSummary(article);
    return summary.id ? summary : null;
  } catch (error) {
    if (isIntercomNotFoundError(error)) {
      return null;
    }
    throw new IntercomArticleReadError(articleId, error);
  }
}

export async function loadIntercomArticleForImport(
  client: IntercomClient,
  articleId: string,
): Promise<IntercomArticleSummary> {
  const article = await getIntercomArticle(client, articleId);
  if (!article) {
    throw new Error("intercom_article_not_found");
  }
  return article;
}

export function intercomArticleToImportPayload(
  article: IntercomArticleSummary,
  sourceLocale: string,
) {
  const normalizedSource = normalizeIntercomLocaleTag(sourceLocale);
  const defaultLocale = article.defaultLocale
    ? normalizeIntercomLocaleTag(article.defaultLocale)
    : null;
  const isDefaultLocale = defaultLocale == null || defaultLocale === normalizedSource;

  if (isDefaultLocale) {
    return toIntercomArticleFields({
      title: article.title,
      description: article.description,
      body: article.body,
    });
  }

  const localized =
    article.localeContent[sourceLocale] ?? article.localeContent[normalizedSource] ?? null;
  if (localized && (localized.title.trim().length > 0 || localized.body.trim().length > 0)) {
    return toIntercomArticleFields(localized);
  }

  throw new Error("intercom_source_locale_content_missing");
}

/** Writes a draft locale via `body_markdown` only — mutually exclusive with HTML `body`. */
export async function updateIntercomArticleTranslatedContent(input: {
  client: IntercomClient;
  articleId: string;
  authorId: number | null;
  locale: string;
  title: string;
  description: string;
  body: string;
}): Promise<void> {
  const numericId = parseIntercomNumericId(input.articleId);
  if (numericId == null) {
    throw new Error("intercom_article_id_invalid");
  }

  await input.client.articles.update({
    article_id: numericId,
    translated_content: {
      type: "article_translated_content",
      [input.locale]: {
        type: "article_content",
        title: input.title,
        description: input.description,
        body_markdown: input.body,
        state: "draft",
        ...(input.authorId != null ? { author_id: input.authorId } : {}),
      },
    },
  } as Parameters<IntercomClient["articles"]["update"]>[0]);
}
