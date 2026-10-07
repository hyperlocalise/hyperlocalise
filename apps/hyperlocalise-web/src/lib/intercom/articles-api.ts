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

import { createIntercomClient } from "./client";
import type { IntercomRestEndpoint } from "./constants";
import { articleFieldsToJsonPayload } from "./article-json";

export type IntercomHelpCenterSummary = {
  id: string;
  displayName: string;
  defaultLocale: string | null;
  locales: string[];
};

export type IntercomArticleSummary = {
  id: string;
  title: string;
  description: string;
  body: string;
  state: string | null;
  updatedAt: number | null;
  authorId: number | null;
  parentIds: number[];
  localeUpdatedAt: Record<string, number>;
};

export function createIntercomArticlesClient(input: {
  accessToken: string;
  restEndpoint: IntercomRestEndpoint;
}): IntercomClient {
  return createIntercomClient(input);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readIdString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
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

function readLocaleUpdatedAt(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const locales: Record<string, number> = {};
  for (const [locale, content] of Object.entries(value as Record<string, unknown>)) {
    if (locale === "type" || !content || typeof content !== "object" || Array.isArray(content)) {
      continue;
    }
    const updatedAt = readNumber((content as { updated_at?: unknown }).updated_at);
    if (updatedAt != null) {
      locales[locale] = updatedAt;
    }
  }
  return locales;
}

export function readIntercomParentIds(article: Record<string, unknown>): number[] {
  if (Array.isArray(article.parent_ids)) {
    return article.parent_ids.filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
  }

  const legacyParentId = readNumber(article.parent_id);
  return legacyParentId != null ? [legacyParentId] : [];
}

export function mapIntercomArticleSummary(
  article: Record<string, unknown>,
): IntercomArticleSummary {
  return {
    id: readIdString(article.id),
    title: readString(article.title),
    description: readString(article.description),
    body: readString(article.body),
    state: typeof article.state === "string" ? article.state : null,
    updatedAt: readNumber(article.updated_at),
    authorId: readNumber(article.author_id),
    parentIds: readIntercomParentIds(article),
    localeUpdatedAt: readLocaleUpdatedAt(article.translated_content),
  };
}

export function mapIntercomHelpCenterSummary(
  record: Record<string, unknown>,
): IntercomHelpCenterSummary {
  const localesFromField = Array.isArray(record.locales)
    ? record.locales.filter(
        (locale): locale is string => typeof locale === "string" && locale.trim().length > 0,
      )
    : [];
  const localesRaw = record.translated_content;
  const localesFromTranslatedContent =
    localesRaw && typeof localesRaw === "object"
      ? Object.keys(localesRaw as Record<string, unknown>).filter((key) => key !== "type")
      : [];
  const locales = localesFromField.length > 0 ? localesFromField : localesFromTranslatedContent;
  const centerId = readIdString(record.id);
  const defaultLocale =
    typeof record.default_locale === "string" ? record.default_locale : (locales[0] ?? null);

  return {
    id: centerId,
    displayName:
      readString(record.display_name) ||
      readString(record.identifier) ||
      (centerId ? `Help Center ${centerId}` : "Help Center"),
    defaultLocale,
    locales,
  };
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

export async function listIntercomHelpCenters(
  client: IntercomClient,
): Promise<IntercomHelpCenterSummary[]> {
  const page = await client.helpCenters.list();
  const centers: IntercomHelpCenterSummary[] = [];

  for await (const item of page) {
    const summary = mapIntercomHelpCenterSummary(item as Record<string, unknown>);
    if (summary.id) {
      centers.push(summary);
    }
  }

  return centers;
}

export async function listIntercomCollectionIdsForHelpCenter(input: {
  client: IntercomClient;
  helpCenterId: string;
}): Promise<string[]> {
  const helpCenterNumericId = parseIntercomNumericId(input.helpCenterId);
  const collectionIds: string[] = [];
  const page = await input.client.helpCenters.collections.list();

  for await (const item of page) {
    const record = item as unknown as Record<string, unknown>;
    const collectionId = readIdString(record.id);
    if (!collectionId) {
      continue;
    }
    const collectionHelpCenterId =
      readNumber(record.help_center_id) ??
      parseIntercomNumericId(readIdString(record.help_center_id));
    if (
      helpCenterNumericId != null &&
      collectionHelpCenterId != null &&
      collectionHelpCenterId !== helpCenterNumericId
    ) {
      continue;
    }
    collectionIds.push(collectionId);
  }

  return collectionIds;
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
      const summary = mapIntercomArticleSummary(item as Record<string, unknown>);
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

async function searchArticlesInHelpCenter(input: {
  client: IntercomClient;
  helpCenterId: string;
  includeDrafts: boolean;
}): Promise<IntercomArticleSummary[]> {
  const helpCenterNumericId = parseIntercomNumericId(input.helpCenterId);
  if (helpCenterNumericId == null) {
    return [];
  }

  const response = await input.client.articles.search({
    help_center_id: helpCenterNumericId,
    state: input.includeDrafts ? "all" : "published",
    highlight: false,
  });
  const articles = response.data?.articles ?? [];
  return articles
    .map((article) => mapIntercomArticleSummary(article as unknown as Record<string, unknown>))
    .filter((summary) => summary.id.length > 0);
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
    })) as unknown as Record<string, unknown>;
    const summary = mapIntercomArticleSummary(article);
    return summary.id ? summary : null;
  } catch {
    return null;
  }
}

export function intercomArticleToImportPayload(article: IntercomArticleSummary) {
  return articleFieldsToJsonPayload({
    title: article.title,
    description: article.description,
    body: article.body,
  });
}

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
        body: input.body,
        state: "draft",
        ...(input.authorId != null ? { author_id: input.authorId } : {}),
      },
    },
  });
}
