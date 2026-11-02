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
import { ContentLanguageCloneRequestVNext } from "@hubspot/api-client/lib/codegen/cms/pages/models/ContentLanguageCloneRequestVNext";
import { Page as HubspotPageModel } from "@hubspot/api-client/lib/codegen/cms/pages/models/Page";
import { ContentCloneRequestVNext } from "@hubspot/api-client/lib/codegen/marketing/emails/models/ContentCloneRequestVNext";
import { EmailUpdateRequest } from "@hubspot/api-client/lib/codegen/marketing/emails/models/EmailUpdateRequest";
import { PublicEmailContent } from "@hubspot/api-client/lib/codegen/marketing/emails/models/PublicEmailContent";

import { collectBlogPostStylesCss } from "./blog-stylesheets";
import { HUBSPOT_FORMS_PATH, HUBSPOT_LIST_PAGE_SIZE } from "./constants";
import { asFormDefinition, formLanguage, type HubspotFormDefinition } from "./form-definition";
import {
  findBlogLanguageVariation,
  findBlogSettingsLanguageId,
  type HubspotBlogSettingsMember,
} from "./locale";
import {
  buildBlogContentDocument,
  buildPageDocument,
  collectCopyTree,
  hubspotDocumentHasCopy,
  isHubspotJsonObject,
  type HubspotJson,
} from "./document";
import {
  layoutSectionsFromTemplateFiles,
  listDndPartialPaths,
  listStaticModuleFieldPaths,
  resolveTemplatePath,
  staticModuleWidgetsFromTemplateFiles,
} from "./template-copy";

export type HubspotEmailSummary = {
  id: string;
  name: string;
  language: string | null;
};

export type HubspotEmailRecord = HubspotEmailSummary & {
  subject: string;
  widgets: HubspotJson;
  styleSettings: HubspotJson;
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
  rssBody: string;
  rssSummary: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
  templatePath: string | null;
  attachedStylesheets: HubspotJson[];
  updatedAt: string | null;
};

export type HubspotFormSummary = {
  id: string;
  name: string;
  language: string | null;
};

export type HubspotFormRecord = HubspotFormSummary & {
  definition: HubspotFormDefinition;
  updatedAt: string | null;
};

export type HubspotPageSummary = {
  id: string;
  name: string;
  language: string | null;
  translatedFromId: string | null;
  dynamicPageHubDbTableId: string | null;
};

export type HubspotPageRecord = HubspotPageSummary & {
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: HubspotJson;
  layoutSections: HubspotJson;
  widgetContainers: HubspotJson;
  templatePath: string | null;
  attachedStylesheets: HubspotJson[];
  updatedAt: string | null;
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
  rssBody?: string;
  rssSummary?: string;
  widgets?: HubspotJson;
  layoutSections?: HubspotJson;
  widgetContainers?: HubspotJson;
};

export type HubspotBlogPostCreateBody = {
  name: string;
  slug: string;
  language: string;
  contentGroupId: string;
  translatedFromId: string;
  state: "DRAFT";
};

export type HubspotApiRequestBody =
  | Record<string, string>
  | Record<string, unknown>
  | HubspotFormDefinition
  | HubspotPageDraftBody
  | HubspotBlogDraftBody
  | HubspotBlogPostCreateBody;

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
    styleSettings?: HubspotJson;
  }): Promise<void>;
  listBlogPosts(): Promise<HubspotBlogSummary[]>;
  getBlogPost(id: string): Promise<HubspotBlogRecord>;
  collectBlogPostStylesCss(input: {
    templatePath?: string | null;
    attachedStylesheets?: HubspotJson[] | null;
  }): Promise<string>;
  createBlogPostLanguageDraft(input: {
    id: string;
    language: string;
    name?: string;
  }): Promise<{ id: string }>;
  updateBlogDraft(input: {
    id: string;
    name: string;
    htmlTitle: string;
    metaDescription: string;
    postBody: string;
    featuredImageAltText?: string;
    postSummary?: string;
    rssBody?: string;
    rssSummary?: string;
    widgets?: HubspotJson;
    layoutSections?: HubspotJson;
    widgetContainers?: HubspotJson;
  }): Promise<void>;
  listForms(): Promise<HubspotFormSummary[]>;
  getForm(id: string): Promise<HubspotFormRecord>;
  createForm(definition: HubspotFormDefinition): Promise<{ id: string }>;
  replaceForm(id: string, definition: HubspotFormDefinition): Promise<void>;
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
  collectPageStylesCss(input: {
    templatePath?: string | null;
    attachedStylesheets?: HubspotJson[] | null;
  }): Promise<string>;
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
  content?: { widgets?: HubspotJson; styleSettings?: HubspotJson };
  updatedAt?: Date | string;
};

type BlogLike = {
  id?: string;
  name?: string;
  language?: string;
  translatedFromId?: string;
  contentGroupId?: string;
  slug?: string;
  htmlTitle?: string;
  metaDescription?: string;
  featuredImageAltText?: string;
  postBody?: string;
  postSummary?: string;
  rssBody?: string;
  rssSummary?: string;
  widgets?: HubspotJson;
  layoutSections?: HubspotJson;
  widgetContainers?: HubspotJson;
  templatePath?: string;
  attachedStylesheets?: HubspotJson;
  updatedAt?: Date | string;
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
  attachedStylesheets?: HubspotJson;
  updatedAt?: Date | string;
  updated?: Date | string;
  dynamicPageHubDbTableId?: string;
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

function parseAttachedStylesheets(value: HubspotJson | undefined): HubspotJson[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function blogRecord(post: BlogLike, id: string): HubspotBlogRecord {
  const templatePath = post.templatePath?.trim() ? post.templatePath.trim() : null;
  return {
    ...blogSummary(post),
    id: post.id ?? id,
    htmlTitle: post.htmlTitle ?? "",
    metaDescription: post.metaDescription ?? "",
    featuredImageAltText: post.featuredImageAltText ?? "",
    postBody: post.postBody ?? "",
    postSummary: post.postSummary ?? "",
    rssBody: post.rssBody ?? "",
    rssSummary: post.rssSummary ?? "",
    widgets: parseStructuredField(post.widgets),
    layoutSections: parseStructuredField(post.layoutSections),
    widgetContainers: parseStructuredField(post.widgetContainers),
    templatePath,
    attachedStylesheets: parseAttachedStylesheets(post.attachedStylesheets),
    updatedAt: readTimestamp(post.updatedAt),
  };
}

function blogLayoutHasCopy(post: HubspotBlogRecord): boolean {
  const document = buildBlogContentDocument(post);
  return Boolean(document.layoutSections);
}

function visibleCopyLength(value: string | undefined): number {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim().length;
}

function richerText(primary: string | undefined, secondary: string | undefined): string {
  const left = primary ?? "";
  const right = secondary ?? "";
  return visibleCopyLength(right) > visibleCopyLength(left) ? right : left;
}

function structuredScore(value: HubspotJson | undefined): number {
  const tree = collectCopyTree(parseStructuredField(value));
  return Object.keys(tree).length === 0 ? 0 : JSON.stringify(tree).length;
}

function mergeBlogBuffers(published: BlogLike, draft: BlogLike): BlogLike {
  return {
    ...published,
    htmlTitle: richerText(published.htmlTitle, draft.htmlTitle),
    metaDescription: richerText(published.metaDescription, draft.metaDescription),
    featuredImageAltText: richerText(published.featuredImageAltText, draft.featuredImageAltText),
    postBody: richerText(published.postBody, draft.postBody),
    postSummary: richerText(published.postSummary, draft.postSummary),
    rssBody: richerText(published.rssBody, draft.rssBody),
    rssSummary: richerText(published.rssSummary, draft.rssSummary),
    widgets:
      structuredScore(draft.widgets) > structuredScore(published.widgets)
        ? draft.widgets
        : published.widgets,
    layoutSections:
      structuredScore(draft.layoutSections) > structuredScore(published.layoutSections)
        ? draft.layoutSections
        : published.layoutSections,
    widgetContainers:
      structuredScore(draft.widgetContainers) > structuredScore(published.widgetContainers)
        ? draft.widgetContainers
        : published.widgetContainers,
    templatePath: draft.templatePath || published.templatePath,
    attachedStylesheets: parseAttachedStylesheets(
      Array.isArray(draft.attachedStylesheets)
        ? draft.attachedStylesheets
        : published.attachedStylesheets,
    ),
    name: draft.name || published.name,
    language: draft.language || published.language,
    translatedFromId: published.translatedFromId || draft.translatedFromId,
    id: published.id || draft.id,
  };
}

function pageSummary(page: PageLike): HubspotPageSummary {
  const hubDbId = page.dynamicPageHubDbTableId?.trim() ? page.dynamicPageHubDbTableId.trim() : null;
  return {
    id: page.id ?? "",
    name: page.name ?? "",
    language: page.language ?? null,
    translatedFromId: page.translatedFromId?.trim() ? page.translatedFromId : null,
    dynamicPageHubDbTableId: hubDbId,
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
  const templatePath = page.templatePath?.trim() ? page.templatePath.trim() : null;
  return {
    ...pageSummary(page),
    id: page.id ?? id,
    htmlTitle: page.htmlTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    featuredImageAltText: page.featuredImageAltText ?? "",
    widgets: parseStructuredField(page.widgets),
    layoutSections: parseStructuredField(page.layoutSections),
    widgetContainers: parseStructuredField(page.widgetContainers),
    templatePath,
    attachedStylesheets: parseAttachedStylesheets(page.attachedStylesheets),
    updatedAt: readTimestamp(page.updatedAt ?? page.updated),
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
const BLOG_SETTINGS_PATH = "/cms/v3/blog-settings/settings";

function blogSettingsString(parsed: Record<string, HubspotJson | undefined>, key: string): string {
  const value = parsed[key];
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function blogGroupMembers(payload: HubspotJson): HubspotBlogSettingsMember[] {
  if (!isHubspotJsonObject(payload) || !Array.isArray(payload.results)) {
    return [];
  }
  return payload.results.flatMap((item) => {
    if (!isHubspotJsonObject(item)) {
      return [];
    }
    const id = blogSettingsString(item, "id");
    if (!id) {
      return [];
    }
    return [
      {
        id,
        language: blogSettingsString(item, "language"),
        translatedFromId: blogSettingsString(item, "translatedFromId"),
      },
    ];
  });
}

function nextBlogPage(payload: HubspotJson): string {
  if (!isHubspotJsonObject(payload) || !isHubspotJsonObject(payload.paging)) {
    return "";
  }
  const paging = payload.paging;
  if (!isHubspotJsonObject(paging.next)) {
    return "";
  }
  return blogSettingsString(paging.next, "after");
}

async function listBlogGroupMembers(sdk: HubspotSdk): Promise<HubspotBlogSettingsMember[]> {
  if (!sdk.apiRequest) {
    return [];
  }
  const members: HubspotBlogSettingsMember[] = [];
  let after = "";
  for (let page = 0; page < 20; page += 1) {
    const qs: Record<string, string> = { limit: String(HUBSPOT_LIST_PAGE_SIZE) };
    if (after) {
      qs.after = after;
    }
    const response = await sdk.apiRequest({ method: "GET", path: BLOG_SETTINGS_PATH, qs });
    const text = await response.text();
    if (!response.ok || !text) {
      return members;
    }
    try {
      const parsed: HubspotJson = JSON.parse(text);
      members.push(...blogGroupMembers(parsed));
      after = nextBlogPage(parsed);
    } catch {
      return members;
    }
    if (!after) {
      return members;
    }
  }
  return members;
}

function blogPostVariationSlug(slug: string, language: string): string {
  const base = slug.trim().replace(/^\/+|\/+$/g, "");
  const stem = base.length > 0 ? base : "post";
  const suffix = `-${language}`;
  return stem.endsWith(suffix) ? stem : `${stem}${suffix}`;
}

function isLanguageAlreadyTranslatedError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("409") || lower.includes("language_already_translated");
}

function parseExistingBlogLanguageVariationId(message: string): string | null {
  const candidates = [message];
  const bodyMatch = /Body:\s*(\{[\s\S]*\})/i.exec(message);
  if (bodyMatch?.[1]) {
    candidates.unshift(bodyMatch[1]);
  }
  for (const candidate of candidates) {
    try {
      const parsed: HubspotJson = JSON.parse(candidate);
      if (!isHubspotJsonObject(parsed)) {
        continue;
      }
      const tokens = parsed.errorTokens;
      if (isHubspotJsonObject(tokens) && Array.isArray(tokens.id)) {
        const id = tokens.id.find((value): value is string => typeof value === "string")?.trim();
        if (id) {
          return id;
        }
      }
      const hubspotMessage = typeof parsed.message === "string" ? parsed.message : message;
      const fromMessage = /variation with id:\s*(\d+)/i.exec(hubspotMessage)?.[1];
      if (fromMessage?.trim()) {
        return fromMessage.trim();
      }
    } catch {
      // try the next candidate
    }
  }
  return /variation with id:\s*(\d+)/i.exec(message)?.[1]?.trim() ?? null;
}

function readCreatedBlogPostId(text: string): string {
  try {
    const parsed: HubspotJson = JSON.parse(text);
    if (!isHubspotJsonObject(parsed)) {
      return "";
    }
    return blogSettingsString(parsed, "id");
  } catch {
    return "";
  }
}

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
      contentGroupId: jsonString(parsed, "contentGroupId"),
      slug: jsonString(parsed, "slug"),
      htmlTitle: jsonString(parsed, "htmlTitle"),
      metaDescription: jsonString(parsed, "metaDescription"),
      featuredImageAltText: jsonString(parsed, "featuredImageAltText"),
      postBody: jsonString(parsed, "postBody"),
      postSummary: jsonString(parsed, "postSummary"),
      rssBody: jsonString(parsed, "rssBody"),
      rssSummary: jsonString(parsed, "rssSummary"),
      widgets: parsed.widgets,
      layoutSections: parsed.layoutSections,
      widgetContainers: parsed.widgetContainers,
      templatePath: jsonString(parsed, "templatePath"),
      attachedStylesheets: parsed.attachedStylesheets,
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
  const path = templatePath?.replace(/^\/+/, "").trim();
  if (!path) {
    return post;
  }
  const files = await loadTemplateFiles(sdk, path);
  if (!files.has(path)) {
    return post;
  }
  let next = post;
  if (!blogLayoutHasCopy(post)) {
    const layoutSections = layoutSectionsFromTemplateFiles(files, path);
    if (isHubspotJsonObject(layoutSections) && Object.keys(layoutSections).length > 0) {
      const withTemplate = { ...post, layoutSections };
      if (blogLayoutHasCopy(withTemplate)) {
        next = withTemplate;
      }
    }
  }
  return mergeStaticModuleWidgets(next, staticModuleWidgetsFromTemplateFiles(files, path));
}

function mergeStaticModuleWidgets<T extends { widgets: HubspotJson }>(
  record: T,
  staticWidgets: HubspotJson,
): T {
  if (!isHubspotJsonObject(staticWidgets) || Object.keys(staticWidgets).length === 0) {
    return record;
  }
  const existing = parseStructuredField(record.widgets);
  const merged: { [key: string]: HubspotJson } = { ...staticWidgets };
  if (isHubspotJsonObject(existing)) {
    for (const [key, value] of Object.entries(existing)) {
      merged[key] = value;
    }
  }
  return { ...record, widgets: merged };
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
      attachedStylesheets: parsed.attachedStylesheets,
      updatedAt: jsonString(parsed, "updatedAt") ?? jsonString(parsed, "updated"),
      dynamicPageHubDbTableId: jsonString(parsed, "dynamicPageHubDbTableId"),
    };
  } catch {
    return null;
  }
}

const TEMPLATE_FILE_LIMIT = 24;

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
    if (path.endsWith("/fields.json")) {
      return text.trim();
    }
  }
  return null;
}

async function loadTemplateFiles(
  sdk: HubspotSdk,
  templatePath: string,
): Promise<Map<string, string>> {
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
    for (const fieldPath of listStaticModuleFieldPaths(source, path)) {
      if (!seen.has(fieldPath)) {
        pending.push(fieldPath);
      }
    }
  }
  return files;
}

function pageLayoutHasCopy(page: HubspotPageRecord): boolean {
  const document = buildPageDocument(page);
  return Boolean(document.layoutSections);
}

async function pageWithTemplateDefaults(
  sdk: HubspotSdk,
  page: HubspotPageRecord,
  templatePath: string | undefined,
): Promise<HubspotPageRecord> {
  const path = templatePath?.replace(/^\/+/, "").trim();
  if (!path) {
    return page;
  }
  const files = await loadTemplateFiles(sdk, path);
  if (!files.has(path)) {
    return page;
  }
  let next = page;
  if (!pageLayoutHasCopy(page)) {
    const layoutSections = layoutSectionsFromTemplateFiles(files, path);
    if (isHubspotJsonObject(layoutSections) && Object.keys(layoutSections).length > 0) {
      const withTemplate = { ...page, layoutSections };
      if (pageLayoutHasCopy(withTemplate)) {
        next = withTemplate;
      }
    }
  }
  return mergeStaticModuleWidgets(next, staticModuleWidgetsFromTemplateFiles(files, path));
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
    templatePath: content.templatePath || base.templatePath,
    attachedStylesheets: Array.isArray(content.attachedStylesheets)
      ? content.attachedStylesheets
      : base.attachedStylesheets,
    updatedAt: content.updatedAt ?? content.updated ?? base.updatedAt ?? base.updated,
  };
}

function bindCmsPages(
  api: CmsPageApi,
  failureCode: string,
  collectionPath: string,
  sdk: HubspotSdk,
) {
  const pages = {
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
      const existing = findBlogLanguageVariation(await pages.list(), input.id, input.language);
      if (existing) {
        return { id: existing };
      }
      try {
        const request = new ContentLanguageCloneRequestVNext();
        request.id = input.id;
        request.language = input.language;
        const created = await api.createLangVariation(request);
        if (!created.id) {
          throw new Error(failureCode);
        }
        return { id: created.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isLanguageAlreadyTranslatedError(message)) {
          const existingId = parseExistingBlogLanguageVariationId(message);
          if (existingId) {
            return { id: existingId };
          }
          const listed = findBlogLanguageVariation(await pages.list(), input.id, input.language);
          if (listed) {
            return { id: listed };
          }
        }
        throw error instanceof Error ? error : new Error(failureCode);
      }
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
  return pages;
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

function formRecord(definition: HubspotFormDefinition, fallbackId: string): HubspotFormRecord {
  const id = typeof definition.id === "string" && definition.id.trim() ? definition.id : fallbackId;
  return {
    id,
    name: typeof definition.name === "string" ? definition.name : "",
    language: formLanguage(definition),
    updatedAt: readTimestamp(
      definition.updatedAt instanceof Date || typeof definition.updatedAt === "string"
        ? definition.updatedAt
        : undefined,
    ),
    definition,
  };
}

async function requestFormJson(
  sdk: HubspotSdk,
  opts: {
    method: string;
    path: string;
    body?: HubspotFormDefinition;
    qs?: Record<string, string>;
  },
): Promise<HubspotJson> {
  if (!sdk.apiRequest) {
    throw new Error("hubspot_form_request_failed");
  }
  const response = await sdk.apiRequest(opts);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`hubspot_form_request_failed:${response.status}`);
  }
  if (!text) {
    return {};
  }
  return JSON.parse(text) as HubspotJson;
}

export function createHubspotContentClientFromSdk(sdk: HubspotSdk): HubspotContentClient {
  const emails = sdk.marketing.emails.marketingEmailsApi;
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
      const styleSettings = email.content?.styleSettings;
      return {
        ...emailSummary(email),
        id: email.id ?? id,
        subject: email.subject ?? "",
        widgets: email.content?.widgets ?? {},
        styleSettings:
          styleSettings !== undefined && isHubspotJsonObject(styleSettings) ? styleSettings : {},
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
      if (input.styleSettings !== undefined) {
        request.content.styleSettings = input.styleSettings as PublicEmailContent["styleSettings"];
      }
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
          const chosen = published && draft ? mergeBlogBuffers(published, draft) : base;
          return blogWithTemplateSections(sdk, blogRecord(chosen, id), chosen.templatePath);
        }
      }
      return blogRecord(await blogs.basicApi.getById(id), id);
    },
    async collectBlogPostStylesCss(input) {
      return collectBlogPostStylesCss(sdk, input);
    },
    async createBlogPostLanguageDraft(input) {
      const encodedId = encodeURIComponent(input.id);
      const source =
        (await readRawBlog(sdk, `${BLOG_POSTS_PATH}/${encodedId}`)) ??
        (await readRawBlog(sdk, `${BLOG_POSTS_PATH}/${encodedId}/draft`));
      const contentGroupId = source?.contentGroupId?.trim();
      if (!source || !contentGroupId) {
        throw new Error("hubspot_blog_language_missing");
      }
      const members = await listBlogGroupMembers(sdk);
      const languageBlogId = findBlogSettingsLanguageId(members, contentGroupId, input.language);
      if (!languageBlogId) {
        throw new Error("hubspot_blog_language_missing");
      }
      const existingSummaries = blogs.basicApi?.getPage
        ? (
            await listPages((after) =>
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
            )
          )
            .filter((post) => post.id)
            .map(blogSummary)
        : [];
      const existing = findBlogLanguageVariation(existingSummaries, input.id, input.language);
      if (existing) {
        return { id: existing };
      }
      if (!sdk.apiRequest) {
        throw new Error("hubspot_blog_draft_create_failed");
      }
      const body: HubspotBlogPostCreateBody = {
        name: input.name?.trim() || source.name?.trim() || "Post",
        slug: blogPostVariationSlug(source.slug ?? "", input.language),
        language: input.language,
        contentGroupId: languageBlogId,
        translatedFromId: input.id,
        state: "DRAFT",
      };
      const response = await sdk.apiRequest({
        method: "POST",
        path: BLOG_POSTS_PATH,
        body,
      });
      const text = await response.text();
      if (response.ok) {
        const createdId = readCreatedBlogPostId(text);
        if (!createdId) {
          throw new Error("hubspot_blog_draft_create_failed");
        }
        return { id: createdId };
      }
      if (isLanguageAlreadyTranslatedError(text) || response.status === 409) {
        const existingId = parseExistingBlogLanguageVariationId(text);
        if (existingId) {
          return { id: existingId };
        }
      }
      throw new Error(`hubspot_blog_draft_create_failed:${response.status}`);
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
      if (input.rssBody !== undefined) {
        body.rssBody = input.rssBody;
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
      const results = await listPages((after) =>
        requestFormJson(sdk, {
          method: "GET",
          path: HUBSPOT_FORMS_PATH,
          qs: after
            ? {
                limit: String(HUBSPOT_LIST_PAGE_SIZE),
                after,
                formTypes: "hubspot",
              }
            : { limit: String(HUBSPOT_LIST_PAGE_SIZE), formTypes: "hubspot" },
        }).then((payload) => payload as Page<HubspotFormDefinition>),
      );
      return results
        .filter((form) => typeof form.id === "string" && form.id.trim())
        .map((form) => formRecord(form, ""));
    },
    async getForm(id) {
      const definition = await requestFormJson(sdk, {
        method: "GET",
        path: `${HUBSPOT_FORMS_PATH}/${encodeURIComponent(id)}`,
      });
      if (!isHubspotJsonObject(definition)) {
        throw new Error("hubspot_form_request_failed");
      }
      return formRecord(asFormDefinition(definition), id);
    },
    async createForm(definition) {
      const created = await requestFormJson(sdk, {
        method: "POST",
        path: HUBSPOT_FORMS_PATH,
        body: definition,
      });
      const id =
        isHubspotJsonObject(created) && typeof created.id === "string" ? created.id.trim() : "";
      if (!id) {
        throw new Error("hubspot_form_create_failed");
      }
      return { id };
    },
    async replaceForm(id, definition) {
      await requestFormJson(sdk, {
        method: "PUT",
        path: `${HUBSPOT_FORMS_PATH}/${encodeURIComponent(id)}`,
        body: definition,
      });
    },
    listLandingPages: () => landingPages.list(),
    getLandingPage: (id) => landingPages.get(id),
    createLandingPageLanguageVariation: (input) => landingPages.createLanguageVariation(input),
    updateLandingPageDraft: (input) => landingPages.updateDraft(input),
    listWebsitePages: () => websitePages.list(),
    getWebsitePage: (id) => websitePages.get(id),
    createWebsitePageLanguageVariation: (input) => websitePages.createLanguageVariation(input),
    updateWebsitePageDraft: (input) => websitePages.updateDraft(input),
    async collectPageStylesCss(input) {
      return collectBlogPostStylesCss(sdk, input);
    },
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
