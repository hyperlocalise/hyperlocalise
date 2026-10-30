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

export type HubspotEmailSummary = {
  id: string;
  name: string;
  language: string | null;
};

export type HubspotEmailRecord = HubspotEmailSummary & {
  subject: string;
  widgets: unknown;
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
  postBody: string;
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
  widgets: unknown;
  layoutSections: unknown;
};

export type HubspotPageDraft = {
  id: string;
  name: string;
  language: string;
  htmlTitle: string;
  metaDescription: string;
  featuredImageAltText: string;
  widgets: unknown;
  layoutSections: unknown;
};

export type HubspotContentClient = {
  listEmails(): Promise<HubspotEmailSummary[]>;
  getEmail(id: string): Promise<HubspotEmailRecord>;
  cloneEmail(input: { id: string; cloneName: string }): Promise<{ id: string }>;
  updateEmailDraft(input: {
    id: string;
    name: string;
    language: string;
    subject: string;
    widgets: unknown;
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
  content?: { widgets?: unknown };
  updatedAt?: Date | string;
};

type BlogLike = {
  id?: string;
  name?: string;
  language?: string;
  translatedFromId?: string;
  htmlTitle?: string;
  metaDescription?: string;
  postBody?: string;
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
  widgets?: unknown;
  layoutSections?: unknown;
};

export type HubspotSdk = {
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

function pageSummary(page: PageLike): HubspotPageSummary {
  return {
    id: page.id ?? "",
    name: page.name ?? "",
    language: page.language ?? null,
    translatedFromId: page.translatedFromId?.trim() ? page.translatedFromId : null,
  };
}

function pageRecord(page: PageLike, id: string): HubspotPageRecord {
  return {
    ...pageSummary(page),
    id: page.id ?? id,
    htmlTitle: page.htmlTitle ?? "",
    metaDescription: page.metaDescription ?? "",
    featuredImageAltText: page.featuredImageAltText ?? "",
    widgets: page.widgets ?? {},
    layoutSections: page.layoutSections ?? {},
  };
}

function bindCmsPages(api: CmsPageApi, failureCode: string) {
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
      const draft = new HubspotPageModel();
      draft.name = input.name;
      draft.language = input.language as HubspotPageModel["language"];
      draft.htmlTitle = input.htmlTitle;
      draft.metaDescription = input.metaDescription;
      draft.featuredImageAltText = input.featuredImageAltText;
      draft.widgets = (input.widgets ?? {}) as HubspotPageModel["widgets"];
      draft.layoutSections = (input.layoutSections ?? {}) as HubspotPageModel["layoutSections"];
      await api.updateDraft(input.id, draft);
    },
  };
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
  );
  const websitePages = bindCmsPages(
    sdk.cms.pages.sitePagesApi,
    "hubspot_website_page_variation_failed",
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
      const post = await blogs.basicApi.getById(id);
      return {
        ...blogSummary(post),
        id: post.id ?? id,
        htmlTitle: post.htmlTitle ?? "",
        metaDescription: post.metaDescription ?? "",
        postBody: post.postBody ?? "",
        updatedAt: readTimestamp(post.updatedAt),
      };
    },
    async createBlogLanguageVariation(input) {
      const request = new BlogPostLanguageCloneRequestVNext();
      request.id = input.id;
      request.language = input.language;
      const created = await blogs.multiLanguageApi.createLangVariation(request);
      if (!created.id) {
        throw new Error("hubspot_blog_variation_failed");
      }
      return { id: created.id };
    },
    async updateBlogDraft(input) {
      const draft = new BlogPost();
      draft.name = input.name;
      draft.htmlTitle = input.htmlTitle;
      draft.metaDescription = input.metaDescription;
      draft.postBody = input.postBody;
      await blogs.basicApi.updateDraft(input.id, draft);
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
  };
}

export function createHubspotContentClient(accessToken: string): HubspotContentClient {
  const sdk = new Client({ accessToken }) as unknown as HubspotSdk;
  return createHubspotContentClientFromSdk(sdk);
}
