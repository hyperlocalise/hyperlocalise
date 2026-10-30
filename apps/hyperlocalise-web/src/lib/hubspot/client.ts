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

import { Client } from "@hubspot/api-client";
import { BlogPost } from "@hubspot/api-client/lib/codegen/cms/blogs/blog_posts/models/BlogPost";
import { BlogPostLanguageCloneRequestVNext } from "@hubspot/api-client/lib/codegen/cms/blogs/blog_posts/models/BlogPostLanguageCloneRequestVNext";
import { ContentLanguageCloneRequestVNext } from "@hubspot/api-client/lib/codegen/cms/pages/models/ContentLanguageCloneRequestVNext";
import { Page as HubspotPageModel } from "@hubspot/api-client/lib/codegen/cms/pages/models/Page";
import { ContentCloneRequestVNext } from "@hubspot/api-client/lib/codegen/marketing/emails/models/ContentCloneRequestVNext";
import { EmailUpdateRequest } from "@hubspot/api-client/lib/codegen/marketing/emails/models/EmailUpdateRequest";
import { PublicEmailContent } from "@hubspot/api-client/lib/codegen/marketing/emails/models/PublicEmailContent";

import { HUBSPOT_LIST_PAGE_SIZE } from "./constants";
import {
  buildBlogContentDocument,
  buildPageDocument,
  hubspotDocumentHasCopy,
  isHubspotJsonObject,
  type HubspotJson,
} from "./document";
import {
  layoutSectionsFromTemplateFiles,
  listDndPartialPaths,
  resolveTemplatePath,
} from "./template-copy";

export type HubspotEmailSummary = {
  id: string;
  name: string;
  language: string | null;
};

export type HubspotEmailRecord = HubspotEmailSummary & {
  subject: string;
  widgets: HubspotJson;
  updatedAt: string | null;
};

export type HubspotBlogSummary = {
  id: string;
  name: string;
  language: string | null;
  translatedFromId: string | null;
};

export type HubspotBlogRecord = HubspotBlogSummary & {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  postBody: string;
  postSummary: string;
  rssSummary: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
  updatedAt: string | null;
};

export type HubspotFormSummary = {
  id: string;
  name: string;
  language: string | null;
};

export type HubspotFormRecord = HubspotFormSummary & {
  definition: Record<string, unknown>;
};

export type HubspotPageSummary = {
  id: string;
  name: string;
  language: string | null;
  translatedFromId: string | null;
};

export type HubspotPageRecord = HubspotPageSummary & {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
};

export type HubspotPageDraft = {
  id: string;
  name: string;
  language: string;
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
};

export type HubspotPageDraftBody = {
  name: string;
  language: string;
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
};

export type HubspotBlogDraftBody = {
  name: string;
  htmlTitle: string;
  metaDescription: string;
  postBody: string;
  featuredImageAltText?: string;
  postSummary?: string;
  rssSummary?: string;
  widgets?: HubspotJson;
  layoutSections?: HubspotJson;
  widgetContainers?: HubspotJson;
};

export type HubspotApiRequestBody =
  | Record<string, string>
  | HubspotPageDraftBody
  | HubspotBlogDraftBody;

export type HubspotContentClient = {
  listEmails(): Promise<HubspotEmailSummary[]>;
  getEmail(id: string): Promise<HubspotEmailRecord>;
  cloneEmail(input: { id: string; cloneName: string }): Promise<{ id: string }>;
  updateEmailDraft(input: {
    id: string;
    name: string;
    language: string;
    subject: string;
    widgets: HubspotJson;
  }): Promise<void>;
  listBlogPosts(): Promise<HubspotBlogSummary[]>;
  getBlogPost(id: string): Promise<HubspotBlogRecord>;
  createBlogLanguageVariation(input: { id: string; language: string }): Promise<{ id: string }>;
  updateBlogDraft(input: {
    id: string;
    name: string;
    htmlTitle: string;
    metaDescription: string;
    postBody: string;
    featuredImageAltText?: string;
    postSummary?: string;
    rssSummary?: string;
    widgets?: HubspotJson;
    layoutSections?: HubspotJson;
    widgetContainers?: HubspotJson;
  }): Promise<void>;
  listForms(): Promise<HubspotFormSummary[]>;
  getForm(id: string): Promise<HubspotFormRecord>;
  createForm(definition: Record<string, unknown>): Promise<{ id: string }>;
  replaceForm(id: string, definition: Record<string, unknown>): Promise<void>;
  listLandingPages(): Promise<HubspotPageSummary[]>;
  getLandingPage(id: string): Promise<HubspotPageRecord>;
  createLandingPageLanguageVariation(input: {
    id: string;
    language: string;
  }): Promise<{ id: string }>;
  updateLandingPageDraft(input: HubspotPageDraft): Promise<void>;
  listWebsitePages(): Promise<HubspotPageSummary[]>;
  getWebsitePage(id: string): Promise<HubspotPageRecord>;
  createWebsitePageLanguageVariation(input: {
    id: string;
    language: string;
  }): Promise<{ id: string }>;
  updateWebsitePageDraft(input: HubspotPageDraft): Promise<void>;
  listMessageTemplates(): Promise<HubspotMessageTemplateSummary[]>;
  getMessageTemplate(id: string): Promise<HubspotMessageTemplateRecord>;
  createMessageTemplate(input: HubspotMessageTemplateDraft): Promise<{ id: string }>;
  updateMessageTemplate(input: HubspotMessageTemplateDraft & { id: string }): Promise<void>;
};

export type HubspotMessageTemplateSummary = {
  id: string;
  name: string;
};

export type HubspotMessageTemplateRecord = HubspotMessageTemplateSummary & {
  subject: string;
  body: string;
  folderId: string | null;
};

export type HubspotMessageTemplateDraft = {
  name: string;
  subject: string;
  body: string;
  folderId?: string | null;
};

type Page<T> = {
  results?: T[];
  paging?: { next?: { after?: string } };
};

type EmailLike = {
  id?: string;
  name?: string;
  language?: string;
  subject?: string;
  content?: { widgets?: HubspotJson };
  updatedAt?: Date | string;
};

type BlogLike = {
  id?: string;
  name?: string;
  language?: string;
  translatedFromId?: string;
  contentGroupId?: string;
  htmlTitle?: string;
  metaDescription?: string;
  featuredImageAltText?: string;
  postBody?: string;
  postSummary?: string;
  rssSummary?: string;
  widgets?: HubspotJson;
  layoutSections?: HubspotJson;
  widgetContainers?: HubspotJson;
  templatePath?: string;
  updatedAt?: Date | string;
};

type FormLike = {
  id?: string;
  name?: string;
  configuration?: { language?: string };
};

type PageLike = {
  id?: string;
  name?: string;
  language?: string;
  translatedFromId?: string;
  htmlTitle?: string;
  metaDescription?: string;
  featuredImageAltText?: string;
  widgets?: HubspotJson;
  layoutSections?: HubspotJson;
  widgetContainers?: HubspotJson;
  templatePath?: string;
};

type HubspotApiResponse = {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
};

export type HubspotSdk = {
  apiRequest?: (opts: {
    method: string;
    path: string;
    body?: HubspotApiRequestBody;
    qs?: Record<string, string>;
    headers?: Record<string, string>;
  }) => Promise<HubspotApiResponse>;
  marketing: {
    emails: {
      marketingEmailsApi: {
        getPage: (
          createdAt?: Date,
          createdAfter?: Date,
          createdBefore?: Date,
          updatedAt?: Date,
          updatedAfter?: Date,
          updatedBefore?: Date,
          sort?: string[],
          after?: string,
          limit?: number,
        ) => Promise<Page<EmailLike>>;
        getById: (emailId: string) => Promise<EmailLike>;
        clone: (request: ContentCloneRequestVNext) => Promise<{ id?: string }>;
        upsertDraft: (emailId: string, request: EmailUpdateRequest) => Promise<unknown>;
      };
    };
    forms: {
      formsApi: {
        getPage: (
          after?: string,
          limit?: number,
        ) => Promise<Page<FormLike & Record<string, unknown>>>;
        getById: (formId: string) => Promise<FormLike & Record<string, unknown>>;
        create: (definition: Record<string, unknown>) => Promise<{ id?: string }>;
        replace: (formId: string, definition: Record<string, unknown>) => Promise<unknown>;
      };
    };
  };
  cms: {
    blogs: {
      blogPosts: {
        basicApi: {
          getPage: (
            createdAt?: Date,
            createdAfter?: Date,
            createdBefore?: Date,
            updatedAt?: Date,
            updatedAfter?: Date,
            updatedBefore?: Date,
            sort?: string[],
            after?: string,
            limit?: number,
          ) => Promise<Page<BlogLike>>;
          getById: (objectId: string) => Promise<BlogLike>;
          updateDraft: (objectId: string, blogPost: BlogPost) => Promise<unknown>;
        };
        multiLanguageApi: {
          createLangVariation: (
            request: BlogPostLanguageCloneRequestVNext,
          ) => Promise<{ id?: string }>;
        };
      };
    };
    pages: {
      landingPagesApi: CmsPageApi;
      sitePagesApi: CmsPageApi;
    };
  };
};

type CmsPageApi = {
  getPage: (
    createdAt?: Date,
    createdAfter?: Date,
    createdBefore?: Date,
    updatedAt?: Date,
    updatedAfter?: Date,
    updatedBefore?: Date,
    sort?: string[],
    after?: string,
    limit?: number,
  ) => Promise<Page<PageLike>>;
  getById: (objectId: string) => Promise<PageLike>;
  createLangVariation: (request: ContentLanguageCloneRequestVNext) => Promise<{ id?: string }>;
  updateDraft: (objectId: string, page: HubspotPageModel) => Promise<unknown>;
};

function readTimestamp(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return value;
}

async function listPages<T>(fetchPage: (after?: string) => Promise<Page<T>>): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const response = await fetchPage(after);
    all.push(...(response.results ?? []));
    after = response.paging?.next?.after;
    if (!after) {
      break;
    }
  }
  return all;
}

function emailSummary(email: EmailLike): HubspotEmailSummary {
  return {
    id: email.id ?? "",
    name: email.name ?? "",
    language: email.language ?? null,
  };
}

function blogSummary(post: BlogLike): HubspotBlogSummary {
  return {
    id: post.id ?? "",
    name: post.name ?? "",
    language: post.language ?? null,
    translatedFromId: post.translatedFromId?.trim() ? post.translatedFromId : null,
  };
}

function blogRecord(post: BlogLike, id: string): HubspotBlogRecord {
  return {
    ...blogSummary(post),
    id: post.id ?? id,
    htmlTitle: post.htmlTitle ?? "",
    metaDescription: post.metaDescription ?? "",
    featuredImageAltText: post.featuredImageAltText ?? "",
    postBody: post.postBody ?? "",
    postSummary: post.postSummary ?? "",
    rssSummary: post.rssSummary ?? "",
    widgets: parseStructuredField(post.widgets),
    layoutSections: parseStructuredField(post.layoutSections),
    widgetContainers: parseStructuredField(post.widgetContainers),
    updatedAt: readTimestamp(post.updatedAt),
  };
}

function blogCopySize(post: BlogLike): number {
  const document = buildBlogContentDocument(blogRecord(post, post.id ?? ""));
  return hubspotDocumentHasCopy(document) ? JSON.stringify(document).length : 0;
}

function blogLayoutHasCopy(post: HubspotBlogRecord): boolean {
  const document = buildBlogContentDocument(post);
  return Boolean(document.layoutSections || document.widgets || document.widgetContainers);
}

function pageSummary(page: PageLike): HubspotPageSummary {
  return {
    id: page.id ?? "",
    name: page.name ?? "",
    language: page.language ?? null,
    translatedFromId: page.translatedFromId?.trim() ? page.translatedFromId : null,
  };
}

function parseStructuredField(value: HubspotJson | undefined): HubspotJson {
  if (typeof value !== "string") {
    return value ?? {};
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return {};
  }
  try {
    const parsed: HubspotJson = JSON.parse(trimmed);
    return isHubspotJsonObject(parsed) || Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pageRecord(page: PageLike, id: string): HubspotPageRecord {
  return {
    ...pageSummary(page),
    id: page.id ?? id,
    htmlTitle: page.htmlTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    featuredImageAltText: page.featuredImageAltText ?? "",
    widgets: parseStructuredField(page.widgets),
    layoutSections: parseStructuredField(page.layoutSections),
    widgetContainers: parseStructuredField(page.widgetContainers),
  };
}

function pageCopySize(page: PageLike): number {
  const document = buildPageDocument({
    htmlTitle: page.htmlTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    featuredImageAltText: page.featuredImageAltText ?? "",
    widgets: parseStructuredField(page.widgets),
    layoutSections: parseStructuredField(page.layoutSections),
    widgetContainers: parseStructuredField(page.widgetContainers),
  });
  if (!hubspotDocumentHasCopy(document)) {
    return 0;
  }
  return JSON.stringify(document).length;
}

function jsonString(record: { [key: string]: HubspotJson }, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

const BLOG_POSTS_PATH = "/cms/v3/blogs/posts";

async function readRawBlog(sdk: HubspotSdk, path: string): Promise<BlogLike | null> {
  if (!sdk.apiRequest) {
    return null;
  }
  const response = await sdk.apiRequest({ method: "GET", path });
  const text = await response.text();
  if (!response.ok || !text) {
    return null;
  }
  try {
    const parsed: HubspotJson = JSON.parse(text);
    if (!isHubspotJsonObject(parsed)) {
      return null;
    }
    return {
      id: jsonString(parsed, "id"),
      name: jsonString(parsed, "name"),
      language: jsonString(parsed, "language"),
      translatedFromId: jsonString(parsed, "translatedFromId"),
      htmlTitle: jsonString(parsed, "htmlTitle"),
      metaDescription: jsonString(parsed, "metaDescription"),
      featuredImageAltText: jsonString(parsed, "featuredImageAltText"),
      postBody: jsonString(parsed, "postBody"),
      postSummary: jsonString(parsed, "postSummary"),
      rssSummary: jsonString(parsed, "rssSummary"),
      widgets: parsed.widgets,
      layoutSections: parsed.layoutSections,
      widgetContainers: parsed.widgetContainers,
      templatePath: jsonString(parsed, "templatePath"),
    };
  } catch {
    return null;
  }
}

async function blogWithTemplateSections(
  sdk: HubspotSdk,
  post: HubspotBlogRecord,
  templatePath: string | undefined,
): Promise<HubspotBlogRecord> {
  if (blogLayoutHasCopy(post)) {
    return post;
  }
  const path = templatePath?.replace(/^\/+/, "").trim();
  if (!path) {
    return post;
  }
  const layoutSections = await layoutSectionsForTemplate(sdk, path);
  if (!layoutSections) {
    return post;
  }
  const withTemplate = { ...post, layoutSections };
  return blogLayoutHasCopy(withTemplate) ? withTemplate : post;
}

async function readRawPage(sdk: HubspotSdk, path: string): Promise<PageLike | null> {
  if (!sdk.apiRequest) {
    return null;
  }
  const response = await sdk.apiRequest({ method: "GET", path });
  const text = await response.text();
  if (!response.ok || !text) {
    return null;
  }
  try {
    const parsed: HubspotJson = JSON.parse(text);
    if (!isHubspotJsonObject(parsed)) {
      return null;
    }
    return {
      id: jsonString(parsed, "id"),
      name: jsonString(parsed, "name"),
      language: jsonString(parsed, "language"),
      translatedFromId: jsonString(parsed, "translatedFromId"),
      htmlTitle: jsonString(parsed, "htmlTitle"),
      metaDescription: jsonString(parsed, "metaDescription"),
      featuredImageAltText: jsonString(parsed, "featuredImageAltText"),
      widgets: parsed.widgets,
      layoutSections: parsed.layoutSections,
      widgetContainers: parsed.widgetContainers,
      templatePath: jsonString(parsed, "templatePath"),
    };
  } catch {
    return null;
  }
}

const TEMPLATE_FILE_LIMIT = 12;

function templateSourceText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed;
  }
  try {
    const parsed: HubspotJson = JSON.parse(trimmed);
    if (isHubspotJsonObject(parsed) && typeof parsed.source === "string") {
      return parsed.source;
    }
  } catch {
    return trimmed;
  }
  return null;
}

async function readTemplateSource(sdk: HubspotSdk, templatePath: string): Promise<string | null> {
  if (!sdk.apiRequest) {
    return null;
  }
  const path = templatePath.replace(/^\/+/, "");
  for (const environment of ["published", "draft"]) {
    const response = await sdk.apiRequest({
      method: "GET",
      path: `/cms/v3/source-code/${environment}/content/${encodeURI(path)}`,
      headers: { Accept: "application/octet-stream" },
    });
    const text = await response.text();
    if (!response.ok || !text.trim()) {
      continue;
    }
    const source = templateSourceText(text);
    if (source) {
      return source;
    }
  }
  return null;
}

async function layoutSectionsForTemplate(
  sdk: HubspotSdk,
  templatePath: string,
): Promise<HubspotJson | null> {
  const files = new Map<string, string>();
  const pending = [templatePath];
  const seen = new Set<string>();
  while (pending.length > 0 && files.size < TEMPLATE_FILE_LIMIT) {
    const path = pending.shift();
    if (!path || seen.has(path)) {
      continue;
    }
    seen.add(path);
    const source = await readTemplateSource(sdk, path);
    if (!source) {
      continue;
    }
    files.set(path, source);
    for (const includePath of listDndPartialPaths(source)) {
      const resolved = resolveTemplatePath(path, includePath);
      if (!seen.has(resolved)) {
        pending.push(resolved);
      }
    }
  }
  if (!files.has(templatePath)) {
    return null;
  }
  const layout = layoutSectionsFromTemplateFiles(files, templatePath);
  return isHubspotJsonObject(layout) && Object.keys(layout).length > 0 ? layout : null;
}

async function pageWithTemplateDefaults(
  sdk: HubspotSdk,
  page: HubspotPageRecord,
  templatePath: string | undefined,
): Promise<HubspotPageRecord> {
  if (hubspotDocumentHasCopy(buildPageDocument(page))) {
    return page;
  }
  const path = templatePath?.replace(/^\/+/, "").trim();
  if (!path) {
    return page;
  }
  const layoutSections = await layoutSectionsForTemplate(sdk, path);
  if (!layoutSections) {
    return page;
  }
  const withTemplate = { ...page, layoutSections };
  return hubspotDocumentHasCopy(buildPageDocument(withTemplate)) ? withTemplate : page;
}

function withPageContent(base: PageLike, content: PageLike): PageLike {
  return {
    ...base,
    htmlTitle: content.htmlTitle ?? base.htmlTitle,
    metaDescription: content.metaDescription ?? base.metaDescription,
    featuredImageAltText: content.featuredImageAltText ?? base.featuredImageAltText,
    widgets: content.widgets ?? base.widgets,
    layoutSections: content.layoutSections ?? base.layoutSections,
    widgetContainers: content.widgetContainers ?? base.widgetContainers,
  };
}

function bindCmsPages(
  api: CmsPageApi,
  failureCode: string,
  collectionPath: string,
  sdk: HubspotSdk,
) {
  return {
    async list() {
      const results = await listPages((after) =>
        api.getPage(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          after,
          HUBSPOT_LIST_PAGE_SIZE,
        ),
      );
      return results.filter((page) => page.id).map(pageSummary);
    },
    async get(id: string) {
      const encodedId = encodeURIComponent(id);
      const published = await readRawPage(sdk, `${collectionPath}/${encodedId}`);
      const draft = await readRawPage(sdk, `${collectionPath}/${encodedId}/draft`);
      if (published || draft) {
        const base = published ?? draft;
        if (!base) {
          return pageRecord(await api.getById(id), id);
        }
        const chosen =
          draft && pageCopySize(draft) > pageCopySize(published ?? draft)
            ? withPageContent(base, draft)
            : base;
        return pageWithTemplateDefaults(sdk, pageRecord(chosen, id), chosen.templatePath);
      }
      return pageRecord(await api.getById(id), id);
    },
    async createLanguageVariation(input: { id: string; language: string }) {
      const request = new ContentLanguageCloneRequestVNext();
      request.id = input.id;
      request.language = input.language;
      const created = await api.createLangVariation(request);
      if (!created.id) {
        throw new Error(failureCode);
      }
      return { id: created.id };
    },
    async updateDraft(input: HubspotPageDraft) {
      const body = {
        name: input.name,
        language: input.language,
        htmlTitle: input.htmlTitle,
        metaDescription: input.metaDescription,
        featuredImageAltText: input.featuredImageAltText,
        widgets: input.widgets ?? {},
        layoutSections: input.layoutSections ?? {},
        widgetContainers: input.widgetContainers ?? {},
      };
      if (!sdk.apiRequest) {
        throw new Error("hubspot_page_draft_failed");
      }
      const response = await sdk.apiRequest({
        method: "PATCH",
        path: `${collectionPath}/${encodeURIComponent(input.id)}/draft`,
        body,
      });
      await response.text();
      if (!response.ok) {
        throw new Error(`hubspot_page_draft_failed:${response.status}`);
      }
    },
  };
}

const MESSAGE_TEMPLATE_COLLECTION = "/automation/email-templates/2026-09";

type MessageTemplateLike = {
  id?: string | number;
  name?: string;
  subject?: string;
  body?: string;
  folderId?: string | null;
};

function messageTemplateId(value: string | number | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" ? value.trim() : "";
}

async function requestMessageTemplate(
  sdk: HubspotSdk,
  opts: {
    method: string;
    path: string;
    body?: Record<string, string>;
    qs?: Record<string, string>;
  },
): Promise<HubspotJson> {
  if (!sdk.apiRequest) {
    throw new Error("hubspot_message_template_request_failed");
  }
  const response = await sdk.apiRequest(opts);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`hubspot_message_template_request_failed:${response.status}`);
  }
  if (!text) {
    return {};
  }
  const parsed: HubspotJson = JSON.parse(text);
  return parsed;
}

function messageTemplateSummary(template: MessageTemplateLike): HubspotMessageTemplateSummary {
  return {
    id: messageTemplateId(template.id),
    name: template.name ?? "",
  };
}

function messageTemplateRecord(
  template: MessageTemplateLike,
  id: string,
): HubspotMessageTemplateRecord {
  return {
    ...messageTemplateSummary(template),
    id: messageTemplateId(template.id) || id,
    subject: template.subject ?? "",
    body: template.body ?? "",
    folderId: template.folderId?.trim() ? template.folderId : null,
  };
}

function messageTemplateWriteBody(input: HubspotMessageTemplateDraft): Record<string, string> {
  const body: Record<string, string> = {
    name: input.name,
    subject: input.subject,
    body: input.body,
  };
  if (input.folderId?.trim()) {
    body.folderId = input.folderId.trim();
  }
  return body;
}

const BLOG_SETTINGS_PATH = "/cms/v3/blog-settings/settings";

function blogVariationSlug(slug: string, language: string): string {
  const base = slug.trim().replace(/^\/+|\/+$/g, "");
  const stem = base.length > 0 ? base : "blog";
  const suffix = `-${language}`;
  return stem.endsWith(suffix) ? stem : `${stem}${suffix}`;
}

function hubspotFailureDetail(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed: HubspotJson = JSON.parse(trimmed);
    if (isHubspotJsonObject(parsed) && typeof parsed.message === "string") {
      return parsed.message.replace(/\s+/g, " ").slice(0, 180);
    }
  } catch {
    return trimmed.replace(/\s+/g, " ").slice(0, 180);
  }
  return trimmed.replace(/\s+/g, " ").slice(0, 180);
}

type BlogSettingsSnapshot = {
  slug: string;
  language: string;
  domainField: string;
  resolvedDomain: string;
};

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname.trim();
  } catch {
    return "";
  }
}

async function readBlogSettings(
  sdk: HubspotSdk,
  blogId: string,
): Promise<BlogSettingsSnapshot | null> {
  if (!sdk.apiRequest) {
    return null;
  }
  const response = await sdk.apiRequest({
    method: "GET",
    path: `${BLOG_SETTINGS_PATH}/${encodeURIComponent(blogId)}`,
  });
  const text = await response.text();
  if (!response.ok || !text) {
    return null;
  }
  try {
    const parsed: HubspotJson = JSON.parse(text);
    if (!isHubspotJsonObject(parsed)) {
      return null;
    }
    const domainField = typeof parsed.domain === "string" ? parsed.domain.trim() : "";
    const absoluteUrl = typeof parsed.absoluteUrl === "string" ? parsed.absoluteUrl : "";
    return {
      slug: typeof parsed.slug === "string" ? parsed.slug : "",
      language: typeof parsed.language === "string" ? parsed.language : "",
      domainField,
      resolvedDomain: domainField || hostnameFromUrl(absoluteUrl),
    };
  } catch {
    return null;
  }
}

type PublishingDomain = {
  domain: string;
  primaryBlogPost: boolean;
  isUsedForBlogPost: boolean;
  isResolving: boolean;
  primarySitePage: boolean;
};

function publishingDomains(payload: HubspotJson): PublishingDomain[] {
  if (!isHubspotJsonObject(payload) || !Array.isArray(payload.results)) {
    return [];
  }
  return payload.results.flatMap((item) => {
    if (!isHubspotJsonObject(item) || typeof item.domain !== "string") {
      return [];
    }
    const domain = item.domain.trim();
    if (!domain) {
      return [];
    }
    return [
      {
        domain,
        primaryBlogPost: item.primaryBlogPost === true,
        isUsedForBlogPost: item.isUsedForBlogPost === true,
        isResolving: item.isResolving !== false,
        primarySitePage: item.primarySitePage === true,
      },
    ];
  });
}

function blogDomainScore(domain: PublishingDomain): number {
  if (!domain.isResolving) {
    return -1;
  }
  let score = 1;
  if (domain.primaryBlogPost) {
    score += 100;
  } else if (domain.isUsedForBlogPost) {
    score += 50;
  } else if (domain.primarySitePage) {
    score += 20;
  }
  if (domain.domain.includes("hubspotpagebuilder")) {
    score += 10;
  }
  if (domain.domain.includes("hs-sites")) {
    score -= 5;
  }
  return score;
}

function chooseBlogDomain(domains: PublishingDomain[]): string {
  let best: PublishingDomain | null = null;
  let bestScore = -1;
  for (const domain of domains) {
    const score = blogDomainScore(domain);
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  return best?.domain ?? "";
}

async function primaryBlogDomain(sdk: HubspotSdk): Promise<string> {
  if (!sdk.apiRequest) {
    return "";
  }
  const response = await sdk.apiRequest({ method: "GET", path: "/cms/v3/domains/" });
  const text = await response.text();
  if (!response.ok || !text) {
    return "";
  }
  try {
    const parsed: HubspotJson = JSON.parse(text);
    return chooseBlogDomain(publishingDomains(parsed));
  } catch {
    return "";
  }
}

async function ensureBlogHasDomain(
  sdk: HubspotSdk,
  blogId: string,
  settings: BlogSettingsSnapshot | null,
): Promise<void> {
  if (!sdk.apiRequest || settings?.domainField) {
    return;
  }
  const domain = settings?.resolvedDomain || (await primaryBlogDomain(sdk));
  if (!domain) {
    return;
  }
  const response = await sdk.apiRequest({
    method: "PATCH",
    path: `${BLOG_SETTINGS_PATH}/${encodeURIComponent(blogId)}`,
    body: { domain },
  });
  await response.text();
}

async function ensureBlogLanguageVariation(input: {
  sdk: HubspotSdk;
  blogId: string;
  language: string;
  primaryLanguage?: string;
}): Promise<void> {
  if (!input.sdk.apiRequest) {
    throw new Error("hubspot_blog_language_failed");
  }
  const blog = await readBlogSettings(input.sdk, input.blogId);
  await ensureBlogHasDomain(input.sdk, input.blogId, blog);
  const primaryLanguage = blog?.language.trim() || input.primaryLanguage?.trim() || "";
  const body: Record<string, string> = {
    id: input.blogId,
    language: input.language,
    slug: blogVariationSlug(blog?.slug ?? "", input.language),
  };
  if (primaryLanguage) {
    body.primaryLanguage = primaryLanguage;
  }
  const response = await input.sdk.apiRequest({
    method: "POST",
    path: `${BLOG_SETTINGS_PATH}/multi-language/create-language-variation`,
    body,
  });
  const text = await response.text();
  if (response.ok || text.toLowerCase().includes("already")) {
    return;
  }
  const detail = hubspotFailureDetail(text);
  throw new Error(
    detail
      ? `hubspot_blog_language_failed:${response.status}: ${detail}`
      : `hubspot_blog_language_failed:${response.status}`,
  );
}

function formSummary(form: FormLike): HubspotFormSummary {
  return {
    id: form.id ?? "",
    name: form.name ?? "",
    language: form.configuration?.language ?? null,
  };
}

export function createHubspotContentClientFromSdk(sdk: HubspotSdk): HubspotContentClient {
  const emails = sdk.marketing.emails.marketingEmailsApi;
  const forms = sdk.marketing.forms.formsApi;
  const blogs = sdk.cms.blogs.blogPosts;
  const landingPages = bindCmsPages(
    sdk.cms.pages.landingPagesApi,
    "hubspot_landing_page_variation_failed",
    "/cms/v3/pages/landing-pages",
    sdk,
  );
  const websitePages = bindCmsPages(
    sdk.cms.pages.sitePagesApi,
    "hubspot_website_page_variation_failed",
    "/cms/v3/pages/site-pages",
    sdk,
  );

  return {
    async listEmails() {
      const results = await listPages((after) =>
        emails.getPage(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          after,
          HUBSPOT_LIST_PAGE_SIZE,
        ),
      );
      return results.filter((email) => email.id).map(emailSummary);
    },
    async getEmail(id) {
      const email = await emails.getById(id);
      return {
        ...emailSummary(email),
        id: email.id ?? id,
        subject: email.subject ?? "",
        widgets: email.content?.widgets ?? {},
        updatedAt: readTimestamp(email.updatedAt),
      };
    },
    async cloneEmail(input) {
      const request = new ContentCloneRequestVNext();
      request.id = input.id;
      request.cloneName = input.cloneName;
      const cloned = await emails.clone(request);
      if (!cloned.id) {
        throw new Error("hubspot_email_clone_failed");
      }
      return { id: cloned.id };
    },
    async updateEmailDraft(input) {
      const request = new EmailUpdateRequest();
      request.name = input.name;
      request.subject = input.subject;
      request.language = input.language as EmailUpdateRequest["language"];
      request.content = new PublicEmailContent();
      request.content.widgets = (input.widgets ?? {}) as PublicEmailContent["widgets"];
      await emails.upsertDraft(input.id, request);
    },
    async listBlogPosts() {
      const results = await listPages((after) =>
        blogs.basicApi.getPage(
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          after,
          HUBSPOT_LIST_PAGE_SIZE,
        ),
      );
      return results.filter((post) => post.id).map(blogSummary);
    },
    async getBlogPost(id) {
      const encodedId = encodeURIComponent(id);
      const [published, draft] = await Promise.all([
        readRawBlog(sdk, `${BLOG_POSTS_PATH}/${encodedId}`),
        readRawBlog(sdk, `${BLOG_POSTS_PATH}/${encodedId}/draft`),
      ]);
      if (published || draft) {
        const base = published ?? draft;
        if (base) {
          const chosen =
            draft && blogCopySize(draft) > blogCopySize(published ?? draft) ? draft : base;
          return blogWithTemplateSections(sdk, blogRecord(chosen, id), chosen.templatePath);
        }
      }
      return blogRecord(await blogs.basicApi.getById(id), id);
    },
    async createBlogLanguageVariation(input) {
      const createPostVariation = async () => {
        const request = new BlogPostLanguageCloneRequestVNext();
        request.id = input.id;
        request.language = input.language;
        const created = await blogs.multiLanguageApi.createLangVariation(request);
        if (!created.id) {
          throw new Error("hubspot_blog_variation_failed");
        }
        return { id: created.id };
      };
      try {
        return await createPostVariation();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("does not have a variation for language")) {
          throw error;
        }
        const post = await blogs.basicApi.getById(input.id);
        const blogId = post.contentGroupId?.trim();
        if (!blogId) {
          throw error;
        }
        await ensureBlogLanguageVariation({
          sdk,
          blogId,
          language: input.language,
          primaryLanguage: post.language,
        });
        return await createPostVariation();
      }
    },
    async updateBlogDraft(input) {
      const body: HubspotBlogDraftBody = {
        name: input.name,
        htmlTitle: input.htmlTitle,
        metaDescription: input.metaDescription,
        postBody: input.postBody,
      };
      if (input.featuredImageAltText !== undefined) {
        body.featuredImageAltText = input.featuredImageAltText;
      }
      if (input.postSummary !== undefined) {
        body.postSummary = input.postSummary;
      }
      if (input.rssSummary !== undefined) {
        body.rssSummary = input.rssSummary;
      }
      if (input.widgets !== undefined) {
        body.widgets = input.widgets;
      }
      if (input.layoutSections !== undefined) {
        body.layoutSections = input.layoutSections;
      }
      if (input.widgetContainers !== undefined) {
        body.widgetContainers = input.widgetContainers;
      }
      if (!sdk.apiRequest) {
        throw new Error("hubspot_blog_draft_failed");
      }
      const response = await sdk.apiRequest({
        method: "PATCH",
        path: `${BLOG_POSTS_PATH}/${encodeURIComponent(input.id)}/draft`,
        body,
      });
      await response.text();
      if (!response.ok) {
        throw new Error(`hubspot_blog_draft_failed:${response.status}`);
      }
    },
    async listForms() {
      const results = await listPages((after) => forms.getPage(after, HUBSPOT_LIST_PAGE_SIZE));
      return results.filter((form) => form.id).map(formSummary);
    },
    async getForm(id) {
      const form = await forms.getById(id);
      return {
        ...formSummary(form),
        id: form.id ?? id,
        definition: { ...form },
      };
    },
    async createForm(definition) {
      const created = await forms.create(definition);
      if (!created.id) {
        throw new Error("hubspot_form_create_failed");
      }
      return { id: created.id };
    },
    async replaceForm(id, definition) {
      await forms.replace(id, definition);
    },
    listLandingPages: () => landingPages.list(),
    getLandingPage: (id) => landingPages.get(id),
    createLandingPageLanguageVariation: (input) => landingPages.createLanguageVariation(input),
    updateLandingPageDraft: (input) => landingPages.updateDraft(input),
    listWebsitePages: () => websitePages.list(),
    getWebsitePage: (id) => websitePages.get(id),
    createWebsitePageLanguageVariation: (input) => websitePages.createLanguageVariation(input),
    updateWebsitePageDraft: (input) => websitePages.updateDraft(input),
    async listMessageTemplates() {
      const results = await listPages((after) =>
        requestMessageTemplate(sdk, {
          method: "GET",
          path: MESSAGE_TEMPLATE_COLLECTION,
          qs: after
            ? { limit: String(HUBSPOT_LIST_PAGE_SIZE), after }
            : { limit: String(HUBSPOT_LIST_PAGE_SIZE) },
        }).then((payload) => payload as Page<MessageTemplateLike>),
      );
      return results
        .filter((template) => messageTemplateId(template.id))
        .map(messageTemplateSummary);
    },
    async getMessageTemplate(id) {
      const template = (await requestMessageTemplate(sdk, {
        method: "GET",
        path: `${MESSAGE_TEMPLATE_COLLECTION}/${encodeURIComponent(id)}`,
      })) as MessageTemplateLike;
      return messageTemplateRecord(template, id);
    },
    async createMessageTemplate(input) {
      const created = (await requestMessageTemplate(sdk, {
        method: "POST",
        path: MESSAGE_TEMPLATE_COLLECTION,
        body: messageTemplateWriteBody(input),
      })) as MessageTemplateLike;
      const createdId = messageTemplateId(created.id);
      if (!createdId) {
        throw new Error("hubspot_message_template_create_failed");
      }
      return { id: createdId };
    },
    async updateMessageTemplate(input) {
      await requestMessageTemplate(sdk, {
        method: "PATCH",
        path: `${MESSAGE_TEMPLATE_COLLECTION}/${encodeURIComponent(input.id)}`,
        body: messageTemplateWriteBody(input),
      });
    },
  };
}

export function createHubspotContentClient(accessToken: string): HubspotContentClient {
  const sdk = new Client({ accessToken }) as unknown as HubspotSdk;
  return createHubspotContentClientFromSdk(sdk);
}
