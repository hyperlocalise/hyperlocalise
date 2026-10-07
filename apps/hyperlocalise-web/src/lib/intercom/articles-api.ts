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
  parentId: number | null;
  parentType: string | null;
  helpCenterId: string | null;
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

function readLocaleUpdatedAt(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const locales: Record<string, number> = {};
  for (const [locale, content] of Object.entries(value as Record<string, unknown>)) {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
      continue;
    }
    const updatedAt = readNumber((content as { updated_at?: unknown }).updated_at);
    if (updatedAt != null) {
      locales[locale] = updatedAt;
    }
  }
  return locales;
}

function mapArticleSummary(article: Record<string, unknown>): IntercomArticleSummary {
  const helpCenter =
    article.help_center && typeof article.help_center === "object"
      ? (article.help_center as { id?: unknown })
      : null;

  return {
    id: readIdString(article.id),
    title: readString(article.title),
    description: readString(article.description),
    body: readString(article.body),
    state: typeof article.state === "string" ? article.state : null,
    updatedAt: readNumber(article.updated_at),
    authorId: readNumber(article.author_id),
    parentId: readNumber(article.parent_id),
    parentType: typeof article.parent_type === "string" ? article.parent_type : null,
    helpCenterId:
      article.help_center_id != null
        ? readIdString(article.help_center_id)
        : helpCenter
          ? readIdString(helpCenter.id)
          : null,
    localeUpdatedAt: readLocaleUpdatedAt(article.translated_content),
  };
}

export async function listIntercomHelpCenters(
  client: IntercomClient,
): Promise<IntercomHelpCenterSummary[]> {
  const page = await client.helpCenters.list();
  const centers: IntercomHelpCenterSummary[] = [];

  for await (const item of page) {
    const record = item as Record<string, unknown>;
    const localesRaw = record.translated_content;
    const locales =
      localesRaw && typeof localesRaw === "object"
        ? Object.keys(localesRaw as Record<string, unknown>)
        : [];

    const centerId = readIdString(record.id);
    centers.push({
      id: centerId,
      displayName:
        readString(record.display_name) ||
        readString(record.identifier) ||
        (centerId ? `Help Center ${centerId}` : "Help Center"),
      defaultLocale:
        typeof record.default_locale === "string" ? record.default_locale : (locales[0] ?? null),
      locales,
    });
  }

  return centers;
}

export async function listIntercomArticlesSince(input: {
  client: IntercomClient;
  watermarkUpdatedAt: number | null;
  includeDrafts: boolean;
  helpCenterId?: string | null;
  collectionIds?: readonly string[];
}): Promise<IntercomArticleSummary[]> {
  const articles: IntercomArticleSummary[] = [];
  const collectionFilter =
    input.collectionIds && input.collectionIds.length > 0
      ? new Set(input.collectionIds.map((id) => id.trim()))
      : null;

  let page = await input.client.articles.list({ per_page: 50 });
  let stopPaging = false;

  while (!stopPaging) {
    for (const item of page.data) {
      const summary = mapArticleSummary(item as Record<string, unknown>);
      if (!summary.id) {
        continue;
      }

      if (
        input.watermarkUpdatedAt != null &&
        summary.updatedAt != null &&
        summary.updatedAt < input.watermarkUpdatedAt
      ) {
        stopPaging = true;
        break;
      }

      if (
        input.helpCenterId &&
        summary.helpCenterId &&
        summary.helpCenterId !== input.helpCenterId
      ) {
        continue;
      }

      if (!input.includeDrafts && summary.state === "draft") {
        continue;
      }

      if (collectionFilter && summary.parentType === "collection" && summary.parentId != null) {
        if (!collectionFilter.has(String(summary.parentId))) {
          continue;
        }
      }

      articles.push(summary);
    }

    if (stopPaging || !page.hasNextPage()) {
      break;
    }
    page = await page.getNextPage();
  }

  return articles;
}

export async function getIntercomArticle(
  client: IntercomClient,
  articleId: string,
): Promise<IntercomArticleSummary | null> {
  try {
    const article = (await client.articles.find({
      article_id: Number(articleId),
    })) as unknown as Record<string, unknown>;
    const summary = mapArticleSummary(article);
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
  await input.client.articles.update({
    article_id: Number(input.articleId),
    translated_content: {
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
