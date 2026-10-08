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

/**
 * Intercom REST API 2.16 shapes we read from Help Center and Articles endpoints.
 * Article `body` is HTML; `body_markdown` is markdown and mutually exclusive on write.
 * Top-level title, description, body, and body_markdown are the default locale.
 * @see https://developers.intercom.com/docs/references/rest-api/api.intercom.io/articles/article
 * @see https://developers.intercom.com/docs/references/rest-api/api.intercom.io/help-center/retrievehelpcenter
 * @see https://developers.intercom.com/docs/references/rest-api/api.intercom.io/help-center/listallcollections
 * @see https://developers.intercom.com/docs/references/rest-api/api.intercom.io/models/starting_after_paging
 */

export type IntercomApiId = string | number;

export type IntercomApiGroupContent = {
  type?: "group_content" | null;
  name?: string;
  description?: string;
};

export type IntercomApiGroupTranslatedContent = {
  type?: "group_translated_content" | null;
  [locale: string]: IntercomApiGroupContent | "group_translated_content" | null | undefined;
};

export type IntercomApiCursorNext = {
  page?: number;
  per_page?: number;
  starting_after?: string | null;
};

export type IntercomApiCursorPages = {
  type?: "pages";
  page?: number;
  per_page?: number;
  total_pages?: number;
  next?: IntercomApiCursorNext | string | null;
};

export type IntercomApiList<T> = {
  type?: "list";
  data: T[];
  pages?: IntercomApiCursorPages | null;
  total_count?: number;
};

export type IntercomSdkListPage<T> = IntercomApiList<T> & {
  hasNextPage?: () => boolean;
  getNextPage?: () => Promise<IntercomSdkListPage<T>>;
  response?: IntercomApiList<T>;
};

export type IntercomApiHelpCenter = {
  type?: "help_center";
  id: IntercomApiId;
  workspace_id?: string;
  created_at?: number;
  updated_at?: number;
  identifier?: string;
  website_turned_on?: boolean;
  display_name?: string;
  url?: string;
  custom_domain?: string | null;
  default?: boolean;
  locales?: string[];
  default_locale?: string;
  translated_content?: IntercomApiGroupTranslatedContent | null;
};

export type IntercomApiCollection = {
  type?: "collection";
  id: IntercomApiId;
  workspace_id?: string;
  name?: string;
  description?: string | null;
  created_at?: number;
  updated_at?: number;
  url?: string | null;
  icon?: string | null;
  order?: number;
  default_locale?: string;
  translated_content?: IntercomApiGroupTranslatedContent | null;
  parent_id?: string | number | null;
  help_center_id?: number | string;
};

export type IntercomApiArticleContent = {
  type?: "article_content";
  title?: string;
  description?: string;
  body?: string;
  body_markdown?: string | null;
  updated_at?: number;
  draft_updated_at?: number | null;
};

export type IntercomApiArticleTranslatedContent = {
  type?: "article_translated_content";
  [locale: string]: IntercomApiArticleContent | "article_translated_content" | null | undefined;
};

export type IntercomApiArticle = {
  id: IntercomApiId;
  title?: string;
  description?: string;
  body?: string;
  body_markdown?: string | null;
  state?: string;
  updated_at?: number;
  author_id?: number;
  default_locale?: string;
  parent_ids?: number[];
  parent_id?: number | string;
  translated_content?: IntercomApiArticleTranslatedContent;
};

export type IntercomApiArticleSearchResponse = {
  data?: IntercomApiArticle[] | { articles?: IntercomApiArticle[] };
  pages?: IntercomApiCursorPages | null;
  hasNextPage?: () => boolean;
  getNextPage?: () => Promise<IntercomApiArticleSearchResponse>;
};
